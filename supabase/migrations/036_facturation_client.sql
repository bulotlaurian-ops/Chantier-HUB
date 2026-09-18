-- =====================================================================
-- Chantier Hub — 036 : facturation client (v1)
-- =====================================================================
-- Une facture = un devis accepté, montant total (pas d'acompte, pas de facturation
-- partielle en v1 — cf. spec 2026-09-18-facturation-client-design.md). Les lignes sont
-- COPIÉES depuis lignes_devis au moment de la génération : une facture émise est un
-- document légalement figé, elle ne doit plus bouger même si le devis source est
-- modifié après coup (même principe que snapshots_marge). Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Statut de paiement. Nommé statut_facture_client (pas statut_facture, déjà pris
--    par factures_fournisseurs avec des valeurs différentes : a_valider / valide).
-- ---------------------------------------------------------------------
do $$ begin
  create type statut_facture_client as enum ('emise', 'payee');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- B. Numérotation légale : chronologique, sans trou, remise à zéro chaque année civile.
--    Même mécanique que generer_numero_devis (008_numerotation_et_defauts.sql) :
--    compteur atomique via insert ... on conflict ... returning (anti-race).
-- ---------------------------------------------------------------------
create table if not exists compteurs_factures (
  prefixe text primary key,
  dernier int not null default 0
);

create or replace function generer_numero_facture()
returns text language plpgsql set search_path = public as $$
declare p text := to_char(current_date,'YYYY'); n int;
begin
  insert into compteurs_factures(prefixe, dernier) values (p, 1)
  on conflict (prefixe) do update set dernier = compteurs_factures.dernier + 1
  returning dernier into n;
  return 'FA-' || p || '-' || lpad(n::text,3,'0');
end $$;

-- ---------------------------------------------------------------------
-- C. Tables.
-- ---------------------------------------------------------------------
create table if not exists factures (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  devis_id       uuid not null unique references devis(id),
  entite_id      uuid not null references entites(id),
  client_id      uuid not null references clients(id),
  date_emission  date not null default current_date,
  date_echeance  date not null,
  statut         statut_facture_client not null default 'emise',
  date_paiement  date,
  total_ht       numeric(14,2) not null,
  total_tva      numeric(14,2) not null,
  total_ttc      numeric(14,2) not null,
  arrondi        numeric(6,2) not null default 0,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create table if not exists lignes_facture (
  id                  uuid primary key default gen_random_uuid(),
  facture_id          uuid not null references factures(id) on delete cascade,
  ordre               int not null default 0,
  libelle             text not null,
  unite               text,
  quantite            numeric(12,2) not null,
  prix_unitaire_ht    numeric(12,2) not null,
  remise_pct          numeric(5,2) not null default 0,
  taux_tva            numeric(5,2) not null,
  total_ht            numeric(14,2) not null,
  est_option          boolean not null default false,
  est_titre           boolean not null default false
);

-- ---------------------------------------------------------------------
-- D. RLS. Même principe que devis (user_a_acces_entite couvre déjà admin/conducteur/
--    ouvrier en un seul appel, cf. 005_refonte_modele.sql). PAS de policy DELETE :
--    sous RLS, une commande sans aucune policy est refusée par défaut, y compris pour
--    un admin — c'est la garantie qu'une facture émise ne peut jamais être supprimée,
--    même par appel direct à l'API, pas seulement par absence de bouton côté UI.
-- ---------------------------------------------------------------------
alter table factures enable row level security;
alter table lignes_facture enable row level security;
alter table compteurs_factures enable row level security;

drop policy if exists factures_select on factures;
create policy factures_select on factures for select to authenticated
  using (user_a_acces_entite(entite_id));

drop policy if exists factures_insert on factures;
create policy factures_insert on factures for insert to authenticated
  with check (user_a_acces_entite(entite_id));

drop policy if exists factures_update on factures;
create policy factures_update on factures for update to authenticated
  using (user_a_acces_entite(entite_id)) with check (user_a_acces_entite(entite_id));

drop policy if exists lignes_facture_select on lignes_facture;
create policy lignes_facture_select on lignes_facture for select to authenticated
  using (exists (select 1 from factures f where f.id = facture_id and user_a_acces_entite(f.entite_id)));

drop policy if exists lignes_facture_insert on lignes_facture;
create policy lignes_facture_insert on lignes_facture for insert to authenticated
  with check (exists (select 1 from factures f where f.id = facture_id and user_a_acces_entite(f.entite_id)));

drop policy if exists compteurs_factures_staff on compteurs_factures;
create policy compteurs_factures_staff on compteurs_factures for all to authenticated
  using (current_role_app() in ('admin','conducteur'))
  with check (current_role_app() in ('admin','conducteur'));

-- ---------------------------------------------------------------------
-- E. GRANT explicite (le grant "on all tables" de la migration 032 ne couvre pas les
--    tables créées après coup — leçon déjà tirée dans ce repo, cf. 032).
-- ---------------------------------------------------------------------
grant select, insert, update, delete on factures, lignes_facture, compteurs_factures to authenticated;
