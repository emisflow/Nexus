'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

function ensureScriptInjected() {
  if (typeof window === 'undefined') return;
  const existing = document.querySelector('script[data-onesignal-sdk]');
  if (existing) return;
  const script = document.createElement('script');
  script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  script.async = true;
  script.setAttribute('data-onesignal-sdk', 'true');
  document.head.appendChild(script);
}

type OneSignalPushSubscriptionChange = {
  state?: {
    id?: string | null;
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
  }
}

async function registerToken(token: string | null | undefined, internalUserId: string) {
  if (!token) return;
  if (typeof window === 'undefined') return;

  const cachedUser = window.localStorage.getItem('onesignal_last_user');
  const cachedToken = window.localStorage.getItem('onesignal_last_token');

  if (cachedUser === internalUserId && cachedToken === token) {
    return;
  }

  await fetch('/api/notifications/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'web' }),
  });

  window.localStorage.setItem('onesignal_last_user', internalUserId);
  window.localStorage.setItem('onesignal_last_token', token);
}

export function OneSignalInitializer() {
  const { isSignedIn, isLoaded } = useAuth();
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;

    const loadUser = async () => {
      const resp = await fetch('/api/me');
      if (!resp.ok) return;
      const data = (await resp.json()) as { userId?: string };
      if (active && data.userId) {
        setInternalUserId(data.userId);
      }
    };

    loadUser();

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isSignedIn || !internalUserId || !appId) return;
    if (initializedRef.current) return;

    initializedRef.current = true;
    ensureScriptInjected();

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({ appId, allowLocalhostAsSecureOrigin: true });
      await OneSignal.login(internalUserId);

      const token = await OneSignal.User.PushSubscription.getId();
      await registerToken(token, internalUserId);

      OneSignal.User.PushSubscription.addEventListener('change', async (event: OneSignalPushSubscriptionChange) => {
        await registerToken(event.state?.id ?? (await OneSignal.User.PushSubscription.getId()), internalUserId);
      });
    });
  }, [internalUserId, isSignedIn]);

  return null;
}
