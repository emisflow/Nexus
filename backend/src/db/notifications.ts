import { pool } from './client.js';

export type NotificationTokenRow = {
  id: string;
  user_id: string;
  provider: string;
  token: string;
  platform: string;
  updated_at: string;
};

export async function upsertNotificationToken({
  userId,
  token,
  platform,
  provider = 'onesignal',
}: {
  userId: string;
  token: string;
  platform: string;
  provider?: string;
}): Promise<NotificationTokenRow> {
  const result = await pool.query<NotificationTokenRow>(
    `INSERT INTO notification_tokens (user_id, provider, token, platform)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, token)
     DO UPDATE SET platform = EXCLUDED.platform, user_id = EXCLUDED.user_id, updated_at = now()
     RETURNING *`,
    [userId, provider, token, platform]
  );

  return result.rows[0];
}

export async function getTokensForUser(userId: string): Promise<string[]> {
  const result = await pool.query<NotificationTokenRow>(
    `SELECT token FROM notification_tokens WHERE user_id = $1 AND provider = 'onesignal'`,
    [userId]
  );

  return result.rows.map((row) => row.token);
}
