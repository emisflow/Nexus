import { PoolClient } from 'pg';
import { pool } from './client.js';

export type EntryRow = {
  id: string;
  user_id: string;
  entry_date: string;
  template_id: string | null;
  journal_text: string | null;
  created_at: string;
  updated_at: string;
};

export type MetricRow = {
  entry_id: string;
  key: string;
  value_num: number | null;
  value_text: string | null;
};

export type HabitRow = {
  entry_id: string;
  habit_id: string;
  completed: boolean;
};

export type ConflictRow = {
  id: string;
  entry_id: string;
  field: string;
  local_version: string | null;
  remote_version: string | null;
  status: string;
  created_at: string;
  entry_date: string;
};

export async function getEntryWithConflicts(entryId: string, userId: string): Promise<{
  entry: EntryRow | null;
  conflicts: ConflictRow[];
}> {
  const entryResult = await pool.query<EntryRow>(
    `SELECT * FROM entries WHERE id = $1 AND user_id = $2`,
    [entryId, userId]
  );

  const entry = entryResult.rows[0] ?? null;

  if (!entry) {
    return { entry: null, conflicts: [] };
  }

  const conflictResult = await pool.query<ConflictRow>(
    `SELECT c.*, e.entry_date
     FROM conflicts c
     JOIN entries e ON e.id = c.entry_id
     WHERE c.entry_id = $1 AND e.user_id = $2 AND c.status = 'unresolved'
     ORDER BY c.created_at DESC`,
    [entryId, userId]
  );

  return { entry, conflicts: conflictResult.rows };
}

export type MetricInput = {
  key: string;
  value_num?: number | null;
  value_text?: string | null;
};

export type HabitInput = {
  habitId: string;
  completed: boolean;
};

export type EntryWithDetails = EntryRow & {
  metrics: MetricRow[];
  habits: HabitRow[];
};

export type MetricAverage = {
  key: string;
  average: number | null;
  samples: number;
};

export type HabitConsistency = {
  habit_id: string;
  completion_rate: number;
  samples: number;
};

function normalizeText(text?: string | null): string {
  if (!text) return '';
  return text.replace(/[\s\p{P}]/gu, '').toLowerCase();
}

async function upsertMetrics(client: PoolClient, entryId: string, metrics?: MetricInput[]) {
  if (!metrics) return;

  await client.query('DELETE FROM entry_metrics WHERE entry_id = $1', [entryId]);

  if (metrics.length === 0) return;

  const values: any[] = [];
  const rows: string[] = [];

  metrics.forEach((metric, idx) => {
    const base = idx * 4;
    rows.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    values.push(entryId, metric.key, metric.value_num ?? null, metric.value_text ?? null);
  });

  await client.query(
    `INSERT INTO entry_metrics (entry_id, key, value_num, value_text) VALUES ${rows.join(', ')}`,
    values
  );
}

async function upsertHabits(client: PoolClient, entryId: string, habits?: HabitInput[]) {
  if (!habits) return;

  await client.query('DELETE FROM entry_habits WHERE entry_id = $1', [entryId]);

  if (habits.length === 0) return;

  const values: any[] = [];
  const rows: string[] = [];

  habits.forEach((habit, idx) => {
    const base = idx * 3;
    rows.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    values.push(entryId, habit.habitId, habit.completed);
  });

  await client.query(
    `INSERT INTO entry_habits (entry_id, habit_id, completed) VALUES ${rows.join(', ')}`,
    values
  );
}

async function fetchMetricsByEntryIds(entryIds: string[]): Promise<Map<string, MetricRow[]>> {
  const map = new Map<string, MetricRow[]>();

  if (entryIds.length === 0) return map;

  const result = await pool.query<MetricRow>(
    `SELECT entry_id, key, value_num, value_text
     FROM entry_metrics
     WHERE entry_id = ANY($1)`,
    [entryIds]
  );

  for (const row of result.rows) {
    const list = map.get(row.entry_id) ?? [];
    list.push(row);
    map.set(row.entry_id, list);
  }

  return map;
}

async function fetchHabitsByEntryIds(entryIds: string[]): Promise<Map<string, HabitRow[]>> {
  const map = new Map<string, HabitRow[]>();

  if (entryIds.length === 0) return map;

  const result = await pool.query<HabitRow>(
    `SELECT entry_id, habit_id, completed
     FROM entry_habits
     WHERE entry_id = ANY($1)`,
    [entryIds]
  );

  for (const row of result.rows) {
    const list = map.get(row.entry_id) ?? [];
    list.push(row);
    map.set(row.entry_id, list);
  }

  return map;
}

export async function upsertEntryWithConflict({
  userId,
  entryDate,
  templateId,
  journalText,
  metrics,
  habits,
  baseUpdatedAt,
}: {
  userId: string;
  entryDate: string;
  templateId?: string;
  journalText?: string;
  metrics?: MetricInput[];
  habits?: HabitInput[];
  baseUpdatedAt?: string;
}): Promise<{ entry: EntryRow; conflictId?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingResult = await client.query<EntryRow>(
      'SELECT * FROM entries WHERE user_id = $1 AND entry_date = $2',
      [userId, entryDate]
    );
    const existing = existingResult.rows[0];

    const normalizedIncoming = normalizeText(journalText ?? null);
    const normalizedExisting = normalizeText(existing?.journal_text);

    const hasConflict =
      !!existing &&
      !!baseUpdatedAt &&
      existing.updated_at !== baseUpdatedAt &&
      normalizedIncoming !== normalizedExisting;

    let entryRow: EntryRow;
    let conflictId: string | undefined;

    if (existing) {
      const updateResult = await client.query<EntryRow>(
        `UPDATE entries
         SET template_id = COALESCE($3, template_id),
             journal_text = $4,
             updated_at = now()
         WHERE user_id = $1 AND entry_date = $2
         RETURNING *`,
        [userId, entryDate, templateId ?? null, journalText ?? existing.journal_text]
      );
      entryRow = updateResult.rows[0];
    } else {
      const insertResult = await client.query<EntryRow>(
        `INSERT INTO entries (user_id, entry_date, template_id, journal_text)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, entryDate, templateId ?? null, journalText ?? null]
      );
      entryRow = insertResult.rows[0];
    }

    await upsertMetrics(client, entryRow.id, metrics);
    await upsertHabits(client, entryRow.id, habits);

    if (hasConflict) {
      const conflictResult = await client.query<{ id: string }>(
        `INSERT INTO conflicts (entry_id, field, local_version, remote_version, status)
         VALUES ($1, 'journal_text', $2, $3, 'unresolved')
         RETURNING id`,
        [entryRow.id, journalText ?? '', existing?.journal_text ?? '']
      );
      conflictId = conflictResult.rows[0].id;
    }

    await client.query('COMMIT');
    return { entry: entryRow, conflictId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listEntries({
  userId,
  from,
  to,
}: {
  userId: string;
  from?: string;
  to?: string;
}): Promise<EntryRow[]> {
  const clauses = ['user_id = $1'];
  const params: any[] = [userId];

  if (from) {
    params.push(from);
    clauses.push(`entry_date >= $${params.length}`);
  }

  if (to) {
    params.push(to);
    clauses.push(`entry_date <= $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await pool.query<EntryRow>(
    `SELECT * FROM entries ${where} ORDER BY entry_date DESC`,
    params
  );

  return result.rows;
}

export async function listEntriesWithDetails(params: {
  userId: string;
  from?: string;
  to?: string;
}): Promise<EntryWithDetails[]> {
  const entries = await listEntries(params);
  const entryIds = entries.map((entry) => entry.id);

  const [metricsMap, habitsMap] = await Promise.all([
    fetchMetricsByEntryIds(entryIds),
    fetchHabitsByEntryIds(entryIds),
  ]);

  return entries.map((entry) => ({
    ...entry,
    metrics: metricsMap.get(entry.id) ?? [],
    habits: habitsMap.get(entry.id) ?? [],
  }));
}

export async function computeEntryAnalytics({
  userId,
  days,
  from,
  to,
  metricKeys,
  habitIds,
}: {
  userId: string;
  days?: number;
  from?: string;
  to?: string;
  metricKeys?: string[];
  habitIds?: string[];
}): Promise<{
  entryCount: number;
  metrics: MetricAverage[];
  habits: HabitConsistency[];
  correlations: { metric: string; habit: string; correlation: number; samples: number }[];
}> {
  const params: any[] = [userId];
  const entryWhere: string[] = ['e.user_id = $1'];

  if (from) {
    params.push(from);
    entryWhere.push(`e.entry_date >= $${params.length}`);
  } else if (days) {
    params.push(days);
    entryWhere.push(`e.entry_date >= (current_date - ($${params.length}::int - 1))`);
  }

  if (to) {
    params.push(to);
    entryWhere.push(`e.entry_date <= $${params.length}`);
  }

  const entryWhereClause = entryWhere.length ? `WHERE ${entryWhere.join(' AND ')}` : '';

  const metricParams = [...params];
  const metricWhere = [...entryWhere];
  if (metricKeys && metricKeys.length > 0) {
    metricParams.push(metricKeys);
    metricWhere.push(`m.key = ANY($${metricParams.length})`);
  }
  metricWhere.push('m.value_num IS NOT NULL');
  const metricWhereClause = metricWhere.length ? `WHERE ${metricWhere.join(' AND ')}` : '';

  const habitParams = [...params];
  const habitWhere = [...entryWhere];
  if (habitIds && habitIds.length > 0) {
    habitParams.push(habitIds);
    habitWhere.push(`h.habit_id = ANY($${habitParams.length})`);
  }
  const habitWhereClause = habitWhere.length ? `WHERE ${habitWhere.join(' AND ')}` : '';

  const [entryCountResult, metricsResult, habitResult] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM entries e
       ${entryWhereClause}
      `,
      params
    ),
    pool.query<MetricAverage>(
      `SELECT m.key, AVG(m.value_num)::float AS average, COUNT(m.value_num)::int AS samples
       FROM entry_metrics m
       JOIN entries e ON e.id = m.entry_id
       ${metricWhereClause}
       GROUP BY m.key
       ORDER BY m.key`,
      metricParams
    ),
    pool.query<HabitConsistency>(
      `SELECT h.habit_id, AVG(CASE WHEN h.completed THEN 1 ELSE 0 END)::float AS completion_rate, COUNT(*)::int AS samples
       FROM entry_habits h
       JOIN entries e ON e.id = h.entry_id
       ${habitWhereClause}
       GROUP BY h.habit_id
       ORDER BY h.habit_id`,
      habitParams
    ),
  ]);

  const effectiveFrom = from
    ? from
    : days
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - (days - 1));
          return d.toISOString().slice(0, 10);
        })()
      : undefined;

  const entriesForCorrelation = await listEntriesWithDetails({ userId, from: effectiveFrom, to });
  const metricFilter = metricKeys && metricKeys.length > 0 ? new Set(metricKeys) : null;
  const habitFilter = habitIds && habitIds.length > 0 ? new Set(habitIds) : null;
  const pairs = new Map<string, { metric: string; habit: string; values: { x: number; y: number }[] }>();

  for (const entry of entriesForCorrelation) {
    const entryMetrics = entry.metrics.filter(
      (m) => m.value_num !== null && (!metricFilter || metricFilter.has(m.key))
    );
    const entryHabits = entry.habits.filter((h) => !habitFilter || habitFilter.has(h.habit_id));

    for (const metric of entryMetrics) {
      for (const habit of entryHabits) {
        const key = `${metric.key}::${habit.habit_id}`;
        if (!pairs.has(key)) {
          pairs.set(key, { metric: metric.key, habit: habit.habit_id, values: [] });
        }
        pairs.get(key)!.values.push({ x: habit.completed ? 1 : 0, y: metric.value_num as number });
      }
    }
  }

  const correlations: { metric: string; habit: string; correlation: number; samples: number }[] = [];

  for (const pair of pairs.values()) {
    const n = pair.values.length;
    if (n < 2) continue;
    const meanX = pair.values.reduce((sum, v) => sum + v.x, 0) / n;
    const meanY = pair.values.reduce((sum, v) => sum + v.y, 0) / n;
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    for (const v of pair.values) {
      const dx = v.x - meanX;
      const dy = v.y - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    const denominator = Math.sqrt(denomX * denomY);
    if (!denominator) continue;
    correlations.push({
      metric: pair.metric,
      habit: pair.habit,
      correlation: Number((numerator / denominator).toFixed(3)),
      samples: n,
    });
  }

  return {
    entryCount: Number(entryCountResult.rows[0]?.count ?? 0),
    metrics: metricsResult.rows,
    habits: habitResult.rows,
    correlations,
  };
}

export async function listConflicts(userId: string): Promise<ConflictRow[]> {
  const result = await pool.query<ConflictRow>(
    `SELECT c.*, e.entry_date
     FROM conflicts c
     JOIN entries e ON e.id = c.entry_id
     WHERE e.user_id = $1 AND c.status = 'unresolved'
     ORDER BY c.created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function resolveConflict({
  conflictId,
  userId,
  action,
  mergedText,
}: {
  conflictId: string;
  userId: string;
  action: 'keep_current' | 'use_other' | 'merge_manual';
  mergedText?: string;
}): Promise<{ resolved: boolean }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const conflictResult = await client.query<ConflictRow>(
      `SELECT c.*, e.user_id, e.journal_text
       FROM conflicts c
       JOIN entries e ON e.id = c.entry_id
       WHERE c.id = $1 AND e.user_id = $2
       FOR UPDATE`,
      [conflictId, userId]
    );

    const conflict = conflictResult.rows[0] as (ConflictRow & { user_id: string; journal_text: string | null }) | undefined;

    if (!conflict) {
      await client.query('ROLLBACK');
      return { resolved: false };
    }

    let nextText = conflict.journal_text ?? '';

    if (action === 'use_other') {
      nextText = conflict.remote_version ?? '';
    }

    if (action === 'merge_manual') {
      if (!mergedText) {
        throw new Error('mergedText is required for merge_manual');
      }
      nextText = mergedText;
    }

    if (action !== 'keep_current') {
      await client.query(
        `UPDATE entries SET journal_text = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
        [nextText, conflict.entry_id, userId]
      );
    }

    await client.query(`UPDATE conflicts SET status = 'resolved' WHERE id = $1`, [conflictId]);

    await client.query('COMMIT');
    return { resolved: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
