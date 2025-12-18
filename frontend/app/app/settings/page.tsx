'use client';

import { useState } from 'react';

function isOneSignalAvailable(): boolean {
  return typeof window !== 'undefined' && Array.isArray(window.OneSignalDeferred);
}

export default function NotificationSettingsPage() {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle');

  const requestPermission = async () => {
    if (typeof window === 'undefined') return;
    if (!isOneSignalAvailable()) {
      setStatus('error');
      return;
    }

    setStatus('requesting');

    window.OneSignalDeferred?.push(async (OneSignal) => {
      try {
        const permission = await OneSignal.Notifications.requestPermission();
        if (permission === 'granted') {
          setStatus('granted');
          const token = await OneSignal.User.PushSubscription.getId();
          const userId = window.localStorage.getItem('onesignal_last_user');
          if (token && userId) {
            await fetch('/api/notifications/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, platform: 'web' }),
            });
          }
        } else {
          setStatus('denied');
        }
      } catch (error) {
        console.error('OneSignal permission request failed', error);
        setStatus('error');
      }
    });
  };

  return (
    <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h1>Notification Settings</h1>
      <p>Enable push notifications to receive reminders.</p>
      <button onClick={requestPermission} style={{ width: '240px' }}>
        Enable push notifications
      </button>
      <p>Status: {status}</p>
    </main>
  );
}
