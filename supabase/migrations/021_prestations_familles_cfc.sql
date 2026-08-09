-- =====================================================================
-- Chantier Hub — 021 : familles métier + code CFC sur prestations
-- =====================================================================
-- `famille` existe déjà (utilisée par la biblio). On ajoute le code CFC (Code
-- des Frais de Construction suisse) + son libellé, et une unicité (libelle, source)
-- pour l'import idempotent des prestations (ON CONFLICT DO NOTHING).
-- Pas de contrainte sur les codes. Idempotent.
-- =====================================================================

alter table prestations add column if not exists famille text;
alter table prestations add column if not exists code_cfc text;
alter table prestations add column if not exists code_cfc_libelle text;

-- Unicité (libelle, source) → import rejouable (upsert ignoreDuplicates).
alter table prestations drop constraint if exists prestations_libelle_source_unique;
alter table prestations add constraint prestations_libelle_source_unique unique (libelle, source);
