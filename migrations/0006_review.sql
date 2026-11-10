-- Review of a company's file, and the documents still asked of the client.
-- Signing is a status on the file. It does not require a login.

create table if not exists reviews (
  entity_id text primary key references entities (id),
  status text not null check (status in ('draft', 'submitted', 'returned', 'reviewed', 'signed', 'released')),
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists client_requests (
  id text primary key,
  entity_id text not null references entities (id),
  title text not null,
  detail text not null default '',
  status text not null check (status in ('open', 'received')),
  document_id text references documents (id)
);
