-- =====================================================================
-- Chantier Hub — 004 : seuils de marge cible (PARAMÉTRABLES)
-- =====================================================================
-- Les seuils de "marge cible" pilotent le code couleur de la marge à l'écran.
-- ⚠️ Valeurs RÉELLES en attente du client (CLAUDE.md §8) : ce sont des
--    placeholders de DÉMONSTRATION, à remplacer dès réception.
--    Aucune de ces valeurs ne doit être codée en dur côté application.
-- =====================================================================

insert into parametres (cle, valeur) values
  ('marge_seuil_alerte_pct', '15'),  -- TODO client : sous ce % → alerte (démo)
  ('marge_seuil_ok_pct',     '22')   -- TODO client : au-dessus → marge saine (démo)
on conflict (cle) do nothing;
