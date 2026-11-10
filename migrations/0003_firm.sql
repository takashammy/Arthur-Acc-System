-- Sign-in is on. Drop the unowned sample rows from before accounts existed,
-- then scope every company to a firm.

delete from journal_lines;
delete from journals;
delete from accounts;
delete from periods;
delete from audit_events;
delete from entities;

create table if not exists firms (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists firm_members (
  firm_id text not null references firms (id),
  user_id text not null,
  role text not null check (role in ('partner', 'reviewer', 'preparer')),
  primary key (firm_id, user_id)
);

alter table entities add column if not exists firm_id text references firms (id);

create index if not exists entities_firm_idx on entities (firm_id);
create index if not exists firm_members_user_idx on firm_members (user_id);

create table if not exists bank_lines (
  id text primary key,
  entity_id text not null references entities (id),
  line_date date not null,
  description text not null,
  amount numeric(18, 2) not null,
  matched_journal_id text,
  created_at timestamptz not null default now()
);

create index if not exists bank_lines_entity_idx on bank_lines (entity_id);
