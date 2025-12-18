'use client';

import { OneSignalInitializer } from './OneSignalInitializer';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OneSignalInitializer />
      {children}
    </>
  );
}
