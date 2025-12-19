'use client';

import { useEffect, useMemo, useState } from 'react';
import { habitTemplates, metricTemplates } from './config';
import styles from './page.module.css';

type Metric = { key: string; value: string };
type Habit = { habitId: string; completed: boolean };
type Entry = {
  id: string;
  entry_date: string;
  journal_text: string | null;
  updated_at: string;
  metrics: { key: string; value_num: number | null; value_text: string | null }[];
  habits: { habit_id: string; completed: boolean }[];
};

type AnalyticsBucket = {
  entryCount: number;
  metrics: { key: string; average: number | null; samples: number }[];
  habits: { habit_id: string; completion_rate: number; samples: number }[];
};

type Conflict = {
  id: string;
  field: string;
  local_version: string | null;
  remote_version: string | null;
  status: string;
  entry_date: string;
};

export default function AppDashboard() {
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [journalText, setJournalText] = useState('');
  const [metrics, setMetrics] = useState<Metric[]>([{ key: '', value: '' }]);
  const [habits, setHabits] = useState<Habit[]>([{ habitId: '', completed: false }]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [mergeDrafts, setMergeDrafts] = useState<Record<string, string>>({});
  const [analytics, setAnalytics] = useState<{ last7: AnalyticsBucket; last30: AnalyticsBucket } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportFormat, setExportFormat] = useState<'long' | 'wide'>('long');

  const loadEntries = async () => {
    const resp = await fetch('/api/entries');
    if (!resp.ok) throw new Error('Failed to load entries');
    const data = (await resp.json()) as { entries: Entry[] };
    setEntries(data.entries);
  };

  const loadAnalytics = async () => {
    const resp = await fetch('/api/analytics');
    if (!resp.ok) throw new Error('Failed to load analytics');
    const data = (await resp.json()) as { last7: AnalyticsBucket; last30: AnalyticsBucket };
    setAnalytics(data);
  };

  const loadConflicts = async () => {
    const resp = await fetch('/api/conflicts');
    if (!resp.ok) throw new Error('Failed to load conflicts');
    const data = (await resp.json()) as { conflicts: Conflict[] };
    setConflicts(data.conflicts ?? []);
    setMergeDrafts((prev) => {
      const next: Record<string, string> = {};
      (data.conflicts ?? []).forEach((conflict) => {
        next[conflict.id] = conflict.id in prev ? prev[conflict.id] : conflict.local_version ?? '';
      });
      return next;
    });
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await Promise.all([loadEntries(), loadAnalytics(), loadConflicts()]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Something went wrong while loading data');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  const selectedEntry = useMemo(() => entries.find((entry) => entry.entry_date === entryDate), [entries, entryDate]);

  useEffect(() => {
    if (!selectedEntry) {
      setJournalText('');
      setMetrics([{ key: '', value: '' }]);
      setHabits([{ habitId: '', completed: false }]);
      setBaseUpdatedAt(null);
      return;
    }

    setJournalText(selectedEntry.journal_text ?? '');
    setMetrics(
      selectedEntry.metrics.length
        ? selectedEntry.metrics.map((metric) => ({
            key: metric.key,
            value: metric.value_num?.toString() ?? metric.value_text ?? '',
          }))
        : [{ key: '', value: '' }]
    );
    setHabits(
      selectedEntry.habits.length
        ? selectedEntry.habits.map((habit) => ({ habitId: habit.habit_id, completed: habit.completed }))
        : [{ habitId: '', completed: false }]
    );
    setBaseUpdatedAt(selectedEntry.updated_at);
  }, [selectedEntry]);

  const handleSubmit = async () => {
    setSaveMessage(null);
    setSaveError(null);

    const errors: string[] = [];

    const preparedMetrics = metrics
      .map((m, idx) => {
        const key = m.key.trim();
        const value = m.value.trim();

        if (!key && !value) return null;
        if (!key) {
          errors.push(`Metric ${idx + 1} is missing a name.`);
          return null;
        }
        if (!value) {
          errors.push(`Metric "${key}" needs a value.`);
          return null;
        }

        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          errors.push(`Metric "${key}" must be a number.`);
          return null;
        }

        return { key, value_num: parsed };
      })
      .filter((m): m is { key: string; value_num: number } => m !== null);

    const preparedHabits = habits
      .map((h, idx) => {
        const habitId = h.habitId.trim();
        if (!habitId && h.completed) {
          errors.push(`Habit ${idx + 1} needs an identifier to log completion.`);
        }
        if (!habitId) return null;
        return { habitId, completed: h.completed };
      })
      .filter((h): h is { habitId: string; completed: boolean } => h !== null);

    if (errors.length > 0) {
      setSaveError(errors.join(' '));
      return;
    }

    setSaving(true);

    try {
      const resp = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryDate,
          journalText,
          metrics: preparedMetrics,
          habits: preparedHabits,
          baseUpdatedAt: baseUpdatedAt ?? undefined,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Failed to save entry');
      }

      const data = (await resp.json()) as { entry: Entry; conflictId?: string | null };

      if (data.conflictId) {
        setSaveMessage('Another version exists. We saved a conflict copy—review below.');
      } else {
        setSaveMessage('Entry saved and synced.');
      }

      setBaseUpdatedAt(data.entry.updated_at);

      await Promise.all([loadEntries(), loadAnalytics(), loadConflicts()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (
    conflictId: string,
    action: 'keep_current' | 'use_other' | 'merge_manual',
    mergedText?: string
  ) => {
    setResolvingId(conflictId);
    setConflictError(null);
    try {
      const resp = await fetch(`/api/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, mergedText }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Failed to resolve conflict');
      }

      await Promise.all([loadConflicts(), loadEntries(), loadAnalytics()]);
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : 'Failed to resolve conflict');
    } finally {
      setResolvingId(null);
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();

    if (exportFrom) params.set('from', exportFrom);
    if (exportTo) params.set('to', exportTo);
    if (exportFormat === 'wide') params.set('format', 'wide');

    const resp = await fetch(`/api/entries/export${params.size ? `?${params.toString()}` : ''}`);
    if (!resp.ok) {
      setSaveError('Export failed');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFormat === 'wide' ? 'entries-wide.csv' : 'entries.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const preparedEntries = useMemo(() => entries.slice(0, 5), [entries]);

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={`${styles.stateBar} ${styles.stateBarInfo}`}>Loading your dashboard…</div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {loadError ? (
        <div className={`${styles.stateBar} ${styles.stateBarError}`}>{loadError}</div>
      ) : (
        <div className={`${styles.stateBar} ${styles.stateBarSuccess}`}>
          Data synced. Update your entry and we’ll keep everything backed up.
        </div>
      )}

      <header className={styles.header}>
        <div>
          <p className={styles.muted}>Welcome back</p>
          <h1 className={styles.sectionTitle}>Daily dashboard</h1>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}>
            From
            <input className={styles.input} type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
          </label>
          <label className={styles.inputGroup}>
            To
            <input className={styles.input} type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
          </label>
          <label className={styles.inputGroup}>
            Format
            <select
              className={styles.select}
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'long' | 'wide')}
            >
              <option value="long">Long (metrics/habits as JSON)</option>
              <option value="wide">Wide (columns per metric/habit)</option>
            </select>
          </label>
          <button className={`${styles.button} ${styles.buttonGhost}`} onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.sectionTitle}>Log today&apos;s entry</h2>
          <div className={styles.badgeRow}>
            {saveMessage ? <span className={`${styles.badge} ${styles.tagSuccess}`}>{saveMessage}</span> : null}
            {saveError ? <span className={`${styles.badge} ${styles.tagDanger}`}>{saveError}</span> : null}
          </div>
        </div>
        <label className={styles.inputGroup}>
          Entry date
          <input className={styles.input} type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </label>
        <label className={styles.inputGroup}>
          Journal text
          <textarea
            className={styles.textarea}
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            rows={6}
            placeholder="How was your day?"
          />
        </label>

        <div>
          <div className={styles.header}>
            <h3 className={styles.sectionTitle}>Metrics</h3>
            <button className={`${styles.button} ${styles.buttonGhost}`} onClick={() => setMetrics((m) => [...m, { key: '', value: '' }])}>
              Add metric
            </button>
          </div>
          <p className={styles.helper}>Choose from your template or enter a custom metric.</p>
          <datalist id="metric-options">
            {metricTemplates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </datalist>
          <div className={styles.card}>
            {metrics.map((metric, idx) => (
              <div key={idx} className={styles.metricRow}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Name (e.g. mood)"
                  list="metric-options"
                  value={metric.key}
                  onChange={(e) => {
                    const next = [...metrics];
                    next[idx] = { ...metric, key: e.target.value };
                    setMetrics(next);
                  }}
                />
                <input
                  className={styles.input}
                  type="number"
                  placeholder={metricTemplates.find((t) => t.key === metric.key)?.placeholder ?? 'Value'}
                  value={metric.value}
                  onChange={(e) => {
                    const next = [...metrics];
                    next[idx] = { ...metric, value: e.target.value };
                    setMetrics(next);
                  }}
                />
                <button
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={() => setMetrics((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={metrics.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.header}>
            <h3 className={styles.sectionTitle}>Habits</h3>
            <button className={`${styles.button} ${styles.buttonGhost}`} onClick={() => setHabits((h) => [...h, { habitId: '', completed: false }])}>
              Add habit
            </button>
          </div>
          <p className={styles.helper}>Pick from common habits or add your own identifier.</p>
          <datalist id="habit-options">
            {habitTemplates.map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.label}
              </option>
            ))}
          </datalist>
          <div className={styles.card}>
            {habits.map((habit, idx) => (
              <div key={idx} className={styles.habitRow}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Habit identifier"
                  list="habit-options"
                  value={habit.habitId}
                  onChange={(e) => {
                    const next = [...habits];
                    next[idx] = { ...habit, habitId: e.target.value };
                    setHabits(next);
                  }}
                />
                <label className={styles.actionsRow}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={habit.completed}
                    onChange={(e) => {
                      const next = [...habits];
                      next[idx] = { ...habit, completed: e.target.checked };
                      setHabits(next);
                    }}
                  />
                  Completed
                </label>
                <button
                  className={`${styles.button} ${styles.buttonGhost}`}
                  onClick={() => setHabits((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={habits.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <button className={styles.button} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </section>

      {conflicts.length > 0 ? (
        <section className={styles.card}>
          <div className={styles.header}>
            <div>
              <h2 className={styles.sectionTitle}>Unresolved conflicts</h2>
              <p className={styles.helper}>
                Review differences and choose whether to keep your current text, use the other copy, or merge.
              </p>
            </div>
            {conflictError ? <span className={`${styles.badge} ${styles.tagDanger}`}>{conflictError}</span> : null}
          </div>

          {conflicts.map((conflict) => (
            <details key={conflict.id} className={styles.card}>
              <summary>
                {conflict.entry_date} – {conflict.field}
              </summary>
              <div className={styles.actionsRow}>
                <div>
                  <strong>Current version</strong>
                  <pre className={styles.helper}>{conflict.local_version || '(empty)'}</pre>
                </div>
                <div>
                  <strong>Other copy</strong>
                  <pre className={styles.helper}>{conflict.remote_version || '(empty)'}</pre>
                </div>
              </div>
              <label className={styles.inputGroup}>
                Merge notes
                <textarea
                  className={styles.textarea}
                  value={mergeDrafts[conflict.id] ?? ''}
                  onChange={(e) =>
                    setMergeDrafts((prev) => ({
                      ...prev,
                      [conflict.id]: e.target.value,
                    }))
                  }
                  rows={4}
                />
              </label>
              <div className={styles.actionsRow}>
                <button className={`${styles.button} ${styles.buttonGhost}`} onClick={() => handleResolve(conflict.id, 'keep_current')} disabled={resolvingId === conflict.id}>
                  Keep current
                </button>
                <button className={`${styles.button} ${styles.buttonGhost}`} onClick={() => handleResolve(conflict.id, 'use_other')} disabled={resolvingId === conflict.id}>
                  Use other copy
                </button>
                <button
                  className={styles.button}
                  onClick={() => handleResolve(conflict.id, 'merge_manual', mergeDrafts[conflict.id] ?? '')}
                  disabled={resolvingId === conflict.id}
                >
                  Save merged version
                </button>
              </div>
            </details>
          ))}
        </section>
      ) : null}

      <section className={styles.gridTwoColumn}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h2 className={styles.sectionTitle}>Recent entries</h2>
            <span className={styles.muted}>{entries.length} total</span>
          </div>
          {preparedEntries.length === 0 ? <p className={styles.emptyState}>No entries yet.</p> : null}
          {preparedEntries.map((entry) => (
            <div key={entry.id} className={styles.card}>
              <div className={styles.header}>
                <strong>{entry.entry_date}</strong>
              </div>
              {entry.journal_text ? (
                <p className={styles.bodyText}>{entry.journal_text}</p>
              ) : (
                <p className={styles.emptyState}>No journal text</p>
              )}
              {entry.metrics.length > 0 ? (
                <div className={styles.badgeRow}>
                  {entry.metrics.map((metric) => (
                    <span key={metric.key} className={styles.badge}>
                      {metric.key}: {metric.value_num ?? metric.value_text}
                    </span>
                  ))}
                </div>
              ) : null}
              {entry.habits.length > 0 ? (
                <div className={styles.badgeRow}>
                  {entry.habits.map((habit) => (
                    <span key={habit.habit_id} className={`${styles.badge} ${habit.completed ? styles.tagSuccess : styles.tagWarning}`}>
                      {habit.habit_id}: {habit.completed ? 'done' : 'missed'}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Trends</h2>
          {!analytics ? (
            <p className={styles.emptyState}>Analytics unavailable</p>
          ) : (
            <div className={styles.card}>
              <div className={styles.header}>
                <span>Last 7 days</span>
                <strong>{analytics.last7.entryCount} entries</strong>
              </div>
              {analytics.last7.metrics.map((metric) => (
                <div key={`7-${metric.key}`} className={styles.header}>
                  <span className={styles.muted}>{metric.key}</span>
                  <span>
                    avg {metric.average?.toFixed(2) ?? '–'} ({metric.samples} samples)
                  </span>
                </div>
              ))}
              {analytics.last7.habits.map((habit) => (
                <div key={`7-${habit.habit_id}`} className={styles.header}>
                  <span className={styles.muted}>{habit.habit_id}</span>
                  <span>{Math.round(habit.completion_rate * 100)}% consistency</span>
                </div>
              ))}

              <hr className={styles.divider} />

              <div className={styles.header}>
                <span>Last 30 days</span>
                <strong>{analytics.last30.entryCount} entries</strong>
              </div>
              {analytics.last30.metrics.map((metric) => (
                <div key={`30-${metric.key}`} className={styles.header}>
                  <span className={styles.muted}>{metric.key}</span>
                  <span>
                    avg {metric.average?.toFixed(2) ?? '–'} ({metric.samples} samples)
                  </span>
                </div>
              ))}
              {analytics.last30.habits.map((habit) => (
                <div key={`30-${habit.habit_id}`} className={styles.header}>
                  <span className={styles.muted}>{habit.habit_id}</span>
                  <span>{Math.round(habit.completion_rate * 100)}% consistency</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
