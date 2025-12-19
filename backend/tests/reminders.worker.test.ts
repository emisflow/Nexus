import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Prepare in-memory pg and mock the pg module before importing code that creates pools.
const { mem } = vi.hoisted(() => {
  const { newDb } = require('pg-mem');
  const { randomUUID } = require('crypto');
  const { readFileSync } = require('fs');
  const path = require('path');

  const memDb = newDb({ autoCreateForeignKeyIndices: true });

  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: randomUUID,
  });

  const migrationSql = readFileSync(path.join(__dirname, '../src/db/migrations/001_init.sql'), 'utf8').replace(
    /CREATE EXTENSION[^;]+;/g,
    ''
  );
  memDb.public.none(migrationSql);

  return { mem: memDb };
});

vi.mock('pg', () => {
  const pg = mem.adapters.createPg();
  return { Pool: pg.Pool };
});

// Import after mocks
import { pool } from '../src/db/client.js';
import { upsertReminder, getReminder } from '../src/db/reminders.js';
import { processReminderJob } from '../src/jobs/queues.js';

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('reminder worker', () => {
  beforeEach(async () => {
    await pool.query('TRUNCATE job_logs');
  });

  beforeAll(async () => {
    await pool.query('INSERT INTO users (id, clerk_user_id) VALUES ($1, $2)', [userId, 'clerk_user']);
    await pool.query(
      'INSERT INTO notification_tokens (id, user_id, provider, token, platform) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), userId, 'onesignal', 'test-token', 'web']
    );
  });

  it('sends push, logs, and schedules the next run', async () => {
    const reminder = await upsertReminder({
      userId,
      type: 'daily_checkin',
      hour: 9,
      minute: 30,
      timezone: 'UTC',
      enabled: true,
    });

    const sendPushNotification = vi.fn().mockResolvedValue(undefined);
    const scheduleReminder = vi.fn().mockResolvedValue(undefined);

    const result = await processReminderJob(reminder.id, {
      sendPushNotification,
      scheduleReminder: (payload, runAt) => scheduleReminder(payload, runAt),
    });

    expect(result?.status).toBe('scheduled');
    expect(sendPushNotification).toHaveBeenCalledWith({
      userId,
      message: 'daily_checkin',
      tokens: ['test-token'],
    });
    expect(scheduleReminder).toHaveBeenCalled();

    const logRows = await pool.query('SELECT status FROM job_logs WHERE job_type = $1', ['reminder.fire']);
    expect(logRows.rows.some((row) => row.status === 'success')).toBe(true);

    const updated = await getReminder(reminder.id);
    expect(updated?.last_sent_at).not.toBeNull();
    expect(updated?.next_run_at).not.toBeNull();
  });

  it('records a failed log when reminder is missing or disabled', async () => {
    const reminder = await upsertReminder({
      userId,
      type: 'disabled_checkin',
      hour: 7,
      minute: 0,
      timezone: 'UTC',
      enabled: false,
    });

    const sendPushNotification = vi.fn();
    const scheduleReminder = vi.fn();

    const result = await processReminderJob(reminder.id, {
      sendPushNotification,
      scheduleReminder: (payload, runAt) => scheduleReminder(payload, runAt),
    });

    expect(result?.status).toBe('skipped');
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(scheduleReminder).not.toHaveBeenCalled();

    const logRows = await pool.query(
      "SELECT status, error FROM job_logs WHERE job_type = 'reminder.fire' ORDER BY created_at DESC LIMIT 1"
    );
    expect(logRows.rows[0].status).toBe('failed');
    expect(logRows.rows[0].error).toBe('Reminder disabled or missing');
  });
});
