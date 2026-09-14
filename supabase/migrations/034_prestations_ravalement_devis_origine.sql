-- =====================================================================
-- Chantier Hub — 034 : premières prestations de la bibliothèque (ravalement)
-- =====================================================================
-- Reprend les 6 postes du devis papier historique de GP Ravalement
-- (devis n°17-06, façade Pomas) pour amorcer la bibliothèque de prix.
-- Prix de vente de référence = prix HT du devis papier ; pas de prix
-- d'achat connu à ce stade (non renseigné sur le document source).
-- TVA à 10% (type 'hebergement', qui porte le taux intermédiaire français
-- depuis la migration 002 — travaux de rénovation sur logement > 2 ans,
-- cf. CLAUDE.md). Idempotent (ON CONFLICT sur la contrainte libelle+source
-- posée en 021).
-- =====================================================================

insert into prestations (libelle, unite, prix_vente_reference, type_tva, famille, source)
values
  ('Echafaudage', 'm2', 20.00, 'hebergement', 'Ravalement', 'manuel'),
  ('Lavage haute pression', 'm2', 5.00, 'hebergement', 'Ravalement', 'manuel'),
  ('Gobetis d''accroche', 'm2', 10.00, 'hebergement', 'Ravalement', 'manuel'),
  ('Enduit finition écrasé', 'm2', 22.00, 'hebergement', 'Ravalement', 'manuel'),
  ('Enduit finition taloché sur tableaux d''ouvertures', 'ml', 24.00, 'hebergement', 'Ravalement', 'manuel'),
  ('Protection et nettoyages', 'forfait', 400.00, 'hebergement', 'Ravalement', 'manuel')
on conflict (libelle, source) do nothing;
