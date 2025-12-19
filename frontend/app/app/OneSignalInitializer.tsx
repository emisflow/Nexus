'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';

const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

const MAX_TOKEN_RETRIES = 3;
const TOKEN_RETRY_DELAY_MS = 1500;

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

  const response = await fetch('/api/notifications/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'web' }),
  });

  if (!response.ok) {
    console.error('[OneSignal] Failed to persist token', response.status);
  } else {
    const body = await response.json();
    console.log('[OneSignal] Token persisted via /api/notifications/register', body);
  }

  window.localStorage.setItem('onesignal_last_user', internalUserId);
  window.localStorage.setItem('onesignal_last_token', token);
}

async function requestPermissionAndLog(OneSignal: any) {
  const permission = await OneSignal.Notifications.requestPermission();
  console.log('[OneSignal] Notification permission', permission);
  return permission;
}

async function fetchTokenWithRetry(OneSignal: any, attempt = 0): Promise<string | undefined> {
  const token = await OneSignal.User.PushSubscription.getId();

  if (token) {
    console.log(`[OneSignal] Push token obtained (attempt ${attempt + 1})`, token);
    return token;
  }

  if (attempt >= MAX_TOKEN_RETRIES - 1) {
    console.warn('[OneSignal] Push token still missing after retries');
    return undefined;
  }

  const delay = TOKEN_RETRY_DELAY_MS * (attempt + 1);
  console.warn(`[OneSignal] Push token unavailable, retrying in ${delay}ms`);
  await new Promise((resolve) => setTimeout(resolve, delay));

  return fetchTokenWithRetry(OneSignal, attempt + 1);
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

      await requestPermissionAndLog(OneSignal);

      const token = await fetchTokenWithRetry(OneSignal);
      await registerToken(token, internalUserId);

      OneSignal.User.PushSubscription.addEventListener('change', async (event: OneSignalPushSubscriptionChange) => {
        const subscriptionId = event.state?.id ?? (await OneSignal.User.PushSubscription.getId());
        console.log('[OneSignal] Push token changed', subscriptionId);
        await registerToken(subscriptionId, internalUserId);
      });
    });
  }, [internalUserId, isSignedIn]);

  return null;
}
