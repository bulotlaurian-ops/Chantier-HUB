-- =====================================================================
-- Chantier Hub — 009 : RLS ouvrier — lecture entités + clients liés
-- =====================================================================
-- Corrige un écart de cloisonnement relevé en test : l'ouvrier voyait ses
-- chantiers actifs mais ne pouvait lire NI `entites` NI `clients`, donc sans
-- nom d'entité ni de client en UI. CLAUDE.md §3 : les données partagées
-- restent visibles au staff. On ouvre donc en LECTURE SEULE :
--   • entites  → à tout utilisateur authentifié (admin/conducteur/ouvrier) ;
--   • clients  → à l'ouvrier, limité aux clients ayant un chantier ACTIF.
-- On N'OUVRE PAS prestations/tarifs : l'ouvrier ne doit voir ni prix ni marges.
-- Les policies ALL existantes (admin/conducteur) restent inchangées (écritures).
-- Idempotent (rejouable à blanc et sur la base live).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. entites : lecture pour tout authentifié (en plus du ALL staff)
-- ---------------------------------------------------------------------
drop policy if exists entites_read_authenticated on entites;
create policy entites_read_authenticated
  on entites for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- B. clients : lecture ouvrier limitée aux clients d'un chantier actif
-- ---------------------------------------------------------------------
drop policy if exists clients_ouvrier_read on clients;
create policy clients_ouvrier_read
  on clients for select
  to authenticated
  using (
    current_role_app() = 'ouvrier'::role_app
    and exists (
      select 1 from chantiers c
      where c.client_id = clients.id
        and c.statut = 'actif'::statut_chantier
    )
  );
