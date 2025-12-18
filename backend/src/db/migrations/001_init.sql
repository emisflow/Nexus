CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  hour integer NOT NULL,
  minute integer NOT NULL,
  days_of_week integer[] DEFAULT NULL,
  quiet_start time DEFAULT NULL,
  quiet_end time DEFAULT NULL,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, token)
);

CREATE TABLE IF NOT EXISTS job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  job_type text NOT NULL,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  template_id text,
  journal_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS entry_metrics (
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_num double precision,
  value_text text,
  PRIMARY KEY (entry_id, key)
);

CREATE TABLE IF NOT EXISTS entry_habits (
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL,
  completed boolean NOT NULL,
  PRIMARY KEY (entry_id, habit_id)
);

CREATE TABLE IF NOT EXISTS conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  field text NOT NULL,
  local_version text,
  remote_version text,
  status text NOT NULL DEFAULT 'unresolved',
  created_at timestamptz NOT NULL DEFAULT now()
);
