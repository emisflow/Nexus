import { vi } from 'vitest';
import { mem } from './testDb.js';

process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

vi.mock('pg', () => {
  const pg = mem.adapters.createPg();
  return { Pool: pg.Pool };
});
