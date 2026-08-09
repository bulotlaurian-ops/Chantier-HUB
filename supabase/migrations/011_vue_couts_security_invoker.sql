-- =====================================================================
-- Chantier Hub — 011 : durcissement de la vue chantier_couts_reels
-- =====================================================================
-- La vue (005) était en SECURITY DEFINER (défaut) : elle contournait la RLS
-- des tables sous-jacentes, donc TOUT utilisateur authentifié (voire anon)
-- pouvait lire les coûts réels de tous les chantiers. On la passe en
-- security_invoker pour que la RLS de pointages/profiles/chantiers s'applique
-- au lecteur : admin = tout, conducteur = ses entités, ouvrier = ses propres
-- heures uniquement. On retire aussi l'accès anon.
-- Idempotent.
-- =====================================================================

alter view chantier_couts_reels set (security_invoker = on);
revoke select on chantier_couts_reels from anon;
