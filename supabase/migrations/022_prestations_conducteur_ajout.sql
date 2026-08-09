-- =====================================================================
-- Chantier Hub — 022 : ajout direct en bibliothèque par le conducteur
-- =====================================================================
-- Depuis le preview devis IA / import ST, le conducteur peut ajouter une ligne
-- hors biblio DIRECTEMENT en bibliothèque active (valide + actif), sans passer
-- par la validation admin. On ajoute une policy INSERT dédiée (conducteur+admin,
-- sur SES propres lignes). Permissive → s'additionne à prestations_proposer
-- (pending, tout authentifié) sans conflit ; prestations_admin_all inchangée.
-- Idempotent.
-- =====================================================================

drop policy if exists prestations_conducteur_ajouter on prestations;
create policy prestations_conducteur_ajouter on prestations for insert to authenticated
  with check (
    current_role_app() = any (array['conducteur', 'admin']::role_app[])
    and created_by = auth.uid()
    and statut_validation in ('valide'::statut_validation, 'pending'::statut_validation)
    and actif in (true, false)
  );
