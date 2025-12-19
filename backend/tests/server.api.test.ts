import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from './testDb.js';
import { pool } from '../src/db/client.js';

const scheduleReminderMock = vi.fn();
const habitId = '00000000-0000-0000-0000-000000000123';

vi.mock('../src/jobs/queues.js', () => {
  return {
    createQueues: () => ({ reminders: { add: vi.fn(), remove: vi.fn() } }),
    scheduleReminder: (...args: any[]) => scheduleReminderMock(...args),
  };
});

vi.mock('../src/push/onesignal.js', () => ({
  sendPushNotification: vi.fn(),
}));

vi.mock('@clerk/express', () => {
  const attachAuth = (req: any) => {
    const header = req.headers['x-user'];
    const userHeader = Array.isArray(header) ? header[0] : header;
    req.auth = { userId: userHeader === 'none' ? undefined : userHeader ?? 'test-user' };
  };

  return {
    clerkMiddleware: () => (req: any, _res: any, next: any) => {
      attachAuth(req);
      next();
    },
    requireAuth: () => (req: any, _res: any, next: any) => {
      attachAuth(req);
      next();
    },
    getAuth: () => ({ userId: 'test-user' }),
  };
});

// Import after mocks
import { app } from '../src/server.js';

const today = new Date().toISOString().slice(0, 10);

describe('API routes', () => {
  beforeEach(async () => {
    resetDb();
    vi.clearAllMocks();
  });

  it('creates entries and returns analytics summaries', async () => {
    const createResp = await request(app)
      .post('/api/entries')
      .send({
        entryDate: today,
        journalText: 'Feeling great',
        metrics: [{ key: 'mood', value_num: 8 }],
        habits: [{ habitId, completed: true }],
      });

    expect(createResp.status).toBe(200);
    expect(createResp.body.entry.entry_date.startsWith(today)).toBe(true);

    const listResp = await request(app).get('/api/entries');
    expect(listResp.status).toBe(200);
    expect(listResp.body.entries).toHaveLength(1);
    expect(listResp.body.entries[0].metrics[0]).toMatchObject({ key: 'mood', value_num: 8 });
    expect(listResp.body.entries[0].habits[0]).toMatchObject({ habit_id: habitId, completed: true });

    const analyticsResp = await request(app).get('/api/analytics');
    expect(analyticsResp.status).toBe(200);
    expect(analyticsResp.body.last7.entryCount).toBe(1);
    expect(analyticsResp.body.last7.metrics[0]).toMatchObject({ key: 'mood', average: 8, samples: 1 });
    expect(analyticsResp.body.last7.habits[0]).toMatchObject({ habit_id: habitId, completion_rate: 1 });
  });

  it('registers notification tokens for the current user', async () => {
    const resp = await request(app)
      .post('/api/notifications/register')
      .send({ token: 'abc123', platform: 'web' });

    expect(resp.status).toBe(200);
    expect(resp.body.registered).toBe(true);

    const tokens = await pool.query('SELECT token, platform FROM notification_tokens');
    expect(tokens.rows[0]).toMatchObject({ token: 'abc123', platform: 'web' });
  });

  it('creates reminders and schedules jobs', async () => {
    const resp = await request(app)
      .post('/api/reminders')
      .send({ type: 'daily_checkin', hour: 9, minute: 0, timezone: 'UTC' });

    expect(resp.status).toBe(200);
    expect(resp.body.reminder.id).toBeDefined();
    expect(scheduleReminderMock).toHaveBeenCalled();

    const listResp = await request(app).get('/api/reminders');
    expect(listResp.status).toBe(200);
    expect(listResp.body.reminders).toHaveLength(1);
    expect(listResp.body.reminders[0].type).toBe('daily_checkin');
  });

  it('returns errors when auth context is missing', async () => {
    const entryResp = await request(app)
      .post('/api/entries')
      .set('x-user', 'none')
      .send({ entryDate: today });
    expect(entryResp.status).toBe(400);

    const remindersResp = await request(app).get('/api/reminders').set('x-user', 'none');
    expect(remindersResp.status).toBe(401);
  });
});
