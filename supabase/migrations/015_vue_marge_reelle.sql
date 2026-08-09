-- =====================================================================
-- Chantier Hub — 015 : marge réelle par chantier (extension de la vue)
-- =====================================================================
-- Le coût réel existe déjà (cout_mo_reel + cout_fournisseurs_reel). On ajoute la
-- RÉFÉRENCE (Σ total_ht des devis ACCEPTÉS du chantier) et la marge dérivée.
-- - montant_reference NULL si aucun devis accepté → marge « non calculable » (≠ 0).
-- - Calcul NON arrondi (l'arrondi suisse 0.05 est appliqué à l'affichage seulement).
-- - Garde ouvrier : toutes les colonnes coût/marge renvoient NULL pour un ouvrier
--   (defense-in-depth, en plus du non-affichage côté UI). security_invoker conservé.
-- Idempotent.
-- =====================================================================

create or replace view chantier_couts_reels as
select
  c.id as chantier_id,
  case when current_role_app() = 'ouvrier'::role_app then null else mo.v end as cout_mo_reel,
  case when current_role_app() = 'ouvrier'::role_app then null else fo.v end as cout_fournisseurs_reel,
  case when current_role_app() = 'ouvrier'::role_app then null else ref.v end as montant_reference,
  case when current_role_app() = 'ouvrier'::role_app or ref.v is null then null
       else ref.v - (mo.v + fo.v) end as marge_reelle_chf,
  case when current_role_app() = 'ouvrier'::role_app or ref.v is null or ref.v = 0 then null
       else (ref.v - (mo.v + fo.v)) / ref.v * 100 end as marge_reelle_pct
from chantiers c
cross join lateral (
  select coalesce(sum(p.heures_travaillees * coalesce(
           pr.taux_horaire,
           (select valeur::numeric from parametres where cle = 'taux_horaire_defaut')
         )), 0::numeric) as v
  from pointages p join profiles pr on pr.id = p.ouvrier_id
  where p.chantier_id = c.id
) mo
cross join lateral (
  select coalesce(sum(fr.montant_ht_affecte), 0::numeric) as v
  from factures_repartition fr
  join factures_fournisseurs ff on ff.id = fr.facture_id
  where fr.chantier_id = c.id and ff.statut = 'valide'::statut_facture
) fo
cross join lateral (
  -- somme vide = NULL → montant_reference NULL ⟺ aucun devis accepté
  select sum(d.total_ht) as v
  from devis d
  where d.chantier_id = c.id and d.statut = 'accepte'::statut_devis
) ref;

alter view chantier_couts_reels set (security_invoker = on);
revoke select on chantier_couts_reels from anon;
