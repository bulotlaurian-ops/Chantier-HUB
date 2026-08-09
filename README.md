# Chantier Hub — template open source

Application web de gestion pour une entreprise du bâtiment : **devis → chantier → marge réelle**.
Bibliothèque de prix, devis assisté par IA (dictée vocale + texte), OCR des factures
fournisseurs, pointage des heures, calcul de marge, multi-entités et gestion des rôles.

C'est un **projet réel**, anonymisé et remis à zéro pour servir de base de travail :
aucune donnée d'entreprise, aucune donnée client, base vide au démarrage.

---

## Ce qu'il y a dedans

| Brique | Où |
|---|---|
| Front React 19 + TanStack Router/Start, Tailwind 4, shadcn/ui | `src/` |
| Schéma Postgres complet + RLS par rôle et par entité | `supabase/migrations/` |
| 4 Edge Functions (devis IA, 2× OCR, gestion des comptes) | `supabase/functions/` |
| 3 workflows n8n (devis assisté, OCR facture, OCR devis sous-traitant) | `n8n/` |
| Générateur de devis PDF (jsPDF), template paramétré par entité | `src/lib/pdf.ts` |
| Contexte projet pour Claude Code | `CLAUDE.md` |

**Stack** : React 19 · TypeScript 5.8 · Vite 7 · TanStack Start · Tailwind 4 · Supabase · jsPDF · n8n.

**Prérequis** : Node 20.19+ (ou 22.12+, contrainte Vite 7), un compte Supabase, et — seulement
pour les briques IA/OCR — une instance n8n et une clé OpenAI.

---

## Installation

### 1. Dépendances

```bash
npm install
```

### 2. Projet Supabase

Créez un projet sur [supabase.com](https://supabase.com), puis appliquez les migrations
**dans l'ordre des numéros de fichier**. Le plus simple, avec la CLI Supabase :

```bash
supabase link --project-ref VOTRE-PROJET-SUPABASE && supabase db push
```

Sans la CLI : ouvrez chaque fichier de `supabase/migrations/` dans le SQL Editor du
dashboard et exécutez-les l'un après l'autre, du plus petit numéro au plus grand.

> Les numéros 024 à 027 n'existent pas dans la série. Ce n'est pas un oubli de packaging :
> ils n'ont jamais été versionnés dans le projet d'origine. La suite s'applique sans
> dépendance manquante.

À ce stade la base contient uniquement de la configuration : 3 entités d'exemple, les taux
de TVA, les conditions de paiement et les paramètres globaux. **Aucun client, chantier ou
devis.**

### 3. Variables d'environnement

```bash
cp .env.example .env.local
```

Renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings →
Data API).

### 4. Lancer

```bash
npm run dev
```

### 5. Créer le premier compte admin

Créez un utilisateur depuis Supabase → Authentication → Users, puis passez-le admin en SQL :

```sql
update profiles set role = 'admin' where id = 'UUID-DE-VOTRE-UTILISATEUR';
```

Une fois connecté en admin, tous les comptes suivants se créent depuis l'application
(Paramètres → Accès), sans repasser par le dashboard.

---

## À personnaliser avant tout usage réel

Le template contient des valeurs d'exemple qui s'impriment sur les documents générés.
Elles sont toutes marquées d'un `⚠️ À PERSONNALISER` dans le code.

| Quoi | Où |
|---|---|
| Raison sociale, adresse, numéro d'entreprise, **IBAN** | `src/lib/pdf.ts` → `SOCIETE` |
| Téléphone, email, site par entité | `src/lib/pdf.ts` → `ENTITE_CONTACT` |
| **CGV** (texte de démonstration, aucune valeur juridique) | `src/lib/cgv.ts` |
| Noms, codes et couleurs des entités | table `entites` (voir migration 005) |
| Logos imprimés sur les devis | `public/logos/` (voir le README du dossier) |

Les entités sont **des lignes en base**, pas du code : renommez-les, réduisez-les à une
seule ou ajoutez-en. Seuls trois endroits listent les codes en dur et sont à ajuster si
vous changez `PRO` / `EXT` / `INT` : `src/lib/types.ts`, `src/lib/prestations-filtres.ts`
et la table `LOGOS` de `src/routes/devis.$id.tsx`.

---

## Briques IA et OCR (optionnelles)

L'application fonctionne sans elles : saisie manuelle des devis et des factures.
Pour les activer :

1. Importez les 3 fichiers de `n8n/` dans votre instance n8n.
2. Dans chaque workflow, recréez les credentials — ils sont volontairement livrés avec la
   valeur `REMPLACER_PAR_VOTRE_CREDENTIAL_ID` :
   - un credential **Header Auth** par webhook (secret partagé avec Supabase) ;
   - un credential **Supabase** (URL du projet + clé `service_role`) ;
   - un credential **OpenAI** (votre clé).
3. Déclarez les secrets côté Supabase :

```bash
supabase secrets set N8N_WEBHOOK_URL=... DEVIS_WEBHOOK_SECRET=... OCR_WEBHOOK_URL=... OCR_WEBHOOK_SECRET=... OCR_DEVIS_ST_WEBHOOK_URL=... OCR_DEVIS_ST_WEBHOOK_SECRET=...
```

4. Déployez les Edge Functions :

```bash
supabase functions deploy devis-assiste ocr-facture ocr-devis-st admin-utilisateurs
```

Les secrets de webhook doivent être **identiques** des deux côtés : c'est ce qui empêche
d'appeler vos workflows n8n depuis l'extérieur. Ne publiez jamais un webhook n8n en
authentification `None`.

Les specs détaillées des workflows sont dans `n8n/spec-devis-assiste.md`,
`n8n/n8n-workflow-devis-assiste.md` et `n8n/n8n-workflow-ocr-facture.md`.

---

## Déploiement

Le projet est un build Vite standard (`npm run build`). Il a tourné en production sur
Vercel, mais rien n'est spécifique à Vercel : n'importe quel hébergeur de site statique
avec variables d'environnement fait l'affaire. Pensez à déclarer `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY` côté hébergeur.

---

## Points d'attention connus

- **Store legacy** : `src/lib/store.ts` (Zustand) contient un jeu de données de
  démonstration entièrement fictif, hérité du prototype. La source de vérité est Supabase.
  Quelques écrans le référencent encore — c'est le premier nettoyage à faire si vous
  reprenez le projet.
- **Prestations `pending` et LLM** : le workflow n8n lit toute la table `prestations`,
  y compris celles en attente de validation. Ajoutez `actif=eq.true` à
  `SUPABASE_PRESTATIONS_QUERY` (nœud 5) avant une mise en production. Détaillé dans `CLAUDE.md`.
- **CGV** : le texte livré est un squelette générique de démonstration. Faites rédiger ou
  valider les vôtres avant d'émettre le moindre devis.
- **Formatage** : `npm run lint` remonte plusieurs milliers d'erreurs `prettier/prettier`.
  Le projet n'a jamais été passé au formateur. Elles sont toutes cosmétiques et se corrigent
  d'un coup — `npx eslint src --fix` — mais cela touche presque tous les fichiers, donc
  faites-le sur un commit dédié. Le code compile et se build sans erreur en l'état
  (`npx tsc --noEmit` est vert).

---

## Licence

Fourni tel quel, sans garantie, à des fins d'apprentissage et de réutilisation.
Vous êtes responsable de la conformité de son usage — mentions légales, CGV, protection
des données et facturation relèvent de votre juridiction.
