-- 023 — Champ « Notes et remarques » libre en fin de devis (visible sur le PDF).
-- Distinct de notes_ia (réservé à l'usage IA interne). Nullable, texte libre.

alter table devis add column if not exists notes text;

comment on column devis.notes is 'Notes / remarques libres saisies par le staff, imprimées sur le PDF (planning, inclus/exclus…).';
