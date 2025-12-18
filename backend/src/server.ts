import 'dotenv/config';
import express from 'express';
import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { createQueues, scheduleReminder } from './jobs/queues.js';

declare global {
  namespace Express {
    interface Request {
      auth: {
        userId?: string;
      } | null;
    }
  }
}
import { sendPushNotification } from './push/onesignal.js';
import { ensureUser } from './db/users.js';
import { upsertReminder, listReminders, computeNextRun, disableReminder, getReminder } from './db/reminders.js';
import { upsertNotificationToken, getTokensForUser } from './db/notifications.js';
import {
  listEntries,
  upsertEntryWithConflict,
  listConflicts,
  resolveConflict,
  getEntryWithConflicts,
} from './db/entries.js';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());
app.use(clerkMiddleware());

const queues = createQueues();

app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok' });
});

app.post('/api/me/ensure', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;

  if (!userId) {
    res.status(400).json({ error: 'Missing user context' });
    return;
  }

  const user = await ensureUser(userId);
  res.json({ ensured: true, userId: user.id });
});

app.get('/api/me', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await ensureUser(userId);
  res.json({ userId: user.id });
});

app.get('/api/reminders', requireAuth(), async (_req, res) => {
  const clerkUserId = _req.auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await ensureUser(clerkUserId);
  const reminders = await listReminders(user.id);
  res.json({ reminders });
});

app.post('/api/reminders', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const { id, type, hour, minute, timezone, enabled } = req.body as {
    id?: string;
    type: string;
    hour: number;
    minute: number;
    timezone?: string;
    enabled?: boolean;
  };

  if (!userId) {
    res.status(400).json({ error: 'Missing user context' });
    return;
  }

  if (!type || typeof hour !== 'number' || typeof minute !== 'number') {
    res.status(400).json({ error: 'type, hour, and minute are required' });
    return;
  }

  const user = await ensureUser(userId);
  const nextRun = computeNextRun({ hour, minute, timezone });
  const reminder = await upsertReminder({
    id,
    userId: user.id,
    type,
    hour,
    minute,
    timezone,
    enabled,
    nextRunAt: nextRun.toISOString(),
  });

  if (reminder.enabled && reminder.next_run_at) {
    await scheduleReminder(queues.reminders, { reminderId: reminder.id }, new Date(reminder.next_run_at));
  } else {
    await queues.reminders.remove(reminder.id);
  }

  res.json({ reminder });
});

app.delete('/api/reminders/:id', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const reminderId = req.params.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await ensureUser(userId);
  const reminder = await getReminder(reminderId);

  if (!reminder || reminder.user_id !== user.id) {
    res.status(404).json({ error: 'Reminder not found' });
    return;
  }

  await disableReminder(reminderId, user.id);
  await queues.reminders.remove(reminderId);

  res.json({ disabled: true });
});

app.post('/api/notifications/register', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const { token, platform } = req.body as { token?: string; platform?: string };

  if (!userId) {
    res.status(400).json({ error: 'Missing user context' });
    return;
  }

  if (!token || !platform) {
    res.status(400).json({ error: 'token and platform are required' });
    return;
  }

  const user = await ensureUser(userId);
  const stored = await upsertNotificationToken({ userId: user.id, token, platform });
  res.json({ registered: true, token: stored });
});

app.post('/api/entries', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;

  if (!userId) {
    res.status(400).json({ error: 'Missing user context' });
    return;
  }

  await ensureUser(userId);

  const { entryDate, templateId, journalText, metrics, habits, baseUpdatedAt } = req.body as {
    entryDate?: string;
    templateId?: string;
    journalText?: string;
    metrics?: { key: string; value_num?: number; value_text?: string }[];
    habits?: { habitId: string; completed: boolean }[];
    baseUpdatedAt?: string;
  };

  if (!entryDate) {
    res.status(400).json({ error: 'entryDate is required (YYYY-MM-DD)' });
    return;
  }

  const result = await upsertEntryWithConflict({
    userId,
    entryDate,
    templateId,
    journalText,
    metrics,
    habits,
    baseUpdatedAt,
  });

  res.json({ entry: result.entry, conflictId: result.conflictId });
});

app.get('/api/entries', requireAuth(), async (_req, res) => {
  const userId = _req.auth?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await ensureUser(userId);
  const { from, to } = _req.query as { from?: string; to?: string };
  const entries = await listEntries({ userId: user.id, from, to });
  res.json({ entries });
});

app.get('/api/entries/:id', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const entryId = req.params.id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await ensureUser(userId);
  const result = await getEntryWithConflicts(entryId, user.id);

  if (!result.entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  res.json(result);
});

app.get('/api/conflicts', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await ensureUser(userId);
  const conflicts = await listConflicts(user.id);
  res.json({ conflicts });
});

app.post('/api/conflicts/:id/resolve', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const { action, mergedText } = req.body as { action?: string; mergedText?: string };

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!action || !['keep_current', 'use_other', 'merge_manual'].includes(action)) {
    res.status(400).json({ error: 'action must be keep_current, use_other, or merge_manual' });
    return;
  }

  try {
    const result = await resolveConflict({
      conflictId: req.params.id,
      userId,
      action: action as 'keep_current' | 'use_other' | 'merge_manual',
      mergedText,
    });

    if (!result.resolved) {
      res.status(404).json({ error: 'Conflict not found' });
      return;
    }

    res.json({ resolved: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to resolve conflict' });
  }
});

app.post('/notifications/instant', requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const { message } = req.body as { message?: string };

  if (!userId) {
    res.status(400).json({ error: 'Missing user context for push notification' });
    return;
  }

  if (!message) {
    res.status(400).json({ error: 'Missing message' });
    return;
  }

  const user = await ensureUser(userId);
  const tokens = await getTokensForUser(user.id);
  await sendPushNotification({ userId: user.id, message, tokens });
  res.json({ sent: true });
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
