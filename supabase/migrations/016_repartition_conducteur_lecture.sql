-- =====================================================================
-- Chantier Hub — 016 : lecture conducteur des répartitions des factures validées
-- =====================================================================
-- La 013 limitait l'accès conducteur aux répartitions des factures `a_valider`
-- (USING de repartition_conducteur_all). Conséquence : une fois la facture
-- VALIDÉE, le conducteur ne pouvait plus LIRE ses répartitions → le coût
-- fournisseurs validé disparaissait de sa marge (vue chantier_couts_reels) et de
-- la fiche facture. On ajoute une policy SELECT large (toute facture visible,
-- quel que soit le statut). L'ÉCRITURE reste limitée à `a_valider`
-- (repartition_conducteur_all conservée : son USING write/insert/delete prime).
-- Idempotent.
-- =====================================================================

drop policy if exists repartition_conducteur_select on factures_repartition;
create policy repartition_conducteur_select on factures_repartition for select to authenticated
  using (
    current_role_app() = 'conducteur'::role_app
    and (facture_cree_par(facture_id) = auth.uid() or facture_visible_conducteur(facture_id))
    and user_a_acces_entite(chantier_entite(chantier_id))
  );
