-- =====================================================================
-- Chantier Hub — 003 : verrouillage RPC des fonctions trigger
-- =====================================================================
-- Supabase accorde EXECUTE explicitement à anon/authenticated sur les
-- fonctions du schéma public. Les fonctions trigger n'ont aucune raison
-- d'être appelables via /rest/v1/rpc : on révoque nommément ces rôles.
-- (Le déclenchement par trigger reste fonctionnel : il ne dépend pas du GRANT.)
--
-- Note : current_role_app() N'EST PAS révoquée pour 'authenticated' — elle est
-- indispensable à l'évaluation des policies RLS ; ses avertissements advisor
-- sont assumés par conception (elle ne renvoie que le rôle de l'appelant).
-- =====================================================================

revoke execute on function handle_new_user()                 from anon, authenticated;
revoke execute on function prevent_profile_privilege_change() from anon, authenticated;
