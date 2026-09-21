-- =====================================================================
-- Chantier Hub — 037 : GRANT manquants sur les tables (service_role)
-- =====================================================================
-- Même cause que 032 (authenticated) : service_role bypasse la RLS mais
-- n'a pas les privilèges Postgres de base sur ce projet. Sans ce GRANT,
-- l'Edge Function admin-utilisateurs échoue à créer un compte avec
-- « compte_cree_profil_incomplet: permission denied for table profiles »
-- (le compte auth est créé, son profil n'est pas complété).
-- Idempotent.
-- =====================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
