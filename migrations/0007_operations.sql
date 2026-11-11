-- Payroll, stock, leases, and group eliminations.
-- MPF figures are calculated in the app, not stored as rules.

create table if not exists employees (
  id text primary key,
  entity_id text not null references entities (id),
  name text not null,
  monthly_pay numeric(18, 2) not null
);

create table if not exists pay_slips (
  id text primary key,
  entity_id text not null references entities (id),
  employee_id text not null references employees (id),
  paid_on date not null,
  gross numeric(18, 2) not null,
  employee_mpf numeric(18, 2) not null,
  employer_mpf numeric(18, 2) not null,
  net_pay numeric(18, 2) not null,
  journal_id text
);

create table if not exists stock_items (
  id text primary key,
  entity_id text not null references entities (id),
  sku text not null,
  name text not null,
  qty numeric(18, 2) not null,
  unit_cost numeric(18, 2) not null
);

create table if not exists leases (
  id text primary key,
  entity_id text not null references entities (id),
  name text not null,
  started date not null,
  months integer not null,
  payment numeric(18, 2) not null,
  annual_rate numeric(8, 4) not null,
  cost numeric(18, 2) not null,
  liability numeric(18, 2) not null,
  posted_months integer not null
);

create table if not exists eliminations (
  id text primary key,
  debit_code text not null,
  credit_code text not null,
  amount numeric(18, 2) not null,
  reason text not null,
  eliminated_on date not null
);
