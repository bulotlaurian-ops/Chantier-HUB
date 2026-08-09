-- =====================================================================
-- Chantier Hub — 029 : pointage en saisie directe du nombre d'heures
-- =====================================================================
-- Retour client : à l'écran, la plage début/fin est remplacée par la saisie
-- directe des heures travaillées. Le trigger reste autoritaire quand une
-- plage est fournie (anciens enregistrements, imports) mais respecte
-- désormais la valeur envoyée quand il n'y a pas de plage, au lieu de la
-- forcer à 0. Idempotent.
-- =====================================================================
create or replace function calc_heures_pointage()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.heure_debut is not null and new.heure_fin is not null then
    new.heures_travaillees := round((extract(epoch from (new.heure_fin - new.heure_debut)) / 3600.0)::numeric, 2);
  elsif new.heures_travaillees is null or new.heures_travaillees < 0 then
    new.heures_travaillees := 0;
  end if;
  return new;
end $$;
