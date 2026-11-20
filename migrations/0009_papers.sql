-- Working-paper notes, bank rules, and remembered statement layouts.

create table if not exists entity_papers (
  entity_id text primary key references entities (id),
  payload text not null
);
