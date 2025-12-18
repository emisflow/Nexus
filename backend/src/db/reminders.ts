import { DateTime } from 'luxon';
import { pool } from './client.js';

export type ReminderInput = {
  id?: string;
  userId: string;
  type: string;
  hour: number;
  minute: number;
  timezone?: string;
  enabled?: boolean;
  nextRunAt?: string | null;
};

export type ReminderRow = {
  id: string;
  user_id: string;
  type: string;
  timezone: string;
  hour: number;
  minute: number;
  enabled: boolean;
  next_run_at: string | null;
  last_sent_at: string | null;
  created_at: string;
};

export function computeNextRun({
  hour,
  minute,
  timezone = 'UTC',
  from,
}: {
  hour: number;
  minute: number;
  timezone?: string;
  from?: Date;
}): Date {
  const now = from ? DateTime.fromJSDate(from, { zone: timezone }) : DateTime.now().setZone(timezone);
  let next = now.set({ hour, minute, second: 0, millisecond: 0 });

  if (next <= now) {
    next = next.plus({ days: 1 });
  }

  return next.toJSDate();
}

export async function upsertReminder(input: ReminderInput): Promise<ReminderRow> {
  const {
    id,
    userId,
    type,
    hour,
    minute,
    timezone = 'UTC',
    enabled = true,
    nextRunAt,
  } = input;

  const nextRun = nextRunAt
    ? new Date(nextRunAt)
    : computeNextRun({ hour, minute, timezone });

  const result = await pool.query<ReminderRow>(
    `INSERT INTO reminders (id, user_id, type, timezone, hour, minute, enabled, next_run_at)
     VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id)
     DO UPDATE SET type = EXCLUDED.type, timezone = EXCLUDED.timezone, hour = EXCLUDED.hour,
       minute = EXCLUDED.minute, enabled = EXCLUDED.enabled, next_run_at = EXCLUDED.next_run_at
     RETURNING *`,
    [id ?? null, userId, type, timezone, hour, minute, enabled, nextRun]
  );

  return result.rows[0];
}

export async function listReminders(userId: string): Promise<ReminderRow[]> {
  const result = await pool.query<ReminderRow>(
    `SELECT * FROM reminders WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function getReminder(reminderId: string): Promise<ReminderRow | null> {
  const result = await pool.query<ReminderRow>(
    `SELECT * FROM reminders WHERE id = $1`,
    [reminderId]
  );

  return result.rows[0] ?? null;
}

export async function markLastSent(reminderId: string) {
  await pool.query(`UPDATE reminders SET last_sent_at = now() WHERE id = $1`, [reminderId]);
}

export async function setNextRun(reminderId: string, nextRunAt: Date | null) {
  await pool.query(`UPDATE reminders SET next_run_at = $2 WHERE id = $1`, [reminderId, nextRunAt]);
}

export async function disableReminder(reminderId: string, userId: string): Promise<ReminderRow | null> {
  const result = await pool.query<ReminderRow>(
    `UPDATE reminders
     SET enabled = false, next_run_at = NULL
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [reminderId, userId]
  );

  return result.rows[0] ?? null;
}
