# Facture électronique, phase 1 : données et mentions légales

Date : 2026-10-27. Branche : `feat/facturation-electronique`. Migration : `038_facturation_electronique.sql`.

## Contexte

Réforme française (sources éditeurs, à confirmer sur impots.gouv.fr) :

- Réception électronique obligatoire pour toutes les entreprises depuis le 1er septembre 2026.
- Émission obligatoire pour les TPE/PME au 1er septembre 2027, via une Plateforme Agréée (PA).
- Clients particuliers : pas de facture électronique, mais e-reporting des ventes et encaissements.
- Chantier Hub ne devient pas une PA : il prépare des factures conformes.

## Ce que fait la phase 1

| Brique | Où |
|---|---|
| Client particulier / professionnel, SIREN (contrôle Luhn), raison sociale | `clients.index.tsx`, `clients.$id.tsx` |
| Option TVA sur les débits par entité | Paramètres → Identité |
| Dialogue « Émettre la facture » : catégorie d'opération, autoliquidation (pro seulement) | `components/FacturerDialog.tsx` |
| Gel à l'émission : type client, SIREN, raison sociale, catégorie, lieu des travaux, autoliquidation, TVA débits | `queries/factures.ts`, colonnes de `factures` |
| PDF : SIREN, opération, lieu des travaux (si différent du client), TVA autoliquidée, mentions fiscales | `lib/pdf.ts` |

Les factures émises avant 038 ne sont pas modifiées : leurs nouvelles colonnes restent à `null`
et leur PDF est identique à avant.

## Mise en production : ordre obligatoire

1. Appliquer `038_facturation_electronique.sql` dans le SQL Editor Supabase.
2. Seulement ensuite, déployer le code. Dans l'autre sens, la création et la modification
   de client échouent (colonnes `type_client`, `siren` inconnues).
3. Requalifier à la main les clients professionnels existants (SCI, syndics, bailleurs, entreprises).

## E-reporting : état des données (constat, rien n'est transmis)

Disponible :

- Type de client figé sur chaque facture, montants HT / TVA / TTC, date d'émission.
- Ventilation par taux de TVA calculable depuis `lignes_facture.taux_tva`.

Manquant ou fragile :

- `date_paiement` vaut la date du clic « Payée », pas la date réelle d'encaissement. Pour des
  travaux (TVA exigible à l'encaissement), c'est la date réelle qu'il faut déclarer.
- Pas de paiement partiel ni d'acompte (une facture = un devis, paiement total).
- Aucun export (CSV ou autre) des factures.
- Nom et adresse du client ne sont pas figés sur la facture : un re-téléchargement lit la fiche
  client actuelle (limite préexistante, hors périmètre).

## À valider par le comptable

- Mention d'autoliquidation : « Autoliquidation, TVA due par le preneur (art. 283-2 nonies du CGI) ».
- Le régime TVA sur les débits de l'entreprise.

## Hors périmètre (phase 2)

Génération Factur-X (PDF/A-3 + XML CII), envoi par API à une PA, transmission de l'e-reporting.
