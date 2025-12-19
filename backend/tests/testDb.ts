import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newDb, IMemoryDb } from 'pg-mem';

type ResettableDb = IMemoryDb & { reset: () => void };

function loadMigration(db: IMemoryDb) {
  const migrationPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/db/migrations/001_init.sql');
  const migrationSql = readFileSync(migrationPath, 'utf8').replace(/CREATE EXTENSION[^;]+;/g, '');
  db.public.none(migrationSql);
}

function buildDb(): ResettableDb {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', implementation: randomUUID });
  loadMigration(db);

  const reset = () => {
    const tables = [
      'job_logs',
      'conflicts',
      'entry_habits',
      'entry_metrics',
      'entries',
      'reminders',
      'notification_tokens',
      'users',
    ];

    for (const table of tables) {
      db.public.none(`DELETE FROM ${table}`);
    }
  };

  return Object.assign(db, { reset });
}

export const mem = buildDb();
export const resetDb = () => mem.reset();
