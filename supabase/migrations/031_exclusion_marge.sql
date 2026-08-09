-- =====================================================================
-- Chantier Hub — 031 : exclure une saisie du calcul de marge
-- =====================================================================
-- Retour client : une heure ou un montant de facture peut ne pas devoir peser
-- sur la marge d'un chantier (geste commercial, erreur d'affectation, reprise)
-- tout en restant tracé. Défaut = comptabilisé, donc aucun impact sur l'existant.
-- Idempotent.
-- =====================================================================
alter table pointages
  add column if not exists comptabilise boolean not null default true;
alter table factures_repartition
  add column if not exists comptabilise boolean not null default true;

comment on column pointages.comptabilise is
  'false = heures conservées mais exclues du coût main-d''œuvre du chantier';
comment on column factures_repartition.comptabilise is
  'false = montant conservé mais exclu du coût fournisseurs du chantier';

-- La vue ignore les lignes décochées (mêmes règles par ailleurs : seules les
-- factures validées comptent, un ouvrier ne voit aucun montant).
create or replace view chantier_couts_reels
with (security_invoker = true) as
select
  c.id as chantier_id,
  case when current_role_app() = 'ouvrier'::role_app then null::numeric else mo.v end as cout_mo_reel,
  case when current_role_app() = 'ouvrier'::role_app then null::numeric else fo.v end as cout_fournisseurs_reel,
  case when current_role_app() = 'ouvrier'::role_app then null::numeric else ref.v end as montant_reference,
  case when current_role_app() = 'ouvrier'::role_app or ref.v is null then null::numeric
       else ref.v - (mo.v + fo.v) end as marge_reelle_chf,
  case when current_role_app() = 'ouvrier'::role_app or ref.v is null or ref.v = 0::numeric then null::numeric
       else (ref.v - (mo.v + fo.v)) / ref.v * 100::numeric end as marge_reelle_pct
from chantiers c
cross join lateral (
  select coalesce(sum(p.heures_travaillees * coalesce(
           pr.taux_horaire,
           (select parametres.valeur::numeric from parametres where parametres.cle = 'taux_horaire_defaut')
         )), 0::numeric) as v
  from pointages p
  join profiles pr on pr.id = p.ouvrier_id
  where p.chantier_id = c.id and p.comptabilise
) mo
cross join lateral (
  select coalesce(sum(fr.montant_ht_affecte), 0::numeric) as v
  from factures_repartition fr
  join factures_fournisseurs ff on ff.id = fr.facture_id
  where fr.chantier_id = c.id and ff.statut = 'valide'::statut_facture and fr.comptabilise
) fo
cross join lateral (
  select sum(d.total_ht) as v
  from devis d
  where d.chantier_id = c.id and d.statut = 'accepte'::statut_devis
) ref;
