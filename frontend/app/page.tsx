'use client';

import Link from 'next/link';

export default function AppHome() {
  return (
    <main style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <h1>App Home</h1>
      <p>Navigate to settings to enable push notifications.</p>
      <Link href="/app/settings">Go to Notification Settings</Link>
    </main>
  );
}
