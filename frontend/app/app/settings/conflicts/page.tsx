'use client';

import { useEffect, useMemo, useState } from 'react';

interface Conflict {
  id: string;
  entry_id: string;
  entry_date: string;
  local_version: string | null;
  remote_version: string | null;
}

function highlightLines(text: string, other: string) {
  const lines = text.split('\n');
  const otherLines = other.split('\n');
  const max = Math.max(lines.length, otherLines.length);
  const rows = [] as Array<{ line: string; changed: boolean }>;
  for (let i = 0; i < max; i += 1) {
    const line = lines[i] ?? '';
    const otherLine = otherLines[i] ?? '';
    rows.push({ line, changed: line !== otherLine });
  }
  return rows;
}

async function fetchConflicts(): Promise<Conflict[]> {
  const resp = await fetch('/api/conflicts');
  if (!resp.ok) {
    throw new Error('Failed to load conflicts');
  }
  const data = (await resp.json()) as { conflicts: Conflict[] };
  return data.conflicts ?? [];
}

async function resolveConflict(conflictId: string, action: 'keep_current' | 'use_other' | 'merge_manual', mergedText?: string) {
  const resp = await fetch(`/api/conflicts/${conflictId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, mergedText }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'Failed to resolve conflict');
  }
}

export default function ConflictCenterPage() {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalConflict, setModalConflict] = useState<Conflict | null>(null);
  const [mergeText, setMergeText] = useState('');
  const [saving, setSaving] = useState(false);

  const diffRows = useMemo(() => {
    if (!modalConflict) return [] as ReturnType<typeof highlightLines>;
    return highlightLines(modalConflict.local_version ?? '', modalConflict.remote_version ?? '');
  }, [modalConflict]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConflicts();
      setConflicts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conflicts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = (conflict: Conflict) => {
    setModalConflict(conflict);
    const current = conflict.local_version ?? '';
    const other = conflict.remote_version ?? '';
    setMergeText(`${current}\n-----\n${other}`);
  };

  const handleResolve = async (action: 'keep_current' | 'use_other' | 'merge_manual') => {
    if (!modalConflict) return;
    setSaving(true);
    setError(null);
    try {
      await resolveConflict(modalConflict.id, action, action === 'merge_manual' ? mergeText : undefined);
      setModalConflict(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1>Resolve Center</h1>
        <p>Review and resolve unresolved journal conflicts.</p>
      </div>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      {loading ? <p>Loading...</p> : null}
      {!loading && conflicts.length === 0 ? <p>No unresolved conflicts.</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {conflicts.map((conflict) => (
          <button
            key={conflict.id}
            onClick={() => openModal(conflict)}
            style={{ textAlign: 'left', padding: '0.75rem', border: '1px solid #eee', borderRadius: '6px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div>
                <strong>{conflict.entry_date}</strong>
                <div style={{ color: '#555' }}>
                  {(conflict.local_version ?? '').slice(0, 80) || 'No content'}
                </div>
              </div>
              <span>Review</span>
            </div>
          </button>
        ))}
      </div>

      {modalConflict ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ background: 'white', padding: '1rem', maxWidth: '1000px', width: '100%', borderRadius: '8px' }}>
            <h2>Review conflict</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h3>This device</h3>
                <div style={{ border: '1px solid #eee', padding: '0.5rem', borderRadius: '6px', background: '#fafafa' }}>
                  {diffRows.map((row, idx) => (
                    <div key={idx} style={{ background: row.changed ? '#ffecec' : 'transparent', whiteSpace: 'pre-wrap' }}>
                      {row.line}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>Other version</h3>
                <div style={{ border: '1px solid #eee', padding: '0.5rem', borderRadius: '6px', background: '#fafafa' }}>
                  {(modalConflict.remote_version ?? '').split('\n').map((line, idx) => (
                    <div key={idx} style={{ background: diffRows[idx]?.changed ? '#e6f3ff' : 'transparent', whiteSpace: 'pre-wrap' }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                Manual merge text
                <textarea
                  value={mergeText}
                  onChange={(e) => setMergeText(e.target.value)}
                  rows={6}
                  style={{ width: '100%' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button onClick={() => handleResolve('keep_current')} disabled={saving}>
                Keep current
              </button>
              <button onClick={() => handleResolve('use_other')} disabled={saving}>
                Use other
              </button>
              <button onClick={() => handleResolve('merge_manual')} disabled={saving}>
                Resolve with manual merge
              </button>
              <button onClick={() => setModalConflict(null)} style={{ marginLeft: 'auto' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
