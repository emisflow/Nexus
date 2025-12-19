'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

import styles from './page.module.css';

export default function MarketingHome() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/app');
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <main className={styles.main}>
      <div className="container">
        <div className={styles.heroCard}>
          <span className={styles.eyebrow}>
            <span className={styles.badgeDot} />
            Daily journal, habit tracker, and health log
          </span>
          <div>
            <h1 className={styles.heroTitle}>Stay accountable in 10 minutes a day.</h1>
            <p className={styles.lede}>
              Nexus keeps your routines, metrics, and journal entries in one place. Capture what happened, see how
              you&apos;re trending, and keep nudges close with notifications across devices.
            </p>
          </div>

          <div className={styles.actions}>
            <Link href="/app" className={styles.primaryCta}>
              Open your dashboard
            </Link>
            <Link href="/sign-up" className={styles.secondaryCta}>
              Start a 14-day free trial
            </Link>
            <Link href="/app/settings" className={styles.secondaryCta}>
              Set up reminders
            </Link>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <span className={styles.badge}>
                <span className={styles.badgeDot} />
                Rituals that stick
              </span>
              <strong>Capture a daily check-in in under 3 minutes.</strong>
              <p className={styles.lede}>
                Track habits, log health metrics, and jot quick notes without juggling multiple apps or spreadsheets.
              </p>
            </div>
            <div className={styles.card}>
              <span className={styles.badge}>
                <span className={styles.badgeDot} />
                See your signals
              </span>
              <strong>Weekly and monthly snapshots keep you honest.</strong>
              <p className={styles.lede}>
                Compare consistency, spot streaks, and export your data when you need a deeper look.
              </p>
            </div>
            <div className={styles.card}>
              <span className={styles.badge}>
                <span className={styles.badgeDot} />
                Never miss a day
              </span>
              <strong>Notification-ready from day one.</strong>
              <p className={styles.lede}>
                Enable reminders to nudge you when it&apos;s time to journal or close your habits for the day.
              </p>
            </div>
          </div>

          <ul className={styles.inlineList}>
            <li>Private by default</li>
            <li>Data exports anytime</li>
            <li>Built for keyboard speed</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
