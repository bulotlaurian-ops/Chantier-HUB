-- =====================================================================
-- Chantier Hub — 007 : champ "objet" sur le devis
-- =====================================================================
-- Texte d'introduction du devis (ex : "Veuillez trouver ci-joint notre offre…").
-- Affiché en tête du PDF, comme la 1re ligne de description des devis réels.
-- =====================================================================
alter table devis add column if not exists objet text;
