-- Year-end dates, practice role, tax adjustments.

alter table periods add column if not exists starts_on date;
alter table periods add column if not exists ends_on date;

alter table firms add column if not exists acting_role text not null default 'partner';

create table if not exists tax_adjustments (
  id text primary key,
  entity_id text not null references entities (id),
  label text not null,
  amount numeric(18, 2) not null,
  kind text not null check (kind in ('add', 'deduct', 'loss_bf'))
);

create index if not exists tax_adjustments_entity_idx on tax_adjustments (entity_id);
