# Product Specification

## Platform Decisions
- **Authentication:** Clerk (Next.js middleware + API auth via `auth().userId`).
- **Jobs/Queues:** BullMQ backed by **Upstash Redis** (queues: `reminders`, `sync` later).
- **Push Delivery:** **OneSignal** (Web Push now; mobile push later via same provider).
- **Mobile:** Capacitor-first wrapper for the Next.js app, with local SQLite encrypted by SQLCipher.

## Architecture

### Authentication (Clerk)
- Next.js: wrap the app with `<ClerkProvider>` and add middleware protecting `/app/*` and authenticated API routes (excluding public webhooks/health).
- API handlers read `auth().userId`; requests without a user are rejected.
- DB mapping: `users(id uuid pk, clerk_user_id text unique not null, created_at, ...)`.
- First request: upsert into `users` where `clerk_user_id = userId` and reuse the internal `id` as OneSignal external user ID.
- Required env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

### Jobs (BullMQ + Upstash Redis)
- Queues: `reminders` (today) and `sync` (future work).
- Worker: dedicated Node process (e.g., `worker/reminders.worker.ts`).
- Redis: Upstash connection via `UPSTASH_REDIS_URL` (BullMQ/ioredis).
- Related tables:
  - `reminders(id uuid pk, user_id uuid fk, type text, hour int, minute int, timezone text, enabled bool, last_sent_at timestamptz, created_at)`
  - `notification_tokens(id uuid pk, user_id uuid fk, provider text, token text, platform text, updated_at)`
  - `job_logs(id uuid pk, user_id uuid, job_type text, status text, error text, created_at)`

### Push (OneSignal)
- Frontend registers OneSignal Web Push; on subscription change, call `POST /api/notifications/register { token, platform }`.
- External user ID = internal `users.id` (UUID). Prefer `include_external_user_ids`, fallback to stored player tokens.
- Reminder flow: create/update reminder → schedule next occurrence → job runs → send push → reschedule next.
- Required env: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`.

### Endpoints (minimal set)
- `POST /api/me/ensure` (optional; can be implicit on first authenticated request)
- `POST /api/reminders` (create/update)
- `GET /api/reminders`
- `POST /api/notifications/register`
- `POST /api/entries` (daily logs)
- `GET /api/entries?from=&to=`

### Configuration summary
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: Clerk auth keys.
- `DATABASE_URL`: Postgres connection string (for users, reminders, entries, tokens, conflicts, job logs).
- `UPSTASH_REDIS_URL`: Redis connection string for BullMQ queues.
- `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`: OneSignal push credentials.
- `PORT` (optional): HTTP port for the Express server (defaults to `3000`).

## Journal Conflict Resolution UX
- Pattern: non-blocking banner + Resolve Center. Never interrupt mid-typing; save both copies.
- Storage: keep `entry_text_current` (winner) and `entry_text_conflict_copy` (other). Record in `conflicts(id, entry_id, field='journal_text', local_version, remote_version, created_at, status='unresolved')`.
- Auto-resolve silent if differences are only whitespace/punctuation.
- Text conflicts: always create a conflict copy (safe default). Metrics/habits: last-write-wins (optional audit log later).
- UI banner (per entry): Title “Conflict copy saved”; Subtitle “We found two versions of this journal entry.” Buttons: **Review** | **Dismiss**.
- Review modal: two-pane diff (`This device` vs `Other device`), highlight changed lines. Actions: **Keep this**, **Use other**, **Merge manually** (prefill editor with one side and append the other below a divider). Always keep an “Archived copy” accessible.
- Resolve Center (Settings → Conflicts): list unresolved conflicts with date + entry title snippet. No “Resolve all” needed for v1; open items individually.

## Mobile Strategy + Local Encryption
- Decision: **Capacitor-first** wrapping the Next.js app for iOS/Android.
- Local DB: **SQLite** encrypted with **SQLCipher**. Offline-first: writes go to local DB immediately; sync service pushes queued events when online. Server holds canonical events in Postgres.
- If web-only now: PWA + IndexedDB (Dexie) without strong at-rest encryption; treat as best-effort privacy.

## Onboarding Flow & Default Templates
- Screen 1: Welcome → choose **Simple** or **Detailed** (`onboarding.mode`).
- Screen 2: What to track → toggles (Sleep, Mood, Energy, Stress, Water, Habits, Workout, Study, Nutrition optional, Symptoms optional). Outputs enabled metrics/templates.
- Screen 3: Habits setup → defaults per mode. Simple: Water, Walk/Workout, Read/Study, Skincare, Journal. Detailed: add Stretching, Protein target, Steps target, etc. Output: `habits[]`.
- Screen 4: Reminder → time picker + days (daily default) with quiet hours default 11pm–8am. Output: `reminders[]`.
- Screen 5: Done → land on Today view with the Daily Check-in template ready to log.
