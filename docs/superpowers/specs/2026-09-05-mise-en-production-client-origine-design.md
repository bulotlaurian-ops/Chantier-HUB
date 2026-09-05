# Mise en production pour l'entreprise d'origine

> Spec issue d'une session de brainstorming avec Laurian le 2026-09-05.

## Contexte

Chantier Hub est un template open source, anonymisé à partir d'un projet réel construit
pour une entreprise du bâtiment (3 entités : ARTISAN PRO, EXTERIEUR, INTERIEUR). Rien
n'est aujourd'hui déployé pour cette entreprise : le template repart d'une base vide.

Objectif final de Laurian : vendre cet outil à plusieurs entreprises du bâtiment. Mais
avant de penser à d'autres clients, la priorité est de le remettre en production pour
l'entreprise d'origine, qui servira de première référence concrète.

Cette spec couvre uniquement cette première étape. La suite (rendre le produit facile à
redéployer pour d'autres entreprises, tarification, présentation commerciale) est un
chantier séparé, volontairement hors périmètre ici.

## Contrainte transversale : exécution pédagogique

Laurian est en phase d'apprentissage actif de l'IA et de ses outils — c'est son objectif
n°1 du moment. Il a explicitement demandé que ce déploiement serve aussi à apprendre au
fur et à mesure, pas seulement à obtenir un résultat.

Conséquence sur la façon de travailler pendant l'implémentation :
- Chaque étape technique est expliquée (quoi, pourquoi) avant ou pendant l'exécution,
  pas seulement exécutée en silence.
- Les actions qui passent par un dashboard ou un compte (création du projet Supabase,
  création du compte Vercel, exécution de SQL dans l'éditeur Supabase, création du
  premier compte admin) sont faites **par Laurian**, guidé pas à pas, plutôt que
  déléguées à un outil qui le ferait à sa place quand c'est possible.
- Les actions purement mécaniques dans le code (formatage, remplacement de valeurs de
  configuration une fois les vraies infos fournies) peuvent être faites directement,
  mais expliquées après coup si le changement n'est pas trivial.

## Découverte en cours de brainstorming : le code est câblé pour la Suisse

Le template est entièrement construit avec des hypothèses suisses en dur, pas seulement
des valeurs d'exemple : devise francs suisses (`formatCHF`/`formatCHFShort` dans
`src/lib/format.ts`, utilisées dans une vingtaine de fichiers), taux de TVA par défaut
suisses (8.10 % / 2.60 % / 3.80 % / 0 %, valeur par défaut `8.10` sur les colonnes
`taux_tva` de `lignes_devis` et `factures_fournisseurs`, seed de la table `tva_taux` dans
`supabase/migrations/005_refonte_modele.sql`), un arrondi de caisse à 0.05 (fonctions `a05`
dupliquées dans 4 fichiers : `src/routes/index.tsx`, `chantiers.index.tsx`,
`chantiers.$id.tsx`, `devis.nouveau.tsx`, commentées « arrondi suisse »), et des libellés
spécifiques (« IDE » pour le numéro d'entreprise au lieu de SIRET, référence à l'AFC dans
l'écran Paramètres → TVA).

L'entreprise d'origine est **française**, pas suisse. Ce n'est donc pas une simple valeur
à personnaliser (comme la raison sociale) : c'est une dépendance technique qui doit être
traitée **avant** la personnalisation, ajoutée ici comme nouveau bloc de la spec.

### Bloc 0 (nouveau, prioritaire) : localisation France

- Renommer/adapter `formatCHF`/`formatCHFShort` en équivalent EUR, et mettre à jour tous
  les appels.
- Remplacer le seed de `tva_taux` par les taux français (20 % normal, 10 % intermédiaire,
  5.5 % réduit, 2.1 % particulier — à confirmer selon l'activité exacte de l'entreprise),
  et les valeurs par défaut `8.10` des colonnes `taux_tva` concernées. Comme rien n'est
  encore déployé, ces migrations peuvent être corrigées directement plutôt que patchées
  par une migration correctrice.
- Retirer l'arrondi à 0.05 (spécifique aux espèces en Suisse, sans équivalent légal en
  France) : les montants restent simplement arrondis au centime (comportement déjà natif
  des colonnes `numeric(14,2)`), sans logique d'arrondi supplémentaire. Décision tranchée
  par simplicité (YAGNI) plutôt que d'en faire une option configurable.
- Adapter l'écran Paramètres → TVA (`parametres.index.tsx`, `TVA_RATES`) aux taux et
  libellés français, retirer la référence à l'AFC.
- Remplacer le libellé « IDE » par « SIRET » (ou le libellé pertinent) partout où il
  apparaît (notamment `src/lib/pdf.ts`).

### Dans le périmètre

1. **Infrastructure** : nouveau projet Supabase dédié (compte Supabase existant de
   Laurian, nouveau projet séparé de celui du projet devis-artisans), nouveau compte et
   déploiement Vercel. Migrations appliquées dans l'ordre, en tenant compte des
   avertissements du README (`005_refonte_modele.sql` fait foi sur `001`, les numéros
   024 à 027 sont absents de la série d'origine, ce n'est pas un oubli).
2. **Personnalisation réelle** : remplacement de toutes les valeurs marquées
   `⚠️ À PERSONNALISER` par les vraies informations de l'entreprise — raison sociale,
   adresse, numéro d'entreprise, IBAN et contacts par entité (`src/lib/pdf.ts`), logos
   (`public/logos/`), et un premier texte de CGV réel à la place du texte de
   démonstration (`src/lib/cgv.ts`).
3. **Nettoyage de dette technique signalée dans le README** :
   - Vérifier les écrans qui référencent encore le store Zustand legacy
     (`src/lib/store.ts`) et les faire pointer sur Supabase (source de vérité). Investigation
     faite pendant le brainstorming : 6 fichiers concernés
     (`src/lib/auth.tsx`, `src/components/Badges.tsx`, `src/components/AppSidebar.tsx`,
     `src/routes/chantiers.index.tsx`, `src/routes/devis.index.tsx`,
     `src/routes/parametres.index.tsx`). Les remplacements réels existent déjà et sont
     utilisables tels quels : `useEntites()` (`src/lib/queries/entites.ts`) pour les
     données d'entité (nom/couleur/code), `useAuth()` (`profile.role`, `isAdmin`,
     `isStaff`, déjà réel) pour le rôle courant. Cas particulier :
     `parametres.index.tsx` a déjà migré une bonne partie vers Supabase
     (`useParametres`/`useUpdateParametre`, comptes utilisateurs, taux horaires) — seul
     l'onglet « Identité » (lignes ~70-88, données 100 % fictives et non sauvegardées :
     IDE aléatoire, adresse « Route de Berne 12, Lausanne » en dur) et les presets
     `FG_PRESETS`/`COEF_PRESETS` (qui référencent encore d'anciens codes d'entité
     `MNC`/`MINT`/`MEXT`, antérieurs à la refonte 005) restent à traiter — non
     sauvegardés nulle part, purement décoratifs.
   - Passer le code au formateur (`npx eslint src --fix`) en un commit dédié, séparé de
     tout changement fonctionnel.
4. **Mise en route et validation** : configuration des entités réelles, des conditions
   de paiement, des taux de TVA et des paramètres globaux. Création du premier compte
   admin. Test de bout en bout : un devis réel créé, PDF généré, vérification du
   cloisonnement par rôle et par entité (un conducteur ne voit que ses entités, un
   ouvrier ne voit ni prix ni marge).

### Hors périmètre (volontairement, chantier séparé plus tard)

- Briques IA/OCR (n8n, workflows, OpenAI) : le README confirme que l'app fonctionne
  sans elles. Activées dans un second temps, une fois l'usage de base validé par
  l'entreprise.
- Le bug connu de la requête n8n qui lit les prestations `pending` (nœud 5) : non
  pertinent tant que n8n n'est pas activé, à traiter au moment de l'activer.
- Tout ce qui concerne la redéployabilité pour d'autres entreprises clientes
  (généricité, script d'onboarding, tarification, support commercial).
- Validation juridique définitive des CGV : je peux rédiger un premier texte structuré,
  mais il devra être relu par un professionnel (comptable, avocat, ou fédération du
  métier) avant tout envoi de devis réel à un client de l'entreprise. Ce n'est pas
  quelque chose qu'une IA peut garantir.

## Informations à fournir par Laurian avant/pendant l'exécution

- Raison sociale, adresse, numéro d'entreprise (SIRET), IBAN de l'entreprise.
- Coordonnées de contact (téléphone, email, site) par entité, si elles diffèrent.
- Fichiers logos à utiliser (`public/logos/`).
- Confirmation des noms d'entités : garder PRO / EXT / INT tels quels, ou les
  renommer/ajuster.
- Email de la première personne à créer en tant que compte admin.
- Organisation Supabase où créer le nouveau projet.

## Validation attendue en fin de chantier

- Application accessible en ligne (URL Vercel) avec les vraies informations de
  l'entreprise sur les documents générés.
- Connexion fonctionnelle avec au moins un compte admin réel.
- Un devis de test complet créé, PDF téléchargé, cohérent avec les vraies données de
  l'entreprise (pas de valeur de démonstration résiduelle).
- Vérification manuelle que le cloisonnement par rôle/entité fonctionne comme prévu.
- Code formaté et le store legacy nettoyé, sur des commits séparés du reste.
