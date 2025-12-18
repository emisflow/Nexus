import { pool } from './client.js';

export async function logJob({
  userId,
  jobType,
  status,
  error,
}: {
  userId?: string;
  jobType: string;
  status: 'success' | 'failed';
  error?: string;
}) {
  await pool.query(
    `INSERT INTO job_logs (user_id, job_type, status, error)
     VALUES ($1, $2, $3, $4)`,
    [userId ?? null, jobType, status, error ?? null]
  );
}
