import { pool } from './client.js';

export type UserRow = {
  id: string;
  clerk_user_id: string;
  created_at: string;
};

export async function ensureUser(clerkUserId: string): Promise<UserRow> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (clerk_user_id)
     VALUES ($1)
     ON CONFLICT (clerk_user_id)
     DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
     RETURNING id, clerk_user_id, created_at`,
    [clerkUserId]
  );

  return result.rows[0];
}
