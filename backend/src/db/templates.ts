import { pool } from './client.js';

export type TemplateMetric = { key: string; defaultValue?: number | null };
export type TemplateHabit = { habitId: string; defaultCompleted?: boolean };

export type TemplateRow = {
  id: string;
  user_id: string;
  name: string;
  metrics: TemplateMetric[];
  habits: TemplateHabit[];
  created_at: string;
};

export async function listTemplates(userId: string): Promise<TemplateRow[]> {
  const result = await pool.query<TemplateRow>(
    `SELECT id, user_id, name, metrics, habits, created_at
     FROM templates
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function upsertTemplate({
  id,
  userId,
  name,
  metrics,
  habits,
}: {
  id?: string;
  userId: string;
  name: string;
  metrics?: TemplateMetric[];
  habits?: TemplateHabit[];
}): Promise<TemplateRow> {
  const metricsJson = JSON.stringify(metrics ?? []);
  const habitsJson = JSON.stringify(habits ?? []);

  if (id) {
    const result = await pool.query<TemplateRow>(
      `UPDATE templates
       SET name = $3,
           metrics = $4::jsonb,
           habits = $5::jsonb
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, name, metrics, habits, created_at`,
      [id, userId, name, metricsJson, habitsJson]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Template not found or unauthorized');
    }
    return row;
  }

  const result = await pool.query<TemplateRow>(
    `INSERT INTO templates (user_id, name, metrics, habits)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id, user_id, name, metrics, habits, created_at`,
    [userId, name, metricsJson, habitsJson]
  );

  return result.rows[0];
}

export async function deleteTemplate({ id, userId }: { id: string; userId: string }): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `DELETE FROM templates WHERE id = $1 AND user_id = $2 RETURNING 1 AS count`,
    [id, userId]
  );

  return result.rowCount > 0;
}
