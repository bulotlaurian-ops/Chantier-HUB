-- =====================================================================
-- Chantier Hub — 018 : couleur de marque ARTISAN PRO = anthracite neutre
-- =====================================================================
-- Couleur de marque de l.entite PRO : anthracite neutre, rendu écran #1F2937.
-- Remplace la provisoire anthracite #2D3333 (posée en 005 « à confirmer »).
-- EXT / INT (charte verte) inchangés. Idempotent.
-- =====================================================================

update entites set couleur = '#1F2937' where code = 'PRO';
