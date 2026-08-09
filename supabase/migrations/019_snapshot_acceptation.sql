-- =====================================================================
-- Chantier Hub — 019 : snapshot de marge à l'acceptation du devis
-- =====================================================================
-- snapshots_marge (005) n'était pas branchée. On la remplit automatiquement au
-- passage d'un devis à `accepte` : on FIGE les valeurs de référence (montant HT)
-- qui serviront au suivi de marge — une fois posé, le snapshot ne bouge plus
-- (même si le devis est dupliqué/archivé).
-- Décisions actées : (A) colonnes nommées explicites + ca_prevu rempli en parallèle ;
-- (B) chantier_id nullable (un devis peut être accepté avant que le chantier existe).
-- Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Colonnes explicites (montant_ht_reference / date_snapshot / created_by).
--    L'ancien trio ca_prevu/couts_estimes/marge_prevue n'a jamais servi ; on
--    remplit ca_prevu = total_ht en parallèle pour la cohérence.
-- ---------------------------------------------------------------------
alter table snapshots_marge
  add column if not exists montant_ht_reference numeric not null default 0,
  add column if not exists date_snapshot timestamptz not null default now(),
  add column if not exists created_by uuid references profiles(id);

-- B. Le chantier peut ne pas encore exister à l'acceptation → capture toujours possible.
alter table snapshots_marge alter column chantier_id drop not null;

-- Unicité par devis → idempotence du trigger (ON CONFLICT DO NOTHING).
alter table snapshots_marge drop constraint if exists snapshots_marge_devis_unique;
alter table snapshots_marge add constraint snapshots_marge_devis_unique unique (devis_id);

-- ---------------------------------------------------------------------
-- C. Trigger : au PASSAGE à `accepte` uniquement (pas à chaque UPDATE).
--    SECURITY DEFINER → contourne la RLS de snapshots_marge à l'insertion.
-- ---------------------------------------------------------------------
create or replace function snapshot_devis_accepte()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.statut is distinct from 'accepte'::statut_devis and new.statut = 'accepte'::statut_devis then
    insert into snapshots_marge (devis_id, chantier_id, montant_ht_reference, ca_prevu, date_snapshot, created_by, type)
    values (new.id, new.chantier_id, new.total_ht, new.total_ht, now(), auth.uid(), 'acceptation')
    on conflict (devis_id) do nothing;  -- un seul snapshot par devis, figé
  end if;
  return new;
end $$;

drop trigger if exists trg_snapshot_devis_accepte on devis;
create trigger trg_snapshot_devis_accepte
  after update on devis
  for each row execute function snapshot_devis_accepte();

-- ---------------------------------------------------------------------
-- D. Backfill des devis déjà acceptés (sans snapshot).
--    Reprise ASSUMÉE : devis n'a pas d'`updated_at` → date_snapshot = created_at ;
--    created_by inconnu rétroactivement → NULL.
-- ---------------------------------------------------------------------
insert into snapshots_marge (devis_id, chantier_id, montant_ht_reference, ca_prevu, date_snapshot, created_by, type)
select id, chantier_id, total_ht, total_ht, created_at, null, 'acceptation'
from devis
where statut = 'accepte'::statut_devis
on conflict (devis_id) do nothing;

-- ---------------------------------------------------------------------
-- E. Vue chantier_couts_reels : NON modifiée. montant_reference lit les devis
--    acceptés en direct (sum(total_ht) where statut='accepte') — équivalent aux
--    snapshots tant qu'il n'y a pas de révisions de devis. À réorienter vers les
--    snapshots le jour où les devis seront révisables.
-- ---------------------------------------------------------------------
