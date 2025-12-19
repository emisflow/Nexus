'use client';

import { useMemo, useState } from 'react';

const MAX_TOKEN_RETRIES = 3;
const TOKEN_RETRY_DELAY_MS = 1500;

function isOneSignalAvailable(): boolean {
  return typeof window !== 'undefined' && Array.isArray(window.OneSignalDeferred);
}

export default function NotificationSettingsPage() {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'error'>('idle');
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'registering' | 'registered' | 'failed'>('idle');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [message, setMessage] = useState('Test push notification from settings');

  const buttonDisabled = useMemo(() => status === 'requesting' || tokenStatus === 'registering', [status, tokenStatus]);

  const fetchTokenWithRetry = async (OneSignal: any, attempt = 0): Promise<string | undefined> => {
    const token = await OneSignal.User.PushSubscription.getId();

    if (token) {
      console.log(`[OneSignal] Push token fetched from settings (attempt ${attempt + 1})`, token);
      return token;
    }

    if (attempt >= MAX_TOKEN_RETRIES - 1) {
      console.warn('[OneSignal] No push token after retries from settings page');
      return undefined;
    }

    const delay = TOKEN_RETRY_DELAY_MS * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delay));

    return fetchTokenWithRetry(OneSignal, attempt + 1);
  };

  const sendTestPush = async () => {
    setSendStatus('sending');

    try {
      const resp = await fetch('/notifications/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!resp.ok) {
        throw new Error(`Unexpected status ${resp.status}`);
      }

      console.log('[OneSignal] Test notification trigger response', await resp.json());
      setSendStatus('sent');
    } catch (error) {
      console.error('Failed to send test push', error);
      setSendStatus('error');
    }
  };

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
        console.log('[OneSignal] Permission result from settings page', permission);
        if (permission === 'granted') {
          setStatus('granted');
          setTokenStatus('registering');

          const token = await fetchTokenWithRetry(OneSignal);
          const userId = window.localStorage.getItem('onesignal_last_user');
          setLastToken(token ?? null);

          if (token && userId) {
            const response = await fetch('/api/notifications/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, platform: 'web' }),
            });

            if (!response.ok) {
              throw new Error(`Failed to register token (${response.status})`);
            }

            const body = await response.json();
            console.log('[OneSignal] Token registration response', body);
            setTokenStatus('registered');
          } else {
            console.warn('[OneSignal] Missing token or user id when trying to register');
            setTokenStatus('failed');
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
      <button onClick={requestPermission} disabled={buttonDisabled} style={{ width: '240px' }}>
        Enable push notifications
      </button>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '320px' }}>
        <span>Test notification message</span>
        <input value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <button onClick={sendTestPush} disabled={sendStatus === 'sending'} style={{ width: '240px' }}>
        Send test push
      </button>
      <p>Status: {status}</p>
      <p>Token status: {tokenStatus}</p>
      <p>Last token: {lastToken ?? 'None'}</p>
      <p>Test push: {sendStatus}</p>
    </main>
  );
}
