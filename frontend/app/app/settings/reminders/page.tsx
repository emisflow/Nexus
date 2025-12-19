'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

const DEFAULT_TZ = 'Asia/Dubai';

type Reminder = {
  id: string;
  type: string;
  timezone: string;
  hour: number;
  minute: number;
  enabled: boolean;
  next_run_at: string | null;
};

type ReminderFormState = {
  id?: string;
  type: string;
  time: string;
  enabled: boolean;
  timezone: string;
};

function formatNextRun(nextRun: string | null, timezone: string) {
  if (!nextRun) return 'Not scheduled';
  const date = new Date(nextRun);
  try {
    const fmt = new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || DEFAULT_TZ,
    });
    return `${fmt.format(date)} (${timezone || DEFAULT_TZ})`;
  } catch {
    return `${date.toLocaleString()} (${timezone || DEFAULT_TZ})`;
  }
}

function parseTime(time: string): { hour: number; minute: number } | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

async function fetchReminders(): Promise<Reminder[]> {
  const resp = await fetch('/api/reminders');
  if (!resp.ok) {
    throw new Error('Failed to load reminders');
  }
  const data = (await resp.json()) as { reminders: Reminder[] };
  return data.reminders ?? [];
}

async function saveReminder(payload: ReminderFormState) {
  const time = parseTime(payload.time);
  if (!time) throw new Error('Time is required in HH:MM');

  const resp = await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: payload.id,
      type: payload.type,
      hour: time.hour,
      minute: time.minute,
      timezone: payload.timezone || DEFAULT_TZ,
      enabled: payload.enabled,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'Failed to save reminder');
  }
}

async function deleteReminder(id: string) {
  const resp = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'Failed to delete reminder');
  }
}

async function triggerReminder(id: string) {
  const resp = await fetch(`/api/reminders/${id}/fire`, { method: 'POST' });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || 'Failed to trigger reminder');
  }
}

export default function ReminderSettingsPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<ReminderFormState>({
    type: 'daily_checkin',
    time: '09:00',
    enabled: true,
    timezone: DEFAULT_TZ,
  });

  const editingLabel = useMemo(() => (form.id ? 'Update reminder' : 'Create reminder'), [form.id]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReminders();
      setReminders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleEdit = (reminder: Reminder) => {
    const time = `${reminder.hour.toString().padStart(2, '0')}:${reminder.minute.toString().padStart(2, '0')}`;
    setForm({
      id: reminder.id,
      type: reminder.type,
      time,
      enabled: reminder.enabled,
      timezone: reminder.timezone || DEFAULT_TZ,
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFlash(null);
    const timeParsed = parseTime(form.time);
    if (!timeParsed) {
      setError('Time is required in HH:MM');
      return;
    }
    setSavingId(form.id ?? 'new');
    try {
      await saveReminder(form);
      setForm({ type: 'daily_checkin', time: '09:00', enabled: true, timezone: DEFAULT_TZ });
      await load();
      setFlash(form.id ? 'Reminder updated' : 'Reminder created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setSavingId(id);
    setError(null);
    setFlash(null);
    try {
      await deleteReminder(id);
      await load();
      setFlash('Reminder removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (reminder: Reminder) => {
    setSavingId(reminder.id);
    setError(null);
    setFlash(null);
    try {
      await saveReminder({
        id: reminder.id,
        type: reminder.type,
        time: `${reminder.hour.toString().padStart(2, '0')}:${reminder.minute.toString().padStart(2, '0')}`,
        enabled: !reminder.enabled,
        timezone: reminder.timezone || DEFAULT_TZ,
      });
      await load();
      setFlash(!reminder.enabled ? 'Reminder enabled' : 'Reminder disabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingId(null);
    }
  };

  const handleTrigger = async (reminder: Reminder) => {
    setSavingId(reminder.id);
    setError(null);
    setFlash(null);
    try {
      await triggerReminder(reminder.id);
      setFlash('Reminder queued to send now');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger reminder');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1>Reminders</h1>
        <p>Manage reminder schedules and push delivery.</p>
        {flash ? <p style={{ color: 'green' }}>{flash}</p> : null}
        {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      </div>

      <section style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
        <h2>{editingLabel}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label>
            Type
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              style={{ display: 'block' }}
            >
              <option value="daily_checkin">Daily check-in</option>
            </select>
          </label>
          <label>
            Time (HH:MM)
            <input
              type="time"
              required
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
            />
          </label>
          <label>
            Timezone
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            Enabled
          </label>
          <button type="submit" disabled={savingId !== null}>
            {form.id ? 'Update' : 'Create'}
          </button>
          {form.id ? (
            <button
              type="button"
              onClick={() => setForm({ type: 'daily_checkin', time: '09:00', enabled: true, timezone: DEFAULT_TZ })}
            >
              Cancel edit
            </button>
          ) : null}
        </form>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          Tip: push tokens come from the Notifications tab—send a test push there first, then schedule daily
          reminders here.
        </p>
      </section>

      <section style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
        <h2>Existing reminders</h2>
        {loading ? <p>Loading...</p> : null}
        {!loading && reminders.length === 0 ? <p>No reminders yet.</p> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {reminders.map((reminder) => (
            <div
              key={reminder.id}
              style={{
                border: '1px solid #eee',
                padding: '0.75rem',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{reminder.type}</strong>
                  <span>
                    Time: {reminder.hour.toString().padStart(2, '0')}:
                    {reminder.minute.toString().padStart(2, '0')} ({reminder.timezone || DEFAULT_TZ})
                  </span>
                  <span>Next run: {formatNextRun(reminder.next_run_at, reminder.timezone || DEFAULT_TZ)}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={reminder.enabled}
                      onChange={() => handleToggle(reminder)}
                      disabled={savingId === reminder.id}
                    />
                    Enabled
                  </label>
                  <button onClick={() => handleTrigger(reminder)} disabled={savingId === reminder.id}>
                    Send now
                  </button>
                  <button onClick={() => handleEdit(reminder)} disabled={savingId === reminder.id}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(reminder.id)} disabled={savingId === reminder.id}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
