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

let redisConnection: IORedis | null = null;
function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return redisConnection;
}


export type ReminderJobData = { reminderId: string };

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 500 },
  removeOnComplete: true,
  removeOnFail: false,
};

let remindersQueue: QueueType<ReminderJobData> | null = null;

function getReminderQueue() {
  if (!remindersQueue) {
    remindersQueue = new Queue<ReminderJobData>("reminders", {
      connection: getRedisConnection(),
      defaultJobOptions,
    });
  }

  return remindersQueue;
}

export function createQueues() {
  // ✅ BullMQ v2+ does NOT need QueueScheduler
  return { reminders: getReminderQueue() };
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

export type ReminderJobDependencies = {
  getReminder: typeof getReminder;
  getTokensForUser: typeof getTokensForUser;
  sendPushNotification: typeof sendPushNotification;
  markLastSent: typeof markLastSent;
  logJob: typeof logJob;
  computeNextRun: typeof computeNextRun;
  setNextRun: typeof setNextRun;
  scheduleReminder: (payload: ReminderJobData, runAt: Date) => Promise<void>;
};

const defaultDeps: ReminderJobDependencies = {
  getReminder,
  getTokensForUser,
  sendPushNotification,
  markLastSent,
  logJob,
  computeNextRun,
  setNextRun,
  scheduleReminder: (payload, runAt) => scheduleReminder(getReminderQueue(), payload, runAt),
};

export async function processReminderJob(
  reminderId: string,
  deps: Partial<ReminderJobDependencies> = {}
) {
  const ctx = { ...defaultDeps, ...deps } satisfies ReminderJobDependencies;
  const reminder = await ctx.getReminder(reminderId);

  if (!reminder || !reminder.enabled) {
    await ctx.logJob({ jobType: "reminder.fire", status: "failed", error: "Reminder disabled or missing" });
    return { status: "skipped" as const };
  }

  const tokens = await ctx.getTokensForUser(reminder.user_id);

  try {
    await ctx.sendPushNotification({ userId: reminder.user_id, message: reminder.type, tokens });
    await ctx.markLastSent(reminder.id);
    await ctx.logJob({ jobType: "reminder.fire", status: "success", userId: reminder.user_id });
  } catch (error) {
    await ctx.logJob({
      jobType: "reminder.fire",
      status: "failed",
      userId: reminder.user_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }

  const nextRun = ctx.computeNextRun({
    hour: reminder.hour,
    minute: reminder.minute,
    timezone: reminder.timezone,
  });

  await ctx.setNextRun(reminder.id, nextRun);
  await ctx.scheduleReminder({ reminderId: reminder.id }, nextRun);

  return { status: "scheduled" as const, nextRun };
}

export function startWorkers() {
  console.log(`[Worker] Connecting to Redis at ${redisUrl}`);

  const reminderWorker = new Worker<ReminderJobData>(
    "reminders",
    (job: Job<ReminderJobData>) => processReminderJob(job.data.reminderId),
    {
      connection: getRedisConnection(),
    }
  );

  const events = new QueueEvents("reminders", { connection: getRedisConnection() });

  reminderWorker.on("failed", (job, err) => console.error(`[Worker] Job ${job?.id} failed`, err));
  reminderWorker.on("completed", (job) => console.log(`[Worker] Job ${job.id} completed`));
  events.on("stalled", ({ jobId }) => console.warn(`[QueueEvents] Job ${jobId} stalled`));

  return { reminderWorker, events };
}
