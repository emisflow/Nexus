'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { UserButton } from '@clerk/nextjs';

import styles from './layout.module.css';

const navItems = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/settings', label: 'Settings' },
  { href: '/app/notifications', label: 'Notifications' },
];

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean).slice(1); // drop the first "app"

  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumbs">
      <Link href="/app">Home</Link>
      {segments.map((segment, index) => {
        const href = `/app/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;
        const label = segment.replace(/-/g, ' ');
        return (
          <span key={href} className={isLast ? styles.breadcrumbCurrent : undefined}>
            / <Link href={href}>{label}</Link>
          </span>
        );
      })}
    </nav>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span aria-hidden>🌀</span> Nexus
        </div>
        <div className={styles.navSection}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${pathname.startsWith(item.href) ? styles.navItemActive : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </aside>

      <section className={styles.main}>
        <div className={styles.topBar}>
          <Breadcrumbs />
          <div className={styles.statusPill}>
            <span aria-hidden>•</span> Synced & secure
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
