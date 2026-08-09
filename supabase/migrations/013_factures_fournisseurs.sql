-- =====================================================================
-- Chantier Hub — 013 : factures fournisseurs (circuit manuel) — calcul, validation, RLS, vue
-- =====================================================================
-- Branche l'écran « Factures fournisseurs » sur factures_fournisseurs +
-- factures_repartition (005). Statuts a_valider → valide ; seule une facture
-- validée entre dans les coûts réels. Répartition multi-chantiers ; Σ = montant
-- HT exigée À LA VALIDATION (pas à la saisie). Anti-récursion RLS via SECURITY
-- DEFINER (cf. 012). Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Ownership : qui a créé la facture (scope conducteur sur ses brouillons).
-- ---------------------------------------------------------------------
alter table factures_fournisseurs
  add column if not exists cree_par uuid default auth.uid() references profiles(id);

-- ---------------------------------------------------------------------
-- B. montant_ttc dérivé (jamais saisi).
-- ---------------------------------------------------------------------
create or replace function calc_ttc_facture()
returns trigger language plpgsql set search_path = public as $$
begin
  new.montant_ttc := round(coalesce(new.montant_ht,0) * (1 + coalesce(new.taux_tva,0)/100.0), 2);
  return new;
end $$;

drop trigger if exists trg_calc_ttc_facture on factures_fournisseurs;
create trigger trg_calc_ttc_facture
  before insert or update on factures_fournisseurs
  for each row execute function calc_ttc_facture();

-- ---------------------------------------------------------------------
-- C. Validation bloquante : Σ répartitions = montant_ht au passage à `valide`.
--    SECURITY DEFINER pour sommer sans dépendre de la RLS du valideur.
-- ---------------------------------------------------------------------
create or replace function check_validation_facture()
returns trigger language plpgsql security definer set search_path = public as $$
declare somme numeric;
begin
  if new.statut = 'valide'::statut_facture and old.statut is distinct from 'valide'::statut_facture then
    if coalesce(new.montant_ht,0) <= 0 then
      raise exception 'Montant HT requis pour valider la facture';
    end if;
    select coalesce(sum(montant_ht_affecte),0) into somme from factures_repartition where facture_id = new.id;
    if round(somme,2) <> round(new.montant_ht,2) then
      raise exception 'Répartition incomplète : somme affectée % ≠ montant HT %', round(somme,2), round(new.montant_ht,2);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_check_validation_facture on factures_fournisseurs;
create trigger trg_check_validation_facture
  before update on factures_fournisseurs
  for each row execute function check_validation_facture();

-- ---------------------------------------------------------------------
-- D. Helpers SECURITY DEFINER (anti-récursion RLS) + cast uuid tolérant.
-- ---------------------------------------------------------------------
create or replace function safe_uuid(p text)
returns uuid language plpgsql immutable as $$
begin return p::uuid; exception when others then return null; end $$;

create or replace function facture_cree_par(p_facture uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select cree_par from factures_fournisseurs where id = p_facture;
$$;

create or replace function facture_statut(p_facture uuid)
returns statut_facture language sql security definer set search_path = public stable as $$
  select statut from factures_fournisseurs where id = p_facture;
$$;

-- Visible au conducteur : au moins une répartition, et AUCUNE hors de ses entités.
create or replace function facture_visible_conducteur(p_facture uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from factures_repartition where facture_id = p_facture)
     and not exists (
       select 1 from factures_repartition fr
       join chantiers c on c.id = fr.chantier_id
       where fr.facture_id = p_facture and not user_a_acces_entite(c.entite_id)
     );
$$;

-- ---------------------------------------------------------------------
-- E. RLS factures_fournisseurs : admin tout ; conducteur sienne/visible,
--    sans validation (statut reste a_valider) ; ouvrier aucun accès.
-- ---------------------------------------------------------------------
drop policy if exists factures_fournisseurs_staff on factures_fournisseurs;

drop policy if exists factures_admin_all on factures_fournisseurs;
create policy factures_admin_all on factures_fournisseurs for all to authenticated
  using (current_role_app() = 'admin'::role_app)
  with check (current_role_app() = 'admin'::role_app);

drop policy if exists factures_conducteur_select on factures_fournisseurs;
create policy factures_conducteur_select on factures_fournisseurs for select to authenticated
  using (current_role_app() = 'conducteur'::role_app and (cree_par = auth.uid() or facture_visible_conducteur(id)));

drop policy if exists factures_conducteur_insert on factures_fournisseurs;
create policy factures_conducteur_insert on factures_fournisseurs for insert to authenticated
  with check (current_role_app() = 'conducteur'::role_app and cree_par = auth.uid() and statut = 'a_valider'::statut_facture);

drop policy if exists factures_conducteur_update on factures_fournisseurs;
create policy factures_conducteur_update on factures_fournisseurs for update to authenticated
  using (current_role_app() = 'conducteur'::role_app and (cree_par = auth.uid() or facture_visible_conducteur(id)))
  with check (current_role_app() = 'conducteur'::role_app and statut = 'a_valider'::statut_facture and (cree_par = auth.uid() or facture_visible_conducteur(id)));

-- ---------------------------------------------------------------------
-- F. RLS factures_repartition : admin tout ; conducteur sur factures non
--    validées dont il est auteur/visible, et chantier dans ses entités.
-- ---------------------------------------------------------------------
drop policy if exists factures_repartition_staff on factures_repartition;

drop policy if exists repartition_admin_all on factures_repartition;
create policy repartition_admin_all on factures_repartition for all to authenticated
  using (current_role_app() = 'admin'::role_app)
  with check (current_role_app() = 'admin'::role_app);

drop policy if exists repartition_conducteur_all on factures_repartition;
create policy repartition_conducteur_all on factures_repartition for all to authenticated
  using (
    current_role_app() = 'conducteur'::role_app
    and facture_statut(facture_id) = 'a_valider'::statut_facture
    and (facture_cree_par(facture_id) = auth.uid() or facture_visible_conducteur(facture_id))
    and user_a_acces_entite(chantier_entite(chantier_id))
  )
  with check (
    current_role_app() = 'conducteur'::role_app
    and facture_statut(facture_id) = 'a_valider'::statut_facture
    and (facture_cree_par(facture_id) = auth.uid() or facture_visible_conducteur(facture_id))
    and user_a_acces_entite(chantier_entite(chantier_id))
  );

-- ---------------------------------------------------------------------
-- G. Vue chantier_couts_reels : cout_fournisseurs_reel = Σ répartitions des
--    factures VALIDÉES. security_invoker conservé, anon retiré.
-- ---------------------------------------------------------------------
drop view if exists chantier_couts_reels;
create view chantier_couts_reels as
select
  c.id as chantier_id,
  coalesce((
    select sum(p.heures_travaillees * coalesce(
             pr.taux_horaire,
             (select valeur::numeric from parametres where cle = 'taux_horaire_defaut')
           ))
    from pointages p join profiles pr on pr.id = p.ouvrier_id
    where p.chantier_id = c.id
  ), 0::numeric) as cout_mo_reel,
  coalesce((
    select sum(fr.montant_ht_affecte)
    from factures_repartition fr
    join factures_fournisseurs ff on ff.id = fr.facture_id
    where fr.chantier_id = c.id and ff.statut = 'valide'::statut_facture
  ), 0::numeric) as cout_fournisseurs_reel
from chantiers c;

alter view chantier_couts_reels set (security_invoker = on);
revoke select on chantier_couts_reels from anon;
