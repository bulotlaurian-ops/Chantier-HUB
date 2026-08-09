# Chantier Hub — Contexte projet

> Lu automatiquement par Claude Code à chaque session. Il fait foi : en cas de conflit
> avec un prompt ponctuel, **ce fichier l'emporte**. Langue de travail : français.

---

## 1. Le projet

**Chantier Hub** : application web responsive de gestion interne pour une entreprise de
rénovation / construction / aménagements extérieurs. Le modèle prévoit **3 entités
commerciales sous une même société** :

- **ARTISAN PRO** (`PRO`) — clientèle professionnelle (retail, soumissions, contrats-cadres).
- **EXTERIEUR** (`EXT`) — clôtures, garde-corps, pergolas, portails. Privés + pros.
- **INTERIEUR** (`INT`) — clientèle privée (rénovation intérieure).

Ces 3 entités sont **des données**, pas du code : renommez-les, réduisez-les à une seule
ou ajoutez-en dans la table `entites`. Le cycle couvert est **devis → chantier → marge réelle**.

## 2. Stack

- **Front** : React 19 + TS, Vite, TanStack Router/Start, Tailwind 4, shadcn/ui.
  (Un store Zustand legacy subsiste dans `src/lib/store.ts` — la source de vérité est Supabase.)
- **Données** : Supabase (Postgres + Auth + Storage).
- **Déploiement** : pensé pour Vercel, mais rien n'y est spécifique.
- **Génération PDF des devis = DANS L'APP** (jsPDF, `src/lib/pdf.ts`). Pas dans n8n.
- **n8n = ingestion / IA** : OCR et parsing des PDF entrants (devis sous-traitants, factures
  fournisseurs), mapping vers la bibliothèque de prix, transcription vocale.

## 3. Décisions d'architecture ACTÉES (ne pas réinterpréter)

1. **Bibliothèque de prix COMMUNE** aux entités (pas d'`entite_id` sur les prestations).
   **Clients PARTAGÉS**. L'entité n'est portée que par `devis` et `chantier`.
2. **Modèle de prix** : `prestations` (prix d'achat + prix de vente de référence)
   + `categories_tarifaires` (configurable) + `tarifs` (remise % / coefficient / prix absolu
   par catégorie). Gère aussi bien les remises par type de client que la tarification par
   nature de projet (`devis.nature_projet_id`).
3. **Cloisonnement par RÔLE + par ENTITÉ pour les conducteurs.** Table `user_entites`,
   fonction `user_a_acces_entite()`. Un conducteur ne voit/édite que les devis et chantiers
   de ses entités. Les données partagées (clients, bibliothèque) restent visibles à tout le
   staff. Un ouvrier voit les chantiers actifs et ses heures ; **jamais la bibliothèque de
   prix** (ni prix, ni marges).
4. **Marge dérivée du prix saisi** (total HT − coût de revient), **affichée**, jamais validée
   en amont. Elle est parfois non calculable au devis (régie, contrat-cadre) → le panneau de
   marge est **contextuel**, pas systématique.
5. **Heures** : aucun verrou de saisie. La durée de référence hebdomadaire est indicative.
   Le temps de trajet (`heures_trajet`) est saisi simplement, aucune règle automatisée.
6. **Nomenclature** : devis `AAMMNNN / version` (ex. `2606001 / 2`) ; chantier `NOM CLIENT / VILLE`.
7. **lignes_devis** : remise par ligne (`remise_pct`), lignes **option non totalisées**
   (`est_option`), lignes **titre** (`est_titre`), **arrondi au 0.05** sur le total.
8. **TVA** : table datée (`tva_taux`), pour absorber un changement de taux sans migration.
9. **Paramètres** globaux en base (`parametres`) : taux horaire par défaut, coefficient de
   frais généraux, seuils de marge. Rien de tout cela n'est codé en dur.

## 4. Circuit de validation de la bibliothèque

Migration 020 : un conducteur peut proposer une prestation hors bibliothèque
(`statut_validation='pending'`, `actif=false`). L'admin valide (`valide`, `actif=true`) ou
rejette (`rejete`, trace conservée). Le hook `usePrestations` ne sert que `actif=true`.

⚠️ **À faire avant une mise en production** : ajouter `actif=eq.true` à la requête
`SUPABASE_PRESTATIONS_QUERY` du workflow n8n (nœud 5). Aujourd'hui il lit toute la table :
une prestation `pending` part donc au LLM. Ce n'est pas une fuite de données (l'app ne
résout pas un `prestation_id` non actif), mais c'est du bruit inutile dans le prompt.

## 5. OCR — brique transverse

Les documents entrants sont majoritairement **scannés**, pas du texte natif : devis de
sous-traitants, factures fournisseurs aux formats hétérogènes. Le parsing passe donc par de
l'OCR multi-formats (workflows n8n `ocr-facture` et `ocr-devis-st`), jamais par une
extraction de texte PDF directe.

## 6. Modèle de données

Cible = `supabase/migrations/005_refonte_modele.sql`, complétée par les migrations suivantes.

Tables : `entites`, `conditions_paiement`, `tva_taux`, `parametres`, `profiles`,
`user_entites`, `categories_tarifaires`, `clients`, `prestations` + `tarifs` + `postes`
+ `sous_postes`, `chantiers`, `devis` + `lignes_devis`, `pointages`,
`factures_fournisseurs` + `factures_repartition`, `snapshots_marge`, `activite`.

RLS via `current_role_app()` et `user_a_acces_entite()`. Vue `chantier_couts_reels`.

⚠️ La migration `001` porte le schéma initial, dont plusieurs hypothèses ont été **corrigées
par `005_refonte_modele.sql`**. C'est 005 qui fait foi. Les numéros 024 à 027 sont absents
de la série (jamais versionnés dans le projet d'origine) — la suite s'applique malgré tout
dans l'ordre, sans dépendance manquante.

## 7. Rôles

- **admin** — accès total, gestion des comptes depuis Paramètres → Accès.
- **conducteur** — devis, chantiers et bibliothèque, limités à ses entités.
- **ouvrier** — pointage des heures uniquement.

Les comptes sont créés depuis l'application via l'Edge Function `admin-utilisateurs`
(clé `service_role` côté serveur, vérification du JWT et du rôle admin). La suppression est
refusée si l'utilisateur porte des pointages, devis ou factures (contraintes FK) : on le
désactive alors via `profiles.actif`.

## 8. Conventions

- SQL en `snake_case` français, migrations versionnées dans `supabase/migrations/`.
- Secrets en variables d'environnement, **jamais en dur** ; `.env*` est gitignoré.
- Génération PDF dans l'app ; workflows n8n exportés en JSON dans `n8n/`.
- Les clés API (OpenAI notamment) sont fournies par l'exploitant de l'instance, côté
  credentials n8n et secrets Supabase — jamais commitées.
