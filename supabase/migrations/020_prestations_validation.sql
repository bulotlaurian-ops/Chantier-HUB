-- =====================================================================
-- Chantier Hub — 020 : circuit pending → validé pour la bibliothèque
-- =====================================================================
-- Le conducteur peut PROPOSER une prestation hors biblio (depuis le preview du
-- devis IA) ; l'admin la VALIDE (dispo pour tous) ou la REJETTE (trace conservée).
-- La biblio reste COMMUNE (§4) : pas d'entite_id, l'entité d'origine est tracée
-- dans `source = 'suggestion:<ENTITE>'`. Idempotent.
-- =====================================================================

-- Statut 'rejete' (trace des refus, vs DELETE — utile si resoumission identique).
alter type statut_validation add value if not exists 'rejete';

-- RLS prestations : remplace prestations_staff_all (admin tout ; conducteur lecture
-- des actives ; proposition pending par tout authentifié ; ouvrier aucun accès).
drop policy if exists prestations_staff_all on prestations;

drop policy if exists prestations_admin_all on prestations;
create policy prestations_admin_all on prestations for all to authenticated
  using (current_role_app() = 'admin'::role_app)
  with check (current_role_app() = 'admin'::role_app);

-- Le conducteur ne voit que la biblio VALIDÉE (actif=true) — pas les pending/rejeté.
drop policy if exists prestations_conducteur_read on prestations;
create policy prestations_conducteur_read on prestations for select to authenticated
  using (current_role_app() = 'conducteur'::role_app and actif = true);

-- Proposition : INSERT pending par tout authentifié, sur SES propres lignes.
drop policy if exists prestations_proposer on prestations;
create policy prestations_proposer on prestations for insert to authenticated
  with check (statut_validation = 'pending'::statut_validation and actif = false and created_by = auth.uid());
