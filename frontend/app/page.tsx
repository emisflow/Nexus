'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

export default function MarketingHome() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/app');
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <main style={{ padding: '2rem', display: 'grid', gap: '1rem', maxWidth: '720px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '2rem', margin: 0 }}>Nexus – your daily clarity ritual</h1>
        <p style={{ color: '#444', lineHeight: 1.6 }}>
          Capture your day, track habits and metrics, and get a quick snapshot of your progress. Sign in to jump straight
          into your dashboard.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Link
          href="/app"
          style={{
            background: '#111827',
            color: 'white',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            textDecoration: 'none',
          }}
        >
          Go to app
        </Link>
        <Link href="/app/settings" style={{ color: '#111827', textDecoration: 'underline' }}>
          Configure notifications
        </Link>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem', background: '#f9fafb' }}>
        <p style={{ margin: 0, color: '#374151' }}>
          Quick tip: enable push notifications in Settings to get daily reminder nudges.
        </p>
      </div>
    </main>
  );
}
