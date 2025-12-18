# Nexus

## Environment
- Backend: `CLERK_SECRET_KEY`, `DATABASE_URL`, `UPSTASH_REDIS_URL`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, optional `PORT`.
- Frontend: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ONESIGNAL_APP_ID` (OneSignal web push), and matching Clerk settings.

## Migrations
Run the SQL migration against Postgres:

```
psql $DATABASE_URL -f backend/src/db/migrations/001_init.sql
```

## Running locally
- API: `cd backend && npm install && npm run dev`
- Worker (reminders): `cd backend && npm run worker:reminders` (must have Redis/Upstash reachable)
- Frontend: `cd frontend && npm install && npm run dev`
- Tests (backend): `cd backend && npm test`

Keep the worker running in a separate process; in deploy, run it as a separate dyno/container so BullMQ jobs are processed.

## Deploy verification checklist
1) Environment
   - Backend: `CLERK_SECRET_KEY`, `DATABASE_URL`, `UPSTASH_REDIS_URL`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, optional `PORT`.
   - Frontend: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ONESIGNAL_APP_ID`.
2) Migrations
   - Apply SQL: `psql $DATABASE_URL -f backend/src/db/migrations/001_init.sql`
3) Processes
   - API running with the above envs.
   - Worker running separately: `npm run worker:reminders` (BullMQ needs Redis).
4) OneSignal
   - Confirm app id and REST key match the configured OneSignal app.
5) Upstash Redis
   - Confirm `UPSTASH_REDIS_URL` points to the correct instance.
6) Clerk
   - Confirm publishable/secret keys match the target environment.
7) Smoke tests (once running)
   - API health: `curl -i https://<api>/health`
   - Reminders auth check (requires token): `curl -H "Authorization: Bearer <clerk_jwt>" https://<api>/api/reminders`
