-- Prepaid wallet. Balance is one row per user; every change is a ledger row
-- written in the same statement, so the two never drift.
create table if not exists wallets (
  user_id text primary key,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_ledger (
  id text primary key,
  user_id text not null,
  -- welcome | topup | debit | refund | grant
  kind text not null,
  amount_paise bigint not null,
  balance_after bigint not null,
  task text,
  case_id text,
  step_id text,
  -- topup: Razorpay payment id; refund: the debit id; welcome: the user id.
  ref text,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_user_idx on wallet_ledger (user_id, created_at desc);

-- A payment, a refund or a welcome credit can land only once.
create unique index if not exists wallet_ledger_once_idx on wallet_ledger (kind, ref) where ref is not null;

-- Razorpay orders we created, so a webhook can credit the right wallet.
create table if not exists wallet_orders (
  order_id text primary key,
  user_id text not null,
  amount_paise bigint not null,
  status text not null default 'created',
  payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists wallet_orders_user_idx on wallet_orders (user_id, created_at desc);

-- Admin-controlled settings: task prices, welcome credit.
create table if not exists app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
