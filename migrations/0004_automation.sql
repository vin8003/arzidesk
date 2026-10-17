-- Assisted filing: kiosk companions, portal jobs, and recipe health.
-- See docs/automation.md.

-- A companion on an operator's PC. The token is shown once at pairing and
-- stored here only as a SHA-256 hash.
create table if not exists runner_devices (
  id text primary key,
  user_id text not null,
  name text not null default '',
  token_hash text not null unique,
  companion_version text not null default '',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists runner_devices_user_idx on runner_devices (user_id);

-- Short-lived codes typed into `companion pair`.
create table if not exists runner_pairings (
  code text primary key,
  user_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- One attempt at one portal action for one case step.
create table if not exists filing_jobs (
  id text primary key,
  user_id text not null,
  case_id text not null references cases(id) on delete cascade,
  step_kind text not null,
  recipe_id text not null,
  recipe_version integer not null,
  -- queued | running | waiting_human | submitting | succeeded | failed | needs_reconcile | cancelled
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  -- Strings the companion scrubs from uploaded DOM (name, email, text…).
  redact jsonb not null default '[]'::jsonb,
  gate jsonb,
  result jsonb,
  error text not null default '',
  failure text,
  device_id text references runner_devices(id) on delete set null,
  cancel_requested boolean not null default false,
  -- Set the moment before the irreversible click; after it a failure means reconcile.
  submit_started_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists filing_jobs_case_idx on filing_jobs (case_id, created_at desc);
create index if not exists filing_jobs_queue_idx on filing_jobs (user_id, status, created_at);
-- At most one live job per case step.
create unique index if not exists filing_jobs_one_active
  on filing_jobs (case_id, step_kind)
  where status in ('queued', 'running', 'waiting_human', 'submitting');

create table if not exists job_events (
  id text primary key,
  job_id text not null references filing_jobs(id) on delete cascade,
  user_id text not null,
  kind text not null,
  text text not null default '',
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_events_job_idx on job_events (job_id, created_at);

-- Screenshots, receipts, redacted DOM, field inventories. Capped at 1.5 MB each.
create table if not exists job_artifacts (
  id text primary key,
  job_id text not null references filing_jobs(id) on delete cascade,
  user_id text not null,
  kind text not null,
  name text not null default '',
  content_type text not null default 'application/octet-stream',
  body text not null,
  -- Safe to hand to the repair pipeline (redacted DOM, inventories). Screenshots never are.
  shareable boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists job_artifacts_job_idx on job_artifacts (job_id);

-- Last known shape of each recipe step, for drift detection and canaries.
create table if not exists recipe_health (
  recipe_id text not null,
  step_id text not null,
  recipe_version integer not null,
  good_fingerprint text not null default '',
  good_inventory jsonb,
  last_fingerprint text not null default '',
  last_inventory jsonb,
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  fail_count integer not null default 0,
  last_dispatch_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (recipe_id, step_id)
);
