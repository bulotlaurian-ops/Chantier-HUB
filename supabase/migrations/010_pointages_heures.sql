-- =====================================================================
-- Chantier Hub — 010 : suivi des heures (pointages) — calcul, validation, RLS, vue
-- =====================================================================
-- Branche l'écran « Suivi des heures » sur la table pointages (005).
-- Décisions actées : durée calculée depuis heure_debut/heure_fin (jamais saisie),
-- aucun verrou, split multi-chantiers/jour libre, heures_trajet décimal libre,
-- seule validation = heure_fin > heure_debut.
-- Idempotent (rejouable à blanc et sur la base live).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Durée calculée en base : heures_travaillees dérivé de la plage horaire.
--    Le client n'envoie jamais cette valeur (trigger autoritaire).
-- ---------------------------------------------------------------------
create or replace function calc_heures_pointage()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.heure_debut is not null and new.heure_fin is not null then
    new.heures_travaillees := round((extract(epoch from (new.heure_fin - new.heure_debut)) / 3600.0)::numeric, 2);
  else
    new.heures_travaillees := 0;
  end if;
  return new;
end $$;

drop trigger if exists trg_calc_heures_pointage on pointages;
create trigger trg_calc_heures_pointage
  before insert or update on pointages
  for each row execute function calc_heures_pointage();

-- ---------------------------------------------------------------------
-- B. Seule validation de saisie : refuser heure_fin <= heure_debut.
-- ---------------------------------------------------------------------
alter table pointages drop constraint if exists pointages_plage_valide;
alter table pointages add constraint pointages_plage_valide
  check (heure_debut is null or heure_fin is null or heure_fin > heure_debut);

-- ---------------------------------------------------------------------
-- C. RLS pointages — conducteur en lecture, limité à ses entités.
--    L'ancienne pointages_staff_read laissait un conducteur lire TOUS les
--    pointages : on la remplace par une lecture scopée à l'entité du chantier.
--    Admin = pointages_admin_all (ALL) ; ouvrier = pointages_ouvrier (CRUD sien).
-- ---------------------------------------------------------------------
drop policy if exists pointages_staff_read on pointages;
drop policy if exists pointages_conducteur_read on pointages;
create policy pointages_conducteur_read
  on pointages for select
  to authenticated
  using (
    current_role_app() = 'conducteur'::role_app
    and exists (
      select 1 from chantiers c
      where c.id = pointages.chantier_id
        and user_a_acces_entite(c.entite_id)
    )
  );

-- ---------------------------------------------------------------------
-- D. RLS profiles — un conducteur lit les profils OUVRIERS (nom des
--    pointeurs de ses chantiers). Sinon le nom ouvrier serait vide en UI.
-- ---------------------------------------------------------------------
drop policy if exists profiles_conducteur_read_ouvriers on profiles;
create policy profiles_conducteur_read_ouvriers
  on profiles for select
  to authenticated
  using (
    current_role_app() = 'conducteur'::role_app
    and role = 'ouvrier'::role_app
  );

-- ---------------------------------------------------------------------
-- E. RLS chantiers ouvrier — chantiers actifs OU chantiers où il a pointé.
--    (Remplace la version 006 limitée aux seuls chantiers actifs : permet de
--    relire un chantier clôturé dans son historique d'heures.)
-- ---------------------------------------------------------------------
drop policy if exists chantiers_ouvrier_read on chantiers;
create policy chantiers_ouvrier_read
  on chantiers for select
  to authenticated
  using (
    current_role_app() = 'ouvrier'::role_app
    and (
      statut = 'actif'::statut_chantier
      or exists (
        select 1 from pointages p
        where p.chantier_id = chantiers.id
          and p.ouvrier_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------
-- F. RLS clients ouvrier — client lié à un chantier actif OU à un chantier
--    où il a pointé (pour garder le nom client dans l'historique). MAJ 009.
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
        and (
          c.statut = 'actif'::statut_chantier
          or exists (
            select 1 from pointages p
            where p.chantier_id = c.id
              and p.ouvrier_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------
-- G. Vue chantier_couts_reels — coût MO = heures × taux.
--    Taux = taux_horaire du profil, à défaut le paramètre taux_horaire_defaut
--    (70 €/h, §9). Sans ce fallback le coût ressortait à 0 (taux profil nul).
-- ---------------------------------------------------------------------
create or replace view chantier_couts_reels as
select
  c.id as chantier_id,
  coalesce((
    select sum(p.heures_travaillees * coalesce(
             pr.taux_horaire,
             (select valeur::numeric from parametres where cle = 'taux_horaire_defaut')
           ))
    from pointages p
    join profiles pr on pr.id = p.ouvrier_id
    where p.chantier_id = c.id
  ), 0::numeric) as cout_mo_reel,
  coalesce((
    select sum(fr.montant_ht_affecte)
    from factures_repartition fr
    where fr.chantier_id = c.id
  ), 0::numeric) as cout_factures_reel
from chantiers c;
