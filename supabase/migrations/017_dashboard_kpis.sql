-- =====================================================================
-- Chantier Hub — 017 : dashboard KPI (RPC agrégée) + dates de statut
-- =====================================================================
-- Aucune nouvelle table métier. On ajoute deux dates d'événement de statut
-- (date_cloture, date_envoi) renseignées par trigger léger, puis une RPC
-- dashboard_kpis agrégée en SQL, SECURITY INVOKER (la RLS du caller s'applique ;
-- garde ouvrier = renvoie NULL). Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Dates d'événement de statut (remplacent les proxys date_fin_prevue / date_creation)
-- ---------------------------------------------------------------------
alter table chantiers add column if not exists date_cloture date;
alter table devis      add column if not exists date_envoi  date;

-- Trigger chantiers : passage à 'cloture' → date_cloture = current_date (si NULL).
create or replace function set_date_cloture()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.statut = 'cloture'::statut_chantier and new.date_cloture is null then
    new.date_cloture := current_date;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_date_cloture on chantiers;
create trigger trg_set_date_cloture
  before insert or update on chantiers
  for each row execute function set_date_cloture();

-- Trigger devis : passage à 'envoye' → date_envoi = current_date (si NULL).
create or replace function set_date_envoi()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.statut = 'envoye'::statut_devis and new.date_envoi is null then
    new.date_envoi := current_date;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_date_envoi on devis;
create trigger trg_set_date_envoi
  before insert or update on devis
  for each row execute function set_date_envoi();

-- Backfill de l'existant — valeurs de reprise ASSUMÉES :
--   chantiers déjà clôturés → date_fin_prevue (faute de date réelle de clôture).
--   devis déjà sortis du brouillon → date_creation (faute de date réelle d'envoi).
update chantiers set date_cloture = date_fin_prevue
  where statut = 'cloture'::statut_chantier and date_cloture is null;
update devis set date_envoi = date_creation
  where statut <> 'brouillon'::statut_devis and date_envoi is null;

-- ---------------------------------------------------------------------
-- B. RPC d'agrégation du dashboard. SECURITY INVOKER → RLS du caller.
--    Période [p_from, p_to] bornes INCLUSIVES ; entité optionnelle.
--    Ouvrier : renvoie NULL (aucune donnée financière servie, même en direct).
-- ---------------------------------------------------------------------
create or replace function dashboard_kpis(p_from date, p_to date, p_entite uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if current_role_app() = 'ouvrier'::role_app then
    return null;
  end if;

  select jsonb_build_object(
    'devis', d.payload,
    'marge', m.payload,
    'chantiers', c.payload,
    'heures', h.payload,
    'a_traiter', a.payload
  )
  into result
  from
    -- Devis sur la période (par date_creation)
    (select jsonb_build_object(
       'par_statut', coalesce(
         (select jsonb_object_agg(s, n) from (
            select statut::text s, count(*) n from devis
            where date_creation between p_from and p_to and (p_entite is null or entite_id = p_entite)
            group by statut) z), '{}'::jsonb),
       'ca_ht_accepte', (select coalesce(sum(total_ht),0) from devis
            where statut='accepte'::statut_devis and date_creation between p_from and p_to and (p_entite is null or entite_id = p_entite)),
       'taux_acceptation', (
          select case when (acc+ref+exp) > 0 then round(acc::numeric/(acc+ref+exp)*100, 1) else null end
          from (select
                  count(*) filter (where statut='accepte'::statut_devis) acc,
                  count(*) filter (where statut='refuse'::statut_devis)  ref,
                  count(*) filter (where statut='expire'::statut_devis)  exp
                from devis
                where date_creation between p_from and p_to and (p_entite is null or entite_id = p_entite)) t)
     ) as payload) d,

    -- Marge réelle (état courant ; non bornée période car cumulative)
    (select jsonb_build_object(
       'marge_chf', coalesce(sum(v.marge_reelle_chf), 0),
       'reference', coalesce(sum(v.montant_reference), 0),
       'pct_global', case when coalesce(sum(v.montant_reference),0) > 0
                          then round(sum(v.marge_reelle_chf)/sum(v.montant_reference)*100, 1) else null end,
       'nb_calculables', count(*) filter (where v.montant_reference is not null),
       'nb_non_calculables', count(*) filter (where v.montant_reference is null)
     ) as payload
     from chantier_couts_reels v
     join chantiers cc on cc.id = v.chantier_id
     where cc.archive_at is null and (p_entite is null or cc.entite_id = p_entite)) m,

    -- Chantiers : actifs (courant) + terminés sur la période (date_cloture)
    (select jsonb_build_object(
       'actifs', count(*) filter (where statut='actif'::statut_chantier),
       'termines_periode', count(*) filter (where statut='cloture'::statut_chantier and date_cloture between p_from and p_to)
     ) as payload
     from chantiers
     where archive_at is null and (p_entite is null or entite_id = p_entite)) c,

    -- Heures sur la période (+ trajet à part)
    (select jsonb_build_object(
       'travaillees', coalesce(sum(p.heures_travaillees), 0),
       'trajet', coalesce(sum(p.heures_trajet), 0)
     ) as payload
     from pointages p
     join chantiers ch2 on ch2.id = p.chantier_id
     where p.date between p_from and p_to and (p_entite is null or ch2.entite_id = p_entite)) h,

    -- À traiter (backlog courant, non borné période)
    (select jsonb_build_object(
       'factures_a_valider_nb', (
          select count(*) from factures_fournisseurs f
          where f.statut='a_valider'::statut_facture
            and (p_entite is null or exists (
              select 1 from factures_repartition fr join chantiers c4 on c4.id=fr.chantier_id
              where fr.facture_id=f.id and c4.entite_id=p_entite))),
       'factures_a_valider_montant', (
          select coalesce(sum(f.montant_ht),0) from factures_fournisseurs f
          where f.statut='a_valider'::statut_facture
            and (p_entite is null or exists (
              select 1 from factures_repartition fr join chantiers c5 on c5.id=fr.chantier_id
              where fr.facture_id=f.id and c5.entite_id=p_entite))),
       'devis_envoyes_30j', (
          select count(*) from devis
          where statut='envoye'::statut_devis and date_envoi < current_date - 30
            and (p_entite is null or entite_id = p_entite))
     ) as payload) a;

  return result;
end $$;

revoke execute on function dashboard_kpis(date, date, uuid) from public, anon;
grant execute on function dashboard_kpis(date, date, uuid) to authenticated;
