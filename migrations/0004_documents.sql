-- Evidence files and company-secretarial registers.
-- File bodies stay in the database so they survive a restart.

alter table entities add column if not exists incorporated date;

create table if not exists documents (
  id text primary key,
  entity_id text not null references entities (id),
  filename text not null,
  mime text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists documents_entity_idx on documents (entity_id);

create table if not exists evidence_links (
  id text primary key,
  document_id text not null references documents (id),
  journal_id text not null references journals (id),
  unique (document_id, journal_id)
);

create table if not exists company_officers (
  id text primary key,
  entity_id text not null references entities (id),
  role text not null check (role in ('director', 'shareholder', 'secretary')),
  name text not null,
  detail text not null default '',
  appointed date not null
);
