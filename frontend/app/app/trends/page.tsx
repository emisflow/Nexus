'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { analyticsCategories, habitTemplates, metricTemplates } from '../config';

type MetricAverage = { key: string; average: number | null; samples: number };
type HabitConsistency = { habit_id: string; completion_rate: number; samples: number };
type Correlation = { metric: string; habit: string; correlation: number; samples: number };

type AnalyticsRange = {
  entryCount: number;
  metrics: MetricAverage[];
  habits: HabitConsistency[];
  correlations: Correlation[];
};

type Preset = '7' | '30' | 'custom';

type ChartDatum = { label: string; value: number; helper?: string };

const cardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '1rem',
  background: '#fff',
};

function formatMetricLabel(key: string) {
  return metricTemplates.find((m) => m.key === key)?.label ?? key;
}

function formatHabitLabel(id: string) {
  return habitTemplates.find((h) => h.id === id)?.label ?? id;
}

function InlineBarChart({
  title,
  data,
  valueFormatter,
  emptyLabel,
}: {
  title: string;
  data: ChartDatum[];
  valueFormatter?: (value: number) => string;
  emptyLabel: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {data.length > 0 && (
          <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{data.length} items</span>
        )}
      </div>
      {data.length === 0 ? (
        <p style={{ color: '#6b7280', margin: 0 }}>{emptyLabel}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {data.map((item) => {
            const width = `${Math.max(4, (item.value / max) * 100)}%`;
            return (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{item.label}</span>
                  <span style={{ color: '#4b5563' }}>
                    {valueFormatter ? valueFormatter(item.value) : item.value.toFixed(2)}
                    {item.helper ? ` · ${item.helper}` : ''}
                  </span>
                </div>
                <div style={{ height: 10, background: '#f3f4f6', borderRadius: 999 }}>
                  <div
                    style={{
                      width,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TrendsPage() {
  const [preset, setPreset] = useState<Preset>('7');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState(analyticsCategories[0]?.id ?? 'all');
  const [analytics, setAnalytics] = useState<AnalyticsRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryConfig = useMemo(
    () => analyticsCategories.find((c) => c.id === category) ?? analyticsCategories[0],
    [category]
  );

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('mode', 'range');
      if (preset === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      } else {
        params.set('days', preset);
      }

      if (categoryConfig && categoryConfig.id !== 'all') {
        if (categoryConfig.metricKeys.length) params.set('metrics', categoryConfig.metricKeys.join(','));
        if (categoryConfig.habitIds.length) params.set('habits', categoryConfig.habitIds.join(','));
      }

      const resp = await fetch(`/api/analytics?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to load analytics');
      const data = (await resp.json()) as { range: AnalyticsRange };
      setAnalytics(data.range);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load analytics');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, category, from, to]);

  const metricChartData: ChartDatum[] = useMemo(() => {
    if (!analytics) return [];
    return analytics.metrics
      .filter((m) => m.average !== null)
      .map((metric) => ({
        label: formatMetricLabel(metric.key),
        value: metric.average ?? 0,
        helper: `${metric.samples} samples`,
      }));
  }, [analytics]);

  const habitChartData: ChartDatum[] = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.habits]
      .sort((a, b) => b.completion_rate - a.completion_rate)
      .map((habit) => ({
        label: formatHabitLabel(habit.habit_id),
        value: habit.completion_rate * 100,
        helper: `${habit.samples} check-ins`,
      }));
  }, [analytics]);

  const correlations = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.correlations].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }, [analytics]);

  return (
    <main style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <p style={{ color: '#6b7280', margin: 0 }}>Analytics</p>
          <h1 style={{ margin: 0 }}>Trends & insights</h1>
          <p style={{ color: '#6b7280', margin: '0.25rem 0 0' }}>
            Track metric averages, habit consistency, and how they relate over time.
          </p>
        </div>
        <button onClick={loadAnalytics} disabled={loading} style={{ padding: '0.5rem 0.75rem' }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Range</h3>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(['7', '30'] as Preset[]).map((value) => (
              <button
                key={value}
                onClick={() => setPreset(value)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 999,
                  border: '1px solid #e5e7eb',
                  background: preset === value ? '#dbeafe' : '#fff',
                  color: preset === value ? '#1d4ed8' : '#111827',
                  cursor: 'pointer',
                }}
              >
                {value}-day
              </button>
            ))}
            <button
              onClick={() => setPreset('custom')}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                background: preset === 'custom' ? '#dbeafe' : '#fff',
                color: preset === 'custom' ? '#1d4ed8' : '#111827',
                cursor: 'pointer',
              }}
            >
              Custom
            </button>
          </div>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem' }}>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ padding: '0.35rem', borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem' }}>
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ padding: '0.35rem', borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </label>
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem' }}>
            Category filter
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #e5e7eb' }}
            >
              {analyticsCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {categoryConfig?.description && (
              <small style={{ color: '#6b7280', marginTop: 4 }}>{categoryConfig.description}</small>
            )}
          </label>
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Entry volume</h3>
          {analytics ? (
            <>
              <p style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{analytics.entryCount}</p>
              <p style={{ margin: 0, color: '#6b7280' }}>entries captured in this window</p>
            </>
          ) : (
            <p style={{ color: '#6b7280', margin: 0 }}>No data yet. Save a journal entry to get started.</p>
          )}
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Consistency</h3>
          {analytics && analytics.habits.length > 0 ? (
            <>
              <p style={{ margin: 0 }}>
                Top habit completion in this window: <strong>{habitChartData[0].label}</strong>
              </p>
              <p style={{ margin: '0.35rem 0 0', color: '#6b7280' }}>
                Hover over charts below to dig deeper.
              </p>
            </>
          ) : (
            <p style={{ color: '#6b7280', margin: 0 }}>Log habit check-ins to see completion rates.</p>
          )}
        </div>
      </section>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <InlineBarChart
          title="Metric averages"
          data={metricChartData}
          valueFormatter={(v) => v.toFixed(2)}
          emptyLabel="No numeric metrics found in this range."
        />
        <InlineBarChart
          title="Habit completion"
          data={habitChartData}
          valueFormatter={(v) => `${v.toFixed(0)}%`}
          emptyLabel="No habit activity recorded for this filter."
        />
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem' }}>Habit ↔ Metric correlations</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Correlations show how habit completion aligns with metric shifts. Needs at least 2 paired samples.
            </p>
          </div>
        </div>
        {analytics && correlations.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {correlations.map((c) => (
              <div
                key={`${c.metric}-${c.habit}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}
              >
                <div>
                  <strong>{formatHabitLabel(c.habit)}</strong>
                  <span style={{ color: '#6b7280' }}> vs. {formatMetricLabel(c.metric)}</span>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>{c.samples} paired samples</div>
                </div>
                <div
                  style={{
                    minWidth: 120,
                    textAlign: 'right',
                    color: Math.abs(c.correlation) > 0.5 ? '#0ea5e9' : '#111827',
                  }}
                >
                  r = {c.correlation}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#6b7280', marginTop: '0.75rem' }}>
            Not enough overlapping habit + metric data yet. Track a numeric metric on the same days you log habits to
            unlock correlation insights.
          </p>
        )}
      </section>
    </main>
  );
}
