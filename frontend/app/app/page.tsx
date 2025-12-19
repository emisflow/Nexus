'use client';

import { useEffect, useMemo, useState } from 'react';
import { habitTemplates, metricTemplates } from './config';

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
        console.error(err);
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
    const resp = await fetch('/api/entries/export');
    if (!resp.ok) {
      setSaveError('Export failed');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'entries.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const preparedEntries = useMemo(() => entries.slice(0, 5), [entries]);

  if (loading) {
    return <main style={{ padding: '1rem' }}>Loading your dashboard...</main>;
  }

  return (
    <main style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <p style={{ color: '#6b7280', margin: 0 }}>Welcome back</p>
          <h1 style={{ margin: 0 }}>Daily dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleExport}>Export CSV</button>
        </div>
      </header>

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '1rem',
          display: 'grid',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Log today&apos;s entry</h2>
          {saveMessage ? <span style={{ color: '#16a34a' }}>{saveMessage}</span> : null}
          {saveError ? <span style={{ color: '#dc2626' }}>{saveError}</span> : null}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Entry date
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Journal text
          <textarea
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            rows={6}
            placeholder="How was your day?"
          />
        </label>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Metrics</h3>
            <button onClick={() => setMetrics((m) => [...m, { key: '', value: '' }])}>Add metric</button>
          </div>
          <p style={{ margin: 0, color: '#6b7280' }}>Choose from your template or enter a custom metric.</p>
          <datalist id="metric-options">
            {metricTemplates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </datalist>
          {metrics.map((metric, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
              <input
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
                onClick={() => setMetrics((prev) => prev.filter((_, i) => i !== idx))}
                disabled={metrics.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Habits</h3>
            <button onClick={() => setHabits((h) => [...h, { habitId: '', completed: false }])}>Add habit</button>
          </div>
          <p style={{ margin: 0, color: '#6b7280' }}>Pick from common habits or add your own identifier.</p>
          <datalist id="habit-options">
            {habitTemplates.map((habit) => (
              <option key={habit.id} value={habit.id}>
                {habit.label}
              </option>
            ))}
          </datalist>
          {habits.map((habit, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
              <input
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
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
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
              <button onClick={() => setHabits((prev) => prev.filter((_, i) => i !== idx))} disabled={habits.length === 1}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div>
          <button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save entry'}
          </button>
        </div>
      </section>

      {conflicts.length > 0 ? (
        <section
          style={{
            border: '1px solid #f0ad4e',
            borderRadius: '10px',
            padding: '1rem',
            display: 'grid',
            gap: '0.75rem',
            background: '#fffaf0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>Unresolved conflicts</h2>
              <p style={{ margin: 0, color: '#6b7280' }}>
                Review differences and choose whether to keep your current text, use the other copy, or merge.
              </p>
            </div>
            {conflictError ? <span style={{ color: '#dc2626' }}>{conflictError}</span> : null}
          </div>

          {conflicts.map((conflict) => (
            <details key={conflict.id} style={{ border: '1px solid #f3f4f6', padding: '0.75rem', borderRadius: '8px' }}>
              <summary style={{ cursor: 'pointer' }}>
                {conflict.entry_date} – {conflict.field}
              </summary>
              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <strong>Current version</strong>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f9fafb', padding: '0.5rem' }}>
                    {conflict.local_version || '(empty)'}
                  </pre>
                </div>
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <strong>Other copy</strong>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f9fafb', padding: '0.5rem' }}>
                    {conflict.remote_version || '(empty)'}
                  </pre>
                </div>
                <label style={{ display: 'grid', gap: '0.25rem' }}>
                  Merge notes
                  <textarea
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
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => handleResolve(conflict.id, 'keep_current')} disabled={resolvingId === conflict.id}>
                    Keep current
                  </button>
                  <button onClick={() => handleResolve(conflict.id, 'use_other')} disabled={resolvingId === conflict.id}>
                    Use other copy
                  </button>
                  <button
                    onClick={() => handleResolve(conflict.id, 'merge_manual', mergeDrafts[conflict.id] ?? '')}
                    disabled={resolvingId === conflict.id}
                  >
                    Save merged version
                  </button>
                </div>
              </div>
            </details>
          ))}
        </section>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', alignItems: 'start' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Recent entries</h2>
            <span style={{ color: '#6b7280' }}>{entries.length} total</span>
          </div>
          {preparedEntries.length === 0 ? <p>No entries yet.</p> : null}
          {preparedEntries.map((entry) => (
            <div key={entry.id} style={{ border: '1px solid #f3f4f6', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{entry.entry_date}</strong>
              </div>
              {entry.journal_text ? (
                <p style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>{entry.journal_text}</p>
              ) : (
                <p style={{ margin: '0.5rem 0', color: '#6b7280' }}>No journal text</p>
              )}
              {entry.metrics.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {entry.metrics.map((metric) => (
                    <span
                      key={metric.key}
                      style={{ background: '#eef2ff', color: '#4338ca', padding: '0.25rem 0.5rem', borderRadius: '6px' }}
                    >
                      {metric.key}: {metric.value_num ?? metric.value_text}
                    </span>
                  ))}
                </div>
              ) : null}
              {entry.habits.length > 0 ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {entry.habits.map((habit) => (
                    <span
                      key={habit.habit_id}
                      style={{
                        background: habit.completed ? '#dcfce7' : '#fee2e2',
                        color: habit.completed ? '#15803d' : '#b91c1c',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                      }}
                    >
                      {habit.habit_id}: {habit.completed ? 'done' : 'missed'}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Trends</h2>
          {!analytics ? (
            <p>Analytics unavailable</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Last 7 days</span>
                <strong>{analytics.last7.entryCount} entries</strong>
              </div>
              {analytics.last7.metrics.map((metric) => (
                <div key={`7-${metric.key}`} style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                  <span>{metric.key}</span>
                  <span>
                    avg {metric.average?.toFixed(2) ?? '–'} ({metric.samples} samples)
                  </span>
                </div>
              ))}
              {analytics.last7.habits.map((habit) => (
                <div key={`7-${habit.habit_id}`} style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                  <span>{habit.habit_id}</span>
                  <span>{Math.round(habit.completion_rate * 100)}% consistency</span>
                </div>
              ))}

              <hr />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Last 30 days</span>
                <strong>{analytics.last30.entryCount} entries</strong>
              </div>
              {analytics.last30.metrics.map((metric) => (
                <div key={`30-${metric.key}`} style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                  <span>{metric.key}</span>
                  <span>
                    avg {metric.average?.toFixed(2) ?? '–'} ({metric.samples} samples)
                  </span>
                </div>
              ))}
              {analytics.last30.habits.map((habit) => (
                <div key={`30-${habit.habit_id}`} style={{ display: 'flex', justifyContent: 'space-between', color: '#4b5563' }}>
                  <span>{habit.habit_id}</span>
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
