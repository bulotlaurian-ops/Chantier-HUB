-- =====================================================================
-- Chantier Hub — 002 : durcissement sécurité (suite advisor Supabase)
-- =====================================================================
-- Corrige les avertissements du linter sécurité après la 001 :
--   • search_path mutable sur les fonctions de numérotation
--   • fonctions SECURITY DEFINER inutilement exposées via l'API REST (RPC)
-- =====================================================================

-- 1. search_path explicite sur les fonctions de numérotation
--    (évite le détournement de résolution de noms via un search_path mutable)
alter function generer_numero_devis() set search_path = public;
alter function generer_reference_chantier(uuid, text) set search_path = public;

-- 2. Les fonctions trigger n'ont aucune raison d'être appelables via /rest/v1/rpc.
--    (le trigger les invoque en interne, indépendamment de ce GRANT)
revoke execute on function handle_new_user() from public;
revoke execute on function prevent_profile_privilege_change() from public;

-- 3. current_role_app : nécessaire à l'évaluation des policies RLS (rôle authenticated),
--    mais inutile pour anon / le public exposé. On retire le GRANT PUBLIC et on
--    ne le redonne qu'à authenticated.
revoke execute on function current_role_app() from public;
grant  execute on function current_role_app() to authenticated;
