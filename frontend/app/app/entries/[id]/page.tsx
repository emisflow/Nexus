'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

interface EntryResponse {
  entry: {
    id: string;
    journal_text: string | null;
    entry_date: string;
    updated_at: string;
  };
  conflicts: Conflict[];
}

interface Conflict {
  id: string;
  field: string;
  local_version: string | null;
  remote_version: string | null;
  status: string;
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

async function fetchEntry(id: string): Promise<EntryResponse> {
  const resp = await fetch(`/api/entries/${id}`);
  if (!resp.ok) {
    throw new Error('Failed to load entry');
  }
  return resp.json();
}

async function resolve(conflictId: string, action: 'keep_current' | 'use_other' | 'merge_manual', mergedText?: string) {
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

export default function EntryPage() {
  const params = useParams<{ id: string }>();
  const entryId = params?.id;
  const [entry, setEntry] = useState<EntryResponse | null>(null);
  const [journalText, setJournalText] = useState('');
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [mergePending, setMergePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const conflict = useMemo(() => entry?.conflicts[0], [entry]);
  const isDirty = useMemo(() => journalText !== (entry?.entry.journal_text ?? ''), [journalText, entry]);

  const load = async () => {
    if (!entryId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEntry(entryId);
      setEntry(data);
      setJournalText(data.entry.journal_text ?? '');
      setBaseUpdatedAt(data.entry.updated_at);
      setShowBanner(true);
      setMergePending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const handleKeep = async () => {
    if (!conflict) return;
    await resolve(conflict.id, 'keep_current');
    await load();
    setModalOpen(false);
  };

  const handleUseOther = async () => {
    if (!conflict) return;
    await resolve(conflict.id, 'use_other');
    await load();
    setModalOpen(false);
  };

  const handlePrepareMerge = () => {
    if (!conflict) return;
    const current = conflict.local_version ?? journalText ?? '';
    const other = conflict.remote_version ?? '';
    setJournalText(`${current}\n-----\n${other}`);
    setMergePending(true);
    setModalOpen(false);
  };

  const handleApplyMerge = async () => {
    if (!conflict) return;
    await resolve(conflict.id, 'merge_manual', journalText);
    await load();
  };

  const handleSave = async () => {
    if (!entry) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      entryDate: entry.entry.entry_date,
      journalText,
      baseUpdatedAt: baseUpdatedAt ?? undefined,
    };

    try {
      const resp = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || 'Failed to save entry');
      }

      const data = (await resp.json()) as { entry: EntryResponse['entry']; conflictId?: string | null };

      if (data.conflictId) {
        const userText = journalText;
        await load();
        setJournalText(userText);
        setShowBanner(true);
      } else {
        await load();
      }

      setBaseUpdatedAt(data.entry.updated_at);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const diffRows = useMemo(() => {
    if (!conflict) return [] as ReturnType<typeof highlightLines>;
    return highlightLines(conflict.local_version ?? '', conflict.remote_version ?? '');
  }, [conflict]);

  if (loading) return <main style={{ padding: '1rem' }}>Loading entry...</main>;
  if (error) return <main style={{ padding: '1rem' }}>{error}</main>;
  if (!entry) return <main style={{ padding: '1rem' }}>Entry not found.</main>;

  return (
    <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header>
        <h1>Entry {entry.entry.entry_date}</h1>
      </header>

      {conflict && showBanner ? (
        <div
          style={{
            border: '1px solid #f0ad4e',
            background: '#fff3cd',
            padding: '0.75rem',
            borderRadius: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div>
            <strong>Conflict copy saved</strong>
            <p style={{ margin: 0 }}>We found two versions of this journal entry.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={() => setModalOpen(true)}>Review</button>
            <button onClick={() => setShowBanner(false)}>Dismiss</button>
          </div>
        </div>
      ) : null}

      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Journal text
          <textarea
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            rows={10}
            style={{ width: '100%' }}
          />
        </label>
        {mergePending && conflict ? (
          <button onClick={handleApplyMerge}>Resolve with merged text</button>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {isDirty ? <span style={{ color: '#666' }}>Unsaved changes</span> : null}
          {saveError ? <span style={{ color: 'red' }}>{saveError}</span> : null}
        </div>
      </section>

      {modalOpen && conflict ? (
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
          <div style={{ background: 'white', padding: '1rem', maxWidth: '900px', width: '100%', borderRadius: '8px' }}>
            <h2>Review conflict</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h3>This device</h3>
                <div
                  style={{ border: '1px solid #eee', padding: '0.5rem', borderRadius: '6px', background: '#fafafa' }}
                >
                  {diffRows.map((row, idx) => (
                    <div key={idx} style={{ background: row.changed ? '#ffecec' : 'transparent', whiteSpace: 'pre-wrap' }}>
                      {row.line}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>Other version</h3>
                <div
                  style={{ border: '1px solid #eee', padding: '0.5rem', borderRadius: '6px', background: '#fafafa' }}
                >
                  {(conflict.remote_version ?? '').split('\n').map((line, idx) => (
                    <div key={idx} style={{ background: diffRows[idx]?.changed ? '#e6f3ff' : 'transparent', whiteSpace: 'pre-wrap' }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button onClick={handleKeep}>Keep current</button>
              <button onClick={handleUseOther}>Use other</button>
              <button onClick={handlePrepareMerge}>Merge manually</button>
              <button onClick={() => setModalOpen(false)} style={{ marginLeft: 'auto' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
