-- =====================================================================
-- Chantier Hub — 032 : GRANT manquants sur les tables (authenticated)
-- =====================================================================
-- Les migrations 001 à 031 activent bien la RLS et posent les policies,
-- mais n'accordent jamais les privilèges Postgres de base (GRANT) au
-- rôle `authenticated`. Sans ce GRANT, PostgREST renvoie 403 sur toute
-- requête, quelle que soit la policy RLS : le GRANT est un préalable,
-- pas un remplacement de la RLS. Découvert en testant la connexion
-- réelle du premier compte après mise en production (même leçon déjà
-- rencontrée sur le projet devis-artisans).
-- Idempotent.
-- =====================================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
