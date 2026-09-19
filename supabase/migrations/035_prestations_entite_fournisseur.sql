-- =====================================================================
-- Chantier Hub — 035 : colonnes manquantes entite / fournisseur sur prestations
-- =====================================================================
-- Ces deux colonnes existent dans le schema généré (database.types.ts, aligné
-- sur la base d'origine) et sont lues/écrites par plusieurs écrans (filtre
-- « Entité » et « Fournisseur » de la bibliothèque, PrestationPicker, ajout
-- rapide depuis une ligne libre, import CSV/PDF fournisseur), mais n'ont
-- jamais été créées par une migration versionnée de ce template — exactement
-- le trou des migrations 024 à 027 mentionné dans le README (jamais
-- versionnées dans le projet d'origine).
--
-- `entite` est un simple tag texte informatif (code d'entité, ex. 'PRO'),
-- PAS une colonne de rattachement structurel : la bibliothèque reste commune
-- à toutes les entités (CLAUDE.md §3.1), ce tag ne fait que présélectionner
-- un filtre. Idempotent (add column if not exists).
-- =====================================================================

alter table prestations add column if not exists entite text;
alter table prestations add column if not exists fournisseur text;
