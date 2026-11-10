-- Ledger persistence. Rows are unowned until sign-in is turned on (step 2).
-- Amounts are numeric so debit = credit can be checked in SQL.

create table if not exists entities (
  id text primary key,
  name text not null,
  cr_number text not null,
  currency text not null default 'HKD',
  year_end text not null
);

create table if not exists periods (
  entity_id text not null references entities (id),
  label text not null,
  status text not null check (status in ('open', 'locked')),
  primary key (entity_id, label)
);

create table if not exists accounts (
  id text primary key,
  entity_id text not null references entities (id),
  code text not null,
  name text not null,
  type text not null,
  flow text,
  unique (entity_id, code)
);

create table if not exists journals (
  id text primary key,
  entity_id text not null references entities (id),
  voucher_number text not null,
  journal_date date not null,
  reason text not null,
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  unique (entity_id, voucher_number)
);

create table if not exists journal_lines (
  id text primary key,
  journal_id text not null references journals (id),
  account_id text not null references accounts (id),
  debit numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  description text not null default '',
  line_no integer not null
);

create index if not exists journal_lines_journal_idx on journal_lines (journal_id);

create table if not exists audit_events (
  id text primary key,
  entity_id text,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_idx on audit_events (created_at desc);
