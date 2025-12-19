import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './testDb.js';
import { computeNextRun } from '../src/db/reminders.js';
import { pool } from '../src/db/client.js';
import { upsertEntryWithConflict, resolveConflict } from '../src/db/entries.js';

const userId = '11111111-1111-1111-1111-111111111111';

describe('reminder scheduling', () => {
  it('schedules later same day in timezone', () => {
    const from = new Date('2023-01-01T05:00:00Z'); // 09:00 in Asia/Dubai (UTC+4)
    const next = computeNextRun({ hour: 10, minute: 0, timezone: 'Asia/Dubai', from });
    expect(next.toISOString()).toBe('2023-01-01T06:00:00.000Z'); // 10:00 +04
  });

  it('rolls over to tomorrow when time has passed', () => {
    const from = new Date('2023-01-01T08:30:00Z'); // 12:30 in Asia/Dubai
    const next = computeNextRun({ hour: 10, minute: 0, timezone: 'Asia/Dubai', from });
    expect(next.toISOString()).toBe('2023-01-02T06:00:00.000Z');
  });
});

describe('conflict creation and resolution', () => {
  beforeEach(async () => {
    resetDb();
    await pool.query('INSERT INTO users (id, clerk_user_id) VALUES ($1, $2)', [userId, 'clerk_user']);
  });

  it('creates a conflict on stale update and resolves with other version', async () => {
    const entryDate = '2024-01-01';

    // Initial insert
    const first = await upsertEntryWithConflict({
      userId,
      entryDate,
      journalText: 'first version',
    });

    // Fresh update (no conflict) -> advances updated_at
    await upsertEntryWithConflict({
      userId,
      entryDate,
      journalText: 'current server version',
      baseUpdatedAt: first.entry.updated_at,
    });

    // Stale update with old baseUpdatedAt should create conflict
    const stale = await upsertEntryWithConflict({
      userId,
      entryDate,
      journalText: 'stale edit',
      baseUpdatedAt: first.entry.updated_at,
    });

    expect(stale.conflictId).toBeDefined();

    // Resolve using other version (server version)
    const resolved = await resolveConflict({
      conflictId: stale.conflictId!,
      userId,
      action: 'use_other',
    });

    expect(resolved.resolved).toBe(true);

    const entryResult = await pool.query('SELECT journal_text, updated_at FROM entries WHERE user_id = $1 AND entry_date = $2', [userId, entryDate]);
    expect(entryResult.rows[0].journal_text).toBe('current server version');

    const conflictRow = await pool.query('SELECT status FROM conflicts WHERE id = $1', [stale.conflictId]);
    expect(conflictRow.rows[0].status).toBe('resolved');
  });
});
