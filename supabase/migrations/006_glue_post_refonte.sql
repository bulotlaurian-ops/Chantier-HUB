-- =====================================================================
-- Chantier Hub — 006 : glue post-refonte (réintroduit ce que 005 omet)
-- =====================================================================
-- 005 (refonte) ne reprend pas la sécurité/auth des 001-003. On la réapplique :
--   • création auto du profil à l'inscription + anti-escalade de privilèges
--   • accès admin/conducteur aux pointages + vue coûts en security_invoker
--   • durcissement EXECUTE des fonctions SECURITY DEFINER
--   • seuils de marge (placeholders démo, §8)
--   • restauration du profil admin (sinon verrouillé après reset)
-- =====================================================================

-- --- Auth : profil créé à l'inscription (rôle ouvrier par défaut) ---
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nom, role)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nom', ''), new.email), 'ouvrier')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- --- Anti-escalade : un non-admin ne change pas son rôle ni son taux horaire ---
create or replace function prevent_profile_privilege_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_role_app() <> 'admin'
     and (new.role is distinct from old.role or new.taux_horaire is distinct from old.taux_horaire) then
    raise exception 'Seul un admin peut modifier le rôle ou le taux horaire';
  end if;
  return new;
end $$;
create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function prevent_profile_privilege_change();

-- --- Heures : accès staff (005 ne couvrait que l'ouvrier) ---
create policy pointages_staff_read on pointages for select
  using (current_role_app() in ('admin','conducteur'));
create policy pointages_admin_all on pointages for all
  using (current_role_app() = 'admin') with check (current_role_app() = 'admin');

-- --- Vue coûts : ne pas contourner la RLS ---
alter view chantier_couts_reels set (security_invoker = on);

-- --- Durcissement EXECUTE des fonctions SECURITY DEFINER ---
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function prevent_profile_privilege_change() from public, anon, authenticated;
revoke execute on function current_role_app() from public;
grant  execute on function current_role_app() to authenticated;
revoke execute on function user_a_acces_entite(uuid) from public;
grant  execute on function user_a_acces_entite(uuid) to authenticated;

-- --- Seuils de marge cible (PLACEHOLDERS démo, valeurs réelles en attente — §8) ---
insert into parametres (cle, valeur) values
  ('marge_seuil_alerte_pct', '15'),  -- TODO client (démo)
  ('marge_seuil_ok_pct',     '22')   -- TODO client (démo)
on conflict (cle) do nothing;

-- --- Restauration du profil admin (auth.users a survécu au reset) ---
insert into profiles (id, nom, prenom, role)
select id, 'Demo', 'Admin', 'admin' from auth.users where email = 'admin@example.com'
on conflict (id) do update set role = 'admin', nom = 'Demo', prenom = 'Admin';
