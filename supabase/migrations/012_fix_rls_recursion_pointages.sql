-- =====================================================================
-- Chantier Hub — 012 : casse la récursion RLS pointages ↔ chantiers ↔ clients
-- =====================================================================
-- Les policies de la 010 se référençaient mutuellement (chantiers_ouvrier_read
-- lit pointages ; pointages_conducteur_read et clients_ouvrier_read lisent
-- chantiers) → "infinite recursion detected in policy". On déplace ces lectures
-- croisées dans des fonctions SECURITY DEFINER (qui ne re-déclenchent pas la RLS),
-- puis on recrée les 3 policies en les appelant. Comportement inchangé.
-- Idempotent.
-- =====================================================================

-- entité d'un chantier (sans RLS) — pour scoper la lecture conducteur des pointages.
create or replace function chantier_entite(p_chantier uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select entite_id from chantiers where id = p_chantier;
$$;

-- l'ouvrier courant a-t-il pointé sur ce chantier ? (sans RLS)
create or replace function ouvrier_a_pointe(p_chantier uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from pointages
    where chantier_id = p_chantier and ouvrier_id = auth.uid()
  );
$$;

-- l'ouvrier courant voit-il ce client ? (chantier actif OU chantier où il a pointé) (sans RLS)
create or replace function ouvrier_voit_client(p_client uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from chantiers c
    where c.client_id = p_client
      and (c.statut = 'actif'::statut_chantier or ouvrier_a_pointe(c.id))
  );
$$;

-- Recréation des policies sans référence directe à une autre table sous RLS.
drop policy if exists pointages_conducteur_read on pointages;
create policy pointages_conducteur_read
  on pointages for select to authenticated
  using (
    current_role_app() = 'conducteur'::role_app
    and user_a_acces_entite(chantier_entite(chantier_id))
  );

drop policy if exists chantiers_ouvrier_read on chantiers;
create policy chantiers_ouvrier_read
  on chantiers for select to authenticated
  using (
    current_role_app() = 'ouvrier'::role_app
    and (statut = 'actif'::statut_chantier or ouvrier_a_pointe(id))
  );

drop policy if exists clients_ouvrier_read on clients;
create policy clients_ouvrier_read
  on clients for select to authenticated
  using (
    current_role_app() = 'ouvrier'::role_app
    and ouvrier_voit_client(id)
  );
