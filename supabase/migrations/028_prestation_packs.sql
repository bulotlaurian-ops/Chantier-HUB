-- 028 — Prestations liées (« packs »). Une prestation principale déclenche
-- l'ajout d'articles liés au devis (ex. Carrelage → pose + joints + baguettes).
-- Lecture : tous les authentifiés. Écriture : staff (admin + conducteur).

create table prestation_packs (
  id uuid primary key default gen_random_uuid(),
  prestation_id uuid not null references prestations(id) on delete cascade,
  prestation_liee_id uuid not null references prestations(id) on delete cascade,
  ordre integer default 0,
  created_at timestamptz default now(),
  unique (prestation_id, prestation_liee_id),
  check (prestation_id <> prestation_liee_id) -- pas d'auto-liaison
);
create index prestation_packs_prestation_id_idx on prestation_packs (prestation_id);

alter table prestation_packs enable row level security;

create policy prestation_packs_lecture on prestation_packs
  for select to authenticated using (true);

create policy prestation_packs_ecriture on prestation_packs
  for all to authenticated
  using  (current_role_app() = any (array['admin','conducteur']::role_app[]))
  with check (current_role_app() = any (array['admin','conducteur']::role_app[]));
