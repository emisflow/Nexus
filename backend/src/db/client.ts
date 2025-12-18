import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

if (!connectionString && !isTestEnv) {
  throw new Error('DATABASE_URL is required for database access');
}

export const pool = connectionString ? new Pool({ connectionString }) : new Pool();
