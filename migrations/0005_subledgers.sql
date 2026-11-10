-- Invoice subledger, fixed-asset register, and the registered office used by NAR1.

alter table entities add column if not exists registered_office text;

create table if not exists invoices (
  id text primary key,
  entity_id text not null references entities (id),
  kind text not null check (kind in ('receivable', 'payable')),
  party text not null,
  invoice_no text not null,
  invoice_date date not null,
  due_date date not null,
  amount numeric(18, 2) not null,
  unique (entity_id, invoice_no)
);

create index if not exists invoices_entity_idx on invoices (entity_id, invoice_date);

create table if not exists invoice_settlements (
  id text primary key,
  invoice_id text not null references invoices (id),
  settled_on date not null,
  amount numeric(18, 2) not null,
  journal_id text references journals (id)
);

create table if not exists fixed_assets (
  id text primary key,
  entity_id text not null references entities (id),
  name text not null,
  category text not null check (category in ('building', 'plant')),
  acquired date not null,
  cost numeric(18, 2) not null,
  disposed date,
  proceeds numeric(18, 2) not null default 0,
  tax_wdv numeric(18, 2)
);
