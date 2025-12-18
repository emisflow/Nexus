import pkg from "bullmq";
const { Queue, Worker, QueueEvents } = pkg;

import type { Job, JobsOptions, Queue as QueueType } from "bullmq";

import IORedis from "ioredis";
import { sendPushNotification } from "../push/onesignal.js";
import { getReminder, computeNextRun, markLastSent, setNextRun } from "../db/reminders.js";
import { logJob } from "../db/jobLogs.js";
import { getTokensForUser } from "../db/notifications.js";

const redisUrl =
  process.env.UPSTASH_REDIS_URL ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});


export type ReminderJobData = { reminderId: string };

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 500 },
  removeOnComplete: true,
  removeOnFail: false,
};

// Single queue instance reused by API routes and workers
const remindersQueue = new Queue<ReminderJobData>("reminders", {
  connection: redisConnection,
  defaultJobOptions,
});

export function createQueues() {
  // ✅ BullMQ v2+ does NOT need QueueScheduler
  return { reminders: remindersQueue };
}

export async function scheduleReminder(
  queue: QueueType<ReminderJobData>,
  payload: ReminderJobData,
  runAt: Date
) {
  const delay = Math.max(runAt.getTime() - Date.now(), 0);

  // optional: remove existing job with same id (safe)
  await queue.remove(payload.reminderId);

  await queue.add("reminder.fire", payload, {
    delay,
    jobId: payload.reminderId,
  });
}

async function processReminder(job: Job<ReminderJobData>) {
  const reminder = await getReminder(job.data.reminderId);

  if (!reminder || !reminder.enabled) {
    await logJob({ jobType: "reminder.fire", status: "failed", error: "Reminder disabled or missing" });
    return;
  }

  const tokens = await getTokensForUser(reminder.user_id);

  try {
    await sendPushNotification({ userId: reminder.user_id, message: reminder.type, tokens });
    await markLastSent(reminder.id);
    await logJob({ jobType: "reminder.fire", status: "success", userId: reminder.user_id });
  } catch (error) {
    await logJob({
      jobType: "reminder.fire",
      status: "failed",
      userId: reminder.user_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }

  const nextRun = computeNextRun({
    hour: reminder.hour,
    minute: reminder.minute,
    timezone: reminder.timezone,
  });

  await setNextRun(reminder.id, nextRun);
  await scheduleReminder(remindersQueue, { reminderId: reminder.id }, nextRun);
}

export function startWorkers() {
  console.log(`[Worker] Connecting to Redis at ${redisUrl}`);

  const reminderWorker = new Worker<ReminderJobData>("reminders", processReminder, {
    connection: redisConnection,
  });

  const events = new QueueEvents("reminders", { connection: redisConnection });

  reminderWorker.on("failed", (job, err) => console.error(`[Worker] Job ${job?.id} failed`, err));
  reminderWorker.on("completed", (job) => console.log(`[Worker] Job ${job.id} completed`));
  events.on("stalled", ({ jobId }) => console.warn(`[QueueEvents] Job ${jobId} stalled`));

  return { reminderWorker, events };
}
