-- One case per citizen problem. Flow-specific facts live in `details` (JSON),
-- the citizen in `applicant`. Steps are created lazily, one per kind.
create table if not exists cases (
  id text primary key,
  user_id text not null,
  -- money | rti | consumer
  flow text not null,
  -- UP | RJ | MP | DL
  state text not null,
  lang text not null default 'hi',
  title text not null default '',
  scheme text,
  -- open | closed
  status text not null default 'open',
  outcome text not null default '',
  applicant jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  auto_appeal boolean not null default true,
  -- Denormalised from the flow engine for sorting the dashboard.
  next_action text not null default '',
  next_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cases_user_idx on cases (user_id, status, updated_at desc);

create table if not exists case_steps (
  id text primary key,
  case_id text not null references cases(id) on delete cascade,
  user_id text not null,
  kind text not null,
  -- pending | drafted | filed | done | skipped
  status text not null default 'pending',
  doc jsonb,
  doc_text text not null default '',
  generations integer not null default 0,
  filed_on date,
  reference text not null default '',
  mode text not null default '',
  via_apio boolean not null default false,
  delivered_on date,
  reply_on date,
  reply_text text not null default '',
  outcome text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, kind)
);

create index if not exists case_steps_user_idx on case_steps (user_id);

create table if not exists case_events (
  id text primary key,
  case_id text not null references cases(id) on delete cascade,
  user_id text not null,
  kind text not null,
  text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists case_events_case_idx on case_events (case_id, created_at desc);
