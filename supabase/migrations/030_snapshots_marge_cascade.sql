-- =====================================================================
-- Chantier Hub — 030 : suppression de devis débloquée (snapshots_marge)
-- =====================================================================
-- Retour client : la suppression d'un devis brouillon échouait (silencieusement
-- côté UI) dès qu'un snapshot de marge existait — la FK snapshots_marge.devis_id
-- était en NO ACTION. Un snapshot n'a aucun sens sans son devis : passage en
-- ON DELETE CASCADE. Seuls les brouillons sont supprimables côté app ; les devis
-- émis restent archivés, leurs snapshots sont donc conservés. Idempotent.
-- =====================================================================
alter table snapshots_marge drop constraint if exists snapshots_marge_devis_id_fkey;
alter table snapshots_marge add constraint snapshots_marge_devis_id_fkey
  foreign key (devis_id) references devis(id) on delete cascade;
