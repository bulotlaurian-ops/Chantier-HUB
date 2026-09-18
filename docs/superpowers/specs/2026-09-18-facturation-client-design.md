# Facturation client (v1)

> Spec issue d'une session de brainstorming avec Laurian le 2026-09-18.

## Contexte

Chantier Hub couvre aujourd'hui le cycle **devis → chantier → marge réelle**, mais
s'arrête avant la facturation client : un devis accepté ne produit aucun document de
facturation, seulement un suivi des coûts réels (heures, factures **fournisseurs**).

Laurian veut fermer ce cycle : pouvoir émettre une vraie facture client à partir d'un
devis accepté, avec un suivi basique de son paiement.

Idée de départ, formulée telle quelle : renommer l'onglet "Factures fournisseurs" en
"Suivi facturation", et créer un nouvel onglet "Facture" à côté.

## Décisions actées pendant le brainstorming

Ces points ont été tranchés avec Laurian, ne pas les rouvrir sans nouvelle discussion :

1. **Navigation** : simple renommage + ajout, pas de fusion. `/factures-fournisseurs`
   garde exactement son contenu actuel, seul son libellé de menu change ("Suivi
   facturation"). Un nouvel onglet **"Facture"** (`/factures`) est ajouté à côté, pour la
   facturation client. Aucun sous-onglet, aucune fusion des deux écrans.
2. **Origine d'une facture** : uniquement depuis un devis au statut `accepte`, via un
   bouton "Facturer" sur la fiche devis. Pas de saisie libre indépendante en v1 — ça
   duplicaterait la saisie de lignes déjà couverte par le devis.
3. **Granularité** : **une facture = un devis, montant total.** Pas d'acompte, pas de
   situation de travaux, pas de solde en v1. Si le besoin réel apparaît plus tard (c'est
   fréquent dans le bâtiment), ce sera une évolution séparée, pas anticipée ici (YAGNI) —
   elle demanderait de suivre un "reste à facturer" par devis, ce qui change le modèle.
4. **Numérotation** : séquence annuelle simple, format **`FA-2026-001`**, compteur remis
   à zéro chaque année civile. Contrainte légale française : contrairement au devis, la
   numérotation d'une facture doit être **chronologique et sans trou** — pas de
   suppression dure possible une fois émise (cf. section Suppression / annulation).
5. **Suivi de paiement** : oui, dans l'onglet "Facture". Statut à bascule manuelle
   (émise / payée), pas de saisie de règlement partiel.

## Contrainte légale : mentions obligatoires propres à la facture

Une facture française doit comporter des mentions qui n'ont pas lieu d'être sur un
devis : pénalités de retard en cas de paiement après échéance, et l'indemnité forfaitaire
de recouvrement de 40 € (art. L441-10 du Code de commerce). Ce n'est pas une option de
design, c'est une obligation légale à intégrer dans le gabarit PDF de la facture — un
point distinct des mentions déjà présentes sur le devis (CGV, SIRET).

## Correction apportée pendant la planification

`conditions_paiement` (sur `devis` comme sur la table du même nom) est un texte libre
(ex. "50% acompte / 30% livraison / solde réception"), pas un nombre de jours — il ne
permet pas de calculer une échéance automatiquement, contrairement à ce que cette spec
supposait initialement. Décision (validée avec Laurian) : `date_echeance` = date
d'émission + 30 jours par défaut (délai légal par défaut entre professionnels en France
en l'absence d'accord explicite), modifiable ensuite sur la facture au cas par cas.

## Modèle de données

Deux nouvelles tables, sur le modèle de `devis` / `lignes_devis` déjà en place
(`005_refonte_modele.sql`) :

```
factures
  id                  uuid pk
  numero              text unique not null        -- 'FA-2026-001'
  devis_id            uuid not null references devis(id)
  entite_id           uuid not null references entites(id)   -- copié du devis à l'émission
  client_id           uuid not null references clients(id)   -- copié du devis à l'émission
  date_emission       date not null default current_date
  date_echeance       date not null                 -- date_emission + 30 j par défaut, modifiable
  statut              statut_facture_client not null default 'emise'  -- enum : 'emise' | 'payee'
  date_paiement       date                          -- renseignée au passage à 'payee'
  total_ht            numeric(14,2) not null
  total_tva           numeric(14,2) not null
  total_ttc           numeric(14,2) not null
  arrondi             numeric(6,2) not null default 0
  created_by          uuid references profiles(id)
  created_at          timestamptz not null default now()

lignes_facture
  id                     uuid pk
  facture_id             uuid not null references factures(id) on delete cascade
  ordre                  int not null default 0
  libelle                text not null
  unite                  text
  quantite               numeric(12,2) not null
  prix_unitaire_ht       numeric(12,2) not null
  remise_pct             numeric(5,2) not null default 0
  taux_tva               numeric(5,2) not null
  total_ht               numeric(14,2) not null
  est_option             boolean not null default false
  est_titre              boolean not null default false
```

**Nom de l'enum de statut** : `statut_facture_client`, pas `statut_facture` — ce dernier
existe déjà (`001_chantier_hub_schema.sql`) pour `factures_fournisseurs`, avec des valeurs
différentes (`a_valider` / `valide`). Réutiliser le même nom collisionnerait avec un type
Postgres déjà défini.

**Pourquoi une copie et pas une simple référence à `lignes_devis`** : une facture émise
est un document légalement figé. Si le devis source était modifié après coup (l'app ne
l'interdit pas techniquement aujourd'hui), une facture qui recalculerait ses montants à
la volée depuis le devis changerait de valeur après émission — inacceptable pour un
document fiscal. Le principe existe déjà dans l'app pour la marge (`snapshots_marge`) ;
on applique le même raisonnement ici. La copie se fait une seule fois, à la génération.

**Une seule facture par devis** : contrainte `unique (devis_id)` sur `factures`. Le
bouton "Facturer" sur la fiche devis est masqué si une facture existe déjà pour ce devis
(cohérent avec la décision "une facture = un devis" — pas de re-génération accidentelle).

**Numérotation** : même mécanique que `generer_numero_devis()` (`compteurs_devis` dans
`008_numerotation_et_defauts.sql`) — une table `compteurs_factures(prefixe, dernier)`
avec insert atomique `on conflict do update ... returning`, préfixe = année courante,
pour garantir l'absence de trou même en cas d'accès concurrent.

**"En retard" n'est pas stocké** : c'est un statut affiché, calculé côté app
(`statut = 'emise' AND date_echeance < aujourd'hui`), jamais persisté. Le stocker
demanderait un job ou un recalcul à chaque affichage pour rester exact ; le calculer à la
volée est plus simple et ne peut pas devenir incohérent.

**RLS** : même schéma que `devis` (`current_role_app()`, `user_a_acces_entite()`) —
admin accès total, conducteur limité aux factures de ses entités (via `entite_id`),
ouvrier aucun accès (document financier, même logique que l'exclusion de la bibliothèque
de prix).

## Suppression / annulation

Hors périmètre v1, mais à ne pas oublier en implémentant : une facture émise ne doit
**jamais** être supprimable (contrainte légale de continuité de la numérotation). Le
formulaire de suppression standard de l'app (utilisé pour devis/clients/chantiers) ne
doit pas s'appliquer à `factures`. Un vrai mécanisme d'annulation (avoir / facture
rectificative) n'est **pas construit ici** — si Laurian génère une facture par erreur en
v1, il n'y a pas de bouton pour l'annuler proprement. Assumé comme limite connue de la v1
plutôt que du scope caché.

Appliqué au niveau base, pas seulement par absence de bouton dans l'interface : `factures`
et `lignes_facture` n'ont volontairement **aucune policy RLS pour DELETE** (seulement
select/insert/update). Sans policy pour une commande donnée, RLS la refuse par défaut,
donc même un accès direct à l'API (hors interface) ne peut pas supprimer une facture
émise, y compris pour un admin.

## Écrans

- **Sidebar / navigation** (`AppSidebar.tsx`) : renommer le libellé de l'item
  `/factures-fournisseurs` en "Suivi facturation" (icône inchangée). Ajouter un item
  `/factures` "Facture" (nouvelle icône, ex. `Receipt` déjà utilisé ailleurs ou une autre
  de `lucide-react` à choisir à l'implémentation).
- **`/factures` (liste)** : tableau numéro / client / montant TTC / statut (badge
  émise / payée / en retard) / échéance (éditable à la volée — champ date cliquable dans
  la ligne, cf. correction ci-dessus), avec action pour basculer payée ↔ émise et
  télécharger le PDF. Modelé sur l'écran `/factures-fournisseurs` existant pour la
  cohérence visuelle.
- **Fiche devis (`devis.$id.tsx`)** : bouton "Facturer" à côté des actions existantes,
  visible seulement si `statut === 'accepte'` et qu'aucune facture n'existe encore pour
  ce devis. Au clic : crée la facture (copie des lignes, calcul du numéro, calcul de
  l'échéance), puis télécharge immédiatement le PDF — même geste que "Télécharger PDF"
  sur le devis aujourd'hui.

## PDF facture

Nouvelle fonction `buildFacturePdf` dans `src/lib/pdf.ts`, réutilisant tout ce qui existe
déjà (`drawLogo`, le bloc client encadré tout juste refait, `drawFooter`, `hexToRgb`,
`formatDateLong`) : même gabarit visuel que le devis, avec :
- titre "FACTURE" au lieu de "Devis N°…" ;
- une ligne de référence au devis d'origine ("Facture émise suite au devis N°…") ;
- date d'échéance affichée à côté de la date d'émission ;
- les mentions légales pénalités de retard / indemnité de 40 € en pied de la dernière
  page, en plus (pas à la place) du bloc SIRET/forme juridique déjà présent.

## Hors périmètre (explicitement, pour ne pas les recoder plus tard sans le vouloir)

- Facturation partielle (acompte, situation, solde).
- Saisie de facture indépendante d'un devis.
- Suivi de règlement partiel (paiement en plusieurs fois).
- Avoir / facture rectificative / annulation d'une facture émise.
- Relances automatiques sur factures en retard.
