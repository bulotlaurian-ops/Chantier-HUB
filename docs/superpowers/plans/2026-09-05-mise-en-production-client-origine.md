# Mise en production Chantier Hub (entreprise d'origine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Particularité de ce plan :** contrairement à un plan de développement pur logiciel, une
> bonne partie des tâches touchent de l'infrastructure et des comptes externes (Supabase,
> Vercel) plutôt que du code testable en isolation. Pour ces tâches, le format "test
> automatisé" est remplacé par une "vérification" concrète (commande à lancer, écran à
> observer). Conformément à la contrainte pédagogique ci-dessous, ces étapes-là sontà
> exécuter PAR Laurian, pas à sa place.

**Goal:** Déployer Chantier Hub en production pour l'entreprise d'origine (entreprise
française du bâtiment, 3 entités PRO/EXT/INT), sans les briques IA/OCR, avec des données et
une devise/fiscalité réelles françaises.

**Architecture:** Nouveau projet Supabase dédié + déploiement Vercel. Avant toute
personnalisation, correction des hypothèses suisses codées en dur (devise, TVA, arrondi) et
nettoyage du store Zustand legacy qui affiche encore des données de démonstration à côté du
vrai backend Supabase.

**Tech Stack:** React 19, TypeScript, Vite 7, TanStack Router/Start, Tailwind 4, shadcn/ui,
Supabase (Postgres + Auth), jsPDF.

**Spec:** `docs/superpowers/specs/2026-09-05-mise-en-production-client-origine-design.md`

## Global Constraints

- Aucune brique n8n / OpenAI / OCR activée dans ce chantier (hors périmètre, cf. spec).
- Toute action passant par un dashboard ou un compte externe (créer le projet Supabase,
  créer le compte Vercel, exécuter du SQL dans l'éditeur Supabase, créer le premier compte
  admin) est effectuée **par Laurian**, guidé pas à pas — jamais à sa place.
- Les CGV produites dans ce plan restent un texte de base à faire valider par un
  professionnel avant tout envoi de devis réel — ce n'est écrit nulle part comme validé
  juridiquement.
- Pas de migration corrective : rien n'étant encore déployé, les fichiers de migration
  existants sont corrigés directement plutôt que patchés par une migration supplémentaire.
- Formatage (`npx eslint src --fix`) toujours en commit séparé de tout changement
  fonctionnel.

---

## Bloc A — Localisation France

### Task 1 : Devise CHF → EUR

**Files:**
- Modify: `src/lib/format.ts:1-21` (`formatCHF`, `formatCHFShort`, `formatMontant`)
- Modify: tous les fichiers importateurs de `formatCHF`/`formatCHFShort` (liste exacte à
  obtenir à l'étape 1, une vingtaine de fichiers dans `src/routes/` et `src/components/`)

**Interfaces:**
- Produces: `formatEUR(n: number): string`, `formatEURShort(n: number): string` (mêmes
  signatures que les fonctions remplacées, `formatMontant` inchangée dans sa signature).

- [ ] **Étape 1 : lister tous les appelants actuels**

Run: `grep -rl "formatCHF" src` (ou l'outil de recherche de contenu du projet)
Note la liste des fichiers retournés — chacun doit être mis à jour à l'étape 3.

- [ ] **Étape 2 : renommer et adapter les fonctions dans `src/lib/format.ts`**

Remplacer les lignes 1-21 par :

```typescript
export function formatEUR(n: number): string {
  const v = Math.round(n * 100) / 100;
  const neg = v < 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${withSpaces},${decPart} €`;
}

export function formatEURShort(n: number): string {
  const v = Math.round(n);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}

// Montant français sans suffixe : 1 345,00 (pour les colonnes/totaux du PDF de devis).
export function formatMontant(n: number): string {
  const v = Math.round(n * 100) / 100;
  const neg = v < 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${withSpaces},${decPart}`;
}
```

Note : la France utilise la virgule comme séparateur décimal et l'espace (insécable,
` `) comme séparateur de milliers — remplace l'apostrophe suisse.

- [ ] **Étape 3 : remplacer tous les appels `formatCHF`/`formatCHFShort` par `formatEUR`/`formatEURShort`**

Pour chaque fichier listé à l'étape 1 : remplacer l'import et les appels
(`formatCHF(x)` → `formatEUR(x)`, `formatCHFShort(x)` → `formatEURShort(x)`). Aucune
signature ne change, c'est un renommage mécanique.

- [ ] **Étape 4 : vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur (si une erreur mentionne encore `formatCHF`, un appelant a été
oublié à l'étape 3).

- [ ] **Étape 5 : vérification visuelle**

Run: `npm run dev`, ouvrir le tableau de bord et une fiche devis existante (données de
seed). Vérifier que les montants s'affichent en euros (`1 234,00 €`), pas en francs
suisses.

- [ ] **Étape 6 : commit**

```bash
git add src/lib/format.ts src/routes src/components
git commit -m "feat: bascule de la devise CHF vers EUR"
```

---

### Task 2 : TVA française

**Files:**
- Modify: `supabase/migrations/005_refonte_modele.sql:222,245,274,401-403`
- Modify: `src/routes/devis.$id.tsx:72`
- Modify: `src/routes/devis.nouveau.tsx:717`
- Modify: `src/routes/parametres.index.tsx:34-39` (`TVA_RATES`)

**Interfaces:**
- Consumes : aucune (modifications de données/constantes).
- Produces : taux de TVA française disponibles via `useTauxTvaCourants()` (déjà existant,
  `src/lib/queries/tva.ts`, aucune modif nécessaire sur ce fichier — il lit la table, pas
  de valeur en dur).

- [ ] **Étape 1 : mettre à jour le seed de la table `tva_taux`**

Dans `supabase/migrations/005_refonte_modele.sql`, remplacer (ligne 401-403) :

```sql
insert into tva_taux (type, taux, date_debut) values
  ('standard',8.10,'2024-01-01'),('reduit',2.60,'2024-01-01'),
  ('hebergement',3.80,'2024-01-01'),('exonere',0.00,'2024-01-01');
```

par :

```sql
insert into tva_taux (type, taux, date_debut) values
  ('standard',20.00,'2024-01-01'),('reduit',5.50,'2024-01-01'),
  ('hebergement',10.00,'2024-01-01'),('exonere',0.00,'2024-01-01');
```

Les noms des types (`standard`/`reduit`/`hebergement`/`exonere`) restent inchangés (ce sont
des valeurs d'enum Postgres, coûteuses à renommer) ; `hebergement` porte maintenant le taux
intermédiaire français de 10 % (pertinent pour les travaux de rénovation du bâtiment, pas
seulement l'hébergement).

- [ ] **Étape 2 : mettre à jour les valeurs par défaut des colonnes `taux_tva`**

Dans le même fichier, ligne 245 (`lignes_devis`) :

```sql
taux_tva numeric(5,2) not null default 8.10,        -- figé au devis
```
→
```sql
taux_tva numeric(5,2) not null default 20.00,       -- figé au devis
```

Et ligne 274 (`factures_fournisseurs`) :

```sql
montant_ht numeric(14,2) not null default 0, taux_tva numeric(5,2) not null default 8.10,
```
→
```sql
montant_ht numeric(14,2) not null default 0, taux_tva numeric(5,2) not null default 20.00,
```

- [ ] **Étape 3 : corriger le commentaire ligne 222**

```sql
total_ttc numeric(14,2) not null default 0,         -- arrondi suisse 0.05 appliqué applicativement
```
→
```sql
total_ttc numeric(14,2) not null default 0,
```

(Le commentaire n'a plus lieu d'être une fois l'arrondi suisse retiré à la Task 3.)

- [ ] **Étape 4 : corriger le taux de repli codé en dur dans `devis.$id.tsx`**

Ligne 72 :
```typescript
const tauxAffiche = d.total_ht > 0 ? Math.round((d.total_tva / d.total_ht) * 1000) / 10 : (d.lignes[0]?.taux_tva ?? 8.1);
```
→
```typescript
const tauxAffiche = d.total_ht > 0 ? Math.round((d.total_tva / d.total_ht) * 1000) / 10 : (d.lignes[0]?.taux_tva ?? 20);
```

- [ ] **Étape 5 : corriger le libellé codé en dur dans `devis.nouveau.tsx`**

Ligne 717 :
```tsx
<Row label="TVA 8.1 %" value={formatEUR(totaux.total_tva)} />
```
→
```tsx
<Row label="TVA" value={formatEUR(totaux.total_tva)} />
```

(Aligné sur le libellé générique déjà utilisé ligne 605 dans le récapitulatif desktop —
le taux effectif peut varier par ligne, un libellé fixe à un seul taux est trompeur.)

- [ ] **Étape 6 : mettre à jour la table de référence TVA de l'écran Paramètres**

Dans `src/routes/parametres.index.tsx`, remplacer les lignes 34-39 :

```typescript
const TVA_RATES = [
  { label: 'Standard', value: 8.1, usage: 'Prestations & matériaux courants' },
  { label: 'Réduit', value: 2.6, usage: 'Biens de première nécessité' },
  { label: 'Hébergement', value: 3.8, usage: 'Nuitées hôtelières' },
  { label: 'Exonéré', value: 0, usage: 'Export, prestations exclues' },
];
```

par :

```typescript
const TVA_RATES = [
  { label: 'Standard', value: 20, usage: 'Prestations & matériaux courants' },
  { label: 'Intermédiaire', value: 10, usage: 'Travaux de rénovation (logement > 2 ans)' },
  { label: 'Réduit', value: 5.5, usage: 'Travaux d’amélioration énergétique' },
  { label: 'Exonéré', value: 0, usage: 'Export, prestations exclues' },
];
```

Et remplacer la légende ligne 124 :
```tsx
<p className="text-xs text-muted-foreground italic mt-2">Taux applicables dès le 01.01.2024 — modifiables si l'AFC publie de nouveaux taux.</p>
```
par :
```tsx
<p className="text-xs text-muted-foreground italic mt-2">Taux applicables dès le 01.01.2024 — modifiables si l'administration fiscale publie de nouveaux taux.</p>
```

- [ ] **Étape 7 : vérification**

Comme rien n'est encore déployé, cette vérification se fera lors de l'application des
migrations (Bloc D, Task 11) : créer un devis de test et vérifier que la TVA affichée est
bien 20 % par défaut.

- [ ] **Étape 8 : commit**

```bash
git add supabase/migrations/005_refonte_modele.sql src/routes/devis.\$id.tsx src/routes/devis.nouveau.tsx src/routes/parametres.index.tsx
git commit -m "feat: bascule des taux de TVA suisses vers les taux français"
```

---

### Task 3 : Suppression de l'arrondi de caisse suisse (0.05)

**Files:**
- Modify: `src/routes/devis.nouveau.tsx:330,339,606,718`
- Modify: `src/routes/index.tsx:17` (fonction `a05`)
- Modify: `src/routes/chantiers.index.tsx:24-25`
- Modify: `src/routes/chantiers.$id.tsx:26-27`

**Interfaces:**
- Consumes : aucune.
- Produces : `totaux.total_ttc`/`totaux.arrondi` (mêmes noms de champs qu'avant, valeur
  `arrondi` désormais toujours ≈ 0).

- [ ] **Étape 1 : simplifier le calcul du TTC dans `devis.nouveau.tsx`**

Ligne 330, remplacer le commentaire :
```typescript
  // Arrondi suisse au 0.05 sur le TTC (§7).
```
par :
```typescript
  // Total TTC arrondi au centime (aucun arrondi de caisse en France).
```

Ligne 339, remplacer :
```typescript
    const total_ttc = r2(Math.round(ttcBrut / 0.05) * 0.05);
```
par :
```typescript
    const total_ttc = r2(ttcBrut);
```

- [ ] **Étape 2 : nettoyer les libellés "Arrondi (0.05)"**

Ligne 606 et ligne 718, remplacer (les deux occurrences, identiques) :
```tsx
{Math.abs(totaux.arrondi) > 0.0001 && <Row label="Arrondi (0.05)" value={formatEUR(totaux.arrondi)} />}
```
par :
```tsx
{Math.abs(totaux.arrondi) > 0.0001 && <Row label="Arrondi" value={formatEUR(totaux.arrondi)} />}
```

(La ligne ne s'affichera plus en pratique puisque `arrondi` sera toujours ≈ 0, mais le
champ reste en base pour ne pas casser `queries/devis.ts` qui le lit déjà — pas de migration
de schéma nécessaire.)

- [ ] **Étape 3 : simplifier les arrondis d'affichage (chantiers/dashboard)**

Ces trois occurrences arrondissent uniquement des montants AFFICHÉS (coûts/marge de
chantier), pas les totaux légaux des devis — même changement, par cohérence.

Dans `src/routes/index.tsx` ligne 17, `src/routes/chantiers.index.tsx` lignes 24-25, et
`src/routes/chantiers.$id.tsx` lignes 26-27, remplacer dans chaque fichier :

```typescript
// Affichage : arrondi suisse 0.05 (sur la valeur affichée uniquement, pas le calcul).
const a05 = (n: number) => Math.round(n / 0.05) * 0.05;
```

par :

```typescript
const a05 = (n: number) => Math.round(n * 100) / 100;
```

(On garde le nom `a05` pour ne pas devoir mettre à jour tous les appelants dans ces
fichiers — seul le comportement change. Un renommage en `arrondiCentime` est possible mais
pas nécessaire : YAGNI.)

- [ ] **Étape 4 : vérification**

Run: `npx tsc --noEmit` (aucune erreur attendue).
Vérification fonctionnelle reportée à la Task 18 (test de bout en bout) : créer un devis
avec des lignes dont le total TTC ne tombe pas rond, vérifier que le total ne subit plus de
saut à 0.05 près.

- [ ] **Étape 5 : commit**

```bash
git add src/routes/devis.nouveau.tsx src/routes/index.tsx src/routes/chantiers.index.tsx src/routes/chantiers.\$id.tsx
git commit -m "feat: retire l'arrondi de caisse suisse (0.05), arrondi au centime"
```

---

### Task 4 : IDE → SIRET

**Files:**
- Modify: `src/lib/pdf.ts:15-23,127`

**Interfaces:** aucune (constante interne au module).

- [ ] **Étape 1 : renommer le champ et son libellé**

Ligne 21, dans la constante `SOCIETE` :
```typescript
  ide: 'CHE-000.000.000',
```
→
```typescript
  siret: '000 000 000 00000',
```

Ligne 127 :
```typescript
  const l2 = `IDE ${SOCIETE.ide}   ·   IBAN ${SOCIETE.iban}`;
```
→
```typescript
  const l2 = `SIRET ${SOCIETE.siret}   ·   IBAN ${SOCIETE.iban}`;
```

- [ ] **Étape 2 : vérifier qu'aucun autre fichier ne référence `SOCIETE.ide`**

Run: `grep -rn "SOCIETE.ide\|\.ide\b" src` (adapter selon l'outil de recherche disponible)
Expected: plus aucune occurrence hors du fichier déjà modifié.

- [ ] **Étape 3 : commit**

```bash
git add src/lib/pdf.ts
git commit -m "feat: remplace le numero IDE suisse par le SIRET francais"
```

---

## Bloc B — Nettoyage du store legacy et des écrans décoratifs

### Task 5 : Migrer `Badges.tsx` vers les vraies entités Supabase

**Files:**
- Modify: `src/components/Badges.tsx:1-31`

**Interfaces:**
- Consumes : `useEntites()` de `src/lib/queries/entites.ts` (déjà existant) — retourne
  `{ data: Entite[] | undefined, isLoading, ... }` où `Entite = Tables<"entites">` (a bien
  les champs `id`, `nom`, `couleur`).
- Produces : `EntiteBadge`/`EntiteDot` inchangés dans leur signature (`{ entiteId, size? }`
  et `{ entiteId, className? }`).

**Contexte du bug** : `EntiteBadge`/`EntiteDot` lisent aujourd'hui les entités depuis le
store Zustand legacy (données de démonstration figées au chargement de l'app). Si
l'entreprise renomme une entité ou change sa couleur dans Supabase, ces badges continueront
d'afficher l'ancienne valeur partout dans l'app — un vrai bug pour un client en production,
pas seulement de la dette cosmétique.

- [ ] **Étape 1 : remplacer l'import et la lecture des entités**

Remplacer les lignes 1-11 :

```typescript
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { StatutChantier, StatutDevis, CategoriePrix } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { couleurLisible } from '@/lib/couleur';

export function EntiteBadge({ entiteId, size = 'sm' }: { entiteId: string; size?: 'sm' | 'md' }) {
  const { theme } = useTheme();
  const entite = useStore(s => s.entites.find(e => e.id === entiteId));
  if (!entite) return null;
```

par :

```typescript
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { StatutChantier, StatutDevis, CategoriePrix } from '@/lib/types';
import { useEntites } from '@/lib/queries/entites';
import { useTheme } from '@/lib/theme';
import { couleurLisible } from '@/lib/couleur';

export function EntiteBadge({ entiteId, size = 'sm' }: { entiteId: string; size?: 'sm' | 'md' }) {
  const { theme } = useTheme();
  const { data: entites } = useEntites();
  const entite = entites?.find(e => e.id === entiteId);
  if (!entite) return null;
```

- [ ] **Étape 2 : même remplacement dans `EntiteDot`**

Ligne 28 :
```typescript
  const entite = useStore(s => s.entites.find(e => e.id === entiteId));
```
→
```typescript
  const { data: entites } = useEntites();
  const entite = entites?.find(e => e.id === entiteId);
```

- [ ] **Étape 3 : vérification**

Run: `npx tsc --noEmit`
Run: `npm run dev`, ouvrir la liste des devis ou chantiers, vérifier que les badges
d'entité (nom + couleur) s'affichent toujours correctement.

- [ ] **Étape 4 : commit**

```bash
git add src/components/Badges.tsx
git commit -m "fix: EntiteBadge/EntiteDot lisent les vraies entites Supabase"
```

---

### Task 6 : Créer un store minimal pour le filtre d'entité courante

**Files:**
- Create: `src/lib/entite-filter.ts`

**Interfaces:**
- Produces: `useEntiteFilter(): { currentEntiteId: string | 'all'; setEntite: (id: string | 'all') => void }`

**Contexte** : `currentEntiteId` (l'entité sélectionnée dans le menu latéral pour filtrer
devis/chantiers) est un vrai état d'interface, pas une donnée métier — pas besoin de
Supabase, mais il doit rester partagé entre `AppSidebar`, `devis.index.tsx` et
`chantiers.index.tsx`. On le sort du store legacy (qui embarque aussi toutes les fausses
données) vers un petit store Zustand dédié, sans données de démonstration.

- [ ] **Étape 1 : créer le nouveau store**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EntiteFilterStore {
  currentEntiteId: string | 'all';
  setEntite: (id: string | 'all') => void;
}

export const useEntiteFilter = create<EntiteFilterStore>()(
  persist(
    (set) => ({
      currentEntiteId: 'all',
      setEntite: (id) => set({ currentEntiteId: id }),
    }),
    { name: 'chantier-hub-entite-filter', version: 1 },
  ),
);
```

- [ ] **Étape 2 : vérification**

Run: `npx tsc --noEmit`
Expected: le nouveau fichier compile sans erreur (rien ne l'importe encore, c'est fait aux
tâches suivantes).

- [ ] **Étape 3 : commit**

```bash
git add src/lib/entite-filter.ts
git commit -m "feat: store dedie pour le filtre d'entite courante (sans donnees de demo)"
```

---

### Task 7 : Migrer `auth.tsx`, `AppSidebar.tsx`, `chantiers.index.tsx`, `devis.index.tsx`

**Files:**
- Modify: `src/lib/auth.tsx:4,89-93`
- Modify: `src/components/AppSidebar.tsx:1-37`
- Modify: `src/routes/chantiers.index.tsx:2,31-32`
- Modify: `src/routes/devis.index.tsx:2,20-21`

**Interfaces:**
- Consumes: `useAuth()` (déjà réel, `profile.role`), `useEntites()` (Task 5),
  `useEntiteFilter()` (Task 6).

- [ ] **Étape 1 : retirer la synchronisation vers le store legacy dans `auth.tsx`**

Ligne 4, retirer l'import :
```typescript
import { useStore } from "./store";
```

Lignes 89-93, remplacer :
```typescript
        setProfile(p);
        if (p) {
          const store = useStore.getState();
          store.setRole(p.role);
          if (p.role === "ouvrier") store.setOuvrier(p.id);
        }
        setLoading(false);
```
par :
```typescript
        setProfile(p);
        setLoading(false);
```

(`profile.role` est déjà exposé par `useAuth()` — plus besoin de le dupliquer dans un
store séparé.)

- [ ] **Étape 2 : migrer `AppSidebar.tsx`**

Remplacer les lignes 1-6 :
```typescript
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutDashboard, FileText, Hammer, Library, Settings, Clock, Users, Receipt, LogOut, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```
par :
```typescript
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutDashboard, FileText, Hammer, Library, Settings, Clock, Users, Receipt, LogOut, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEntites } from '@/lib/queries/entites';
import { useEntiteFilter } from '@/lib/entite-filter';
import { useAuth } from '@/lib/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

Remplacer les lignes 33-38 :
```typescript
  const path = useRouterState({ select: r => r.location.pathname });
  const role = useStore(s => s.currentRole);
  const entiteId = useStore(s => s.currentEntiteId);
  const setEntite = useStore(s => s.setEntite);
  const entites = useStore(s => s.entites);
  const { profile, signOut } = useAuth();
```
par :
```typescript
  const path = useRouterState({ select: r => r.location.pathname });
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? 'ouvrier';
  const { currentEntiteId: entiteId, setEntite } = useEntiteFilter();
  const { data: entites = [] } = useEntites();
```

- [ ] **Étape 3 : migrer `chantiers.index.tsx`**

Ligne 2 :
```typescript
import { useStore } from '@/lib/store';
```
→
```typescript
import { useEntites } from '@/lib/queries/entites';
import { useEntiteFilter } from '@/lib/entite-filter';
```

Lignes 31-32 :
```typescript
  const currentEntiteId = useStore(s => s.currentEntiteId);
  const storeEntites = useStore(s => s.entites);
```
→
```typescript
  const { currentEntiteId } = useEntiteFilter();
  const { data: storeEntites = [] } = useEntites();
```

- [ ] **Étape 4 : migrer `devis.index.tsx`**

Ligne 2 :
```typescript
import { useStore } from '@/lib/store';
```
→
```typescript
import { useEntites } from '@/lib/queries/entites';
import { useEntiteFilter } from '@/lib/entite-filter';
```

Lignes 20-21 :
```typescript
  const currentEntiteId = useStore(s => s.currentEntiteId);
  const storeEntites = useStore(s => s.entites);
```
→
```typescript
  const { currentEntiteId } = useEntiteFilter();
  const { data: storeEntites = [] } = useEntites();
```

- [ ] **Étape 5 : vérification**

Run: `npx tsc --noEmit`
Run: `npm run dev` — connecte-toi avec chaque rôle de test disponible (admin, conducteur,
ouvrier si des comptes de seed existent), vérifie que le menu latéral affiche les bons
éléments par rôle, que le sélecteur d'entité fonctionne, et que les listes devis/chantiers
se filtrent correctement par entité sélectionnée.

- [ ] **Étape 6 : commit**

```bash
git add src/lib/auth.tsx src/components/AppSidebar.tsx src/routes/chantiers.index.tsx src/routes/devis.index.tsx
git commit -m "fix: role et entites viennent de Supabase, plus du store legacy"
```

---

### Task 8 : Nettoyer l'écran Paramètres des sections fictives

**Files:**
- Modify: `src/routes/parametres.index.tsx:1-89,129-165`

**Contexte** : trois sections de cet écran ne sont reliées à aucune donnée réelle et n'ont
aucun bouton d'enregistrement (`Identité`, `Tarification`, `Frais généraux`) : elles
affichent des valeurs inventées (IDE aléatoire, adresse suisse en dur) ou font référence à
d'anciens codes d'entité (`MNC`/`MINT`/`MEXT`) antérieurs à la refonte 005. Le mécanisme réel
de coefficients par catégorie existe déjà et se configure depuis l'écran Bibliothèque (table
`tarifs`, cf. `CLAUDE.md` §2 du projet). Plutôt que de construire une fonctionnalité
d'édition complète ici (hors périmètre de ce chantier), on retire les deux onglets
non-fonctionnels et on rend l'onglet Identité en lecture seule sur les vraies données.

- [ ] **Étape 1 : remplacer l'import du store**

Ligne 5 :
```typescript
import { useStore } from '@/lib/store';
```
→
```typescript
import { useEntites } from '@/lib/queries/entites';
```

- [ ] **Étape 2 : retirer les onglets "Tarification" et "Frais généraux"**

Retirer les constantes `FG_PRESETS` (lignes 41-45) et `COEF_PRESETS` (lignes 47-51), ainsi
que les déclencheurs correspondants dans `TabsList` (lignes 62 et 64) :
```tsx
          <TabsTrigger value="tarification" className="gap-1.5"><Calculator className="w-3.5 h-3.5" />Tarification</TabsTrigger>
```
et
```tsx
          <TabsTrigger value="fg" className="gap-1.5"><SettingsIcon className="w-3.5 h-3.5" />Frais généraux</TabsTrigger>
```
et les blocs `<TabsContent value="tarification">` (lignes 91-108) et
`<TabsContent value="fg">` (lignes 129-146) en entier.

- [ ] **Étape 3 : rendre l'onglet Identité en lecture seule sur les vraies entités**

Remplacer le contenu de `<TabsContent value="identite">` (lignes 70-89) :

```tsx
        <TabsContent value="identite" className="space-y-4">
          {s.entites.map(e => (
            <Card key={e.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: e.couleur }} />
                  {e.nom}
                  <Badge variant="outline" className="font-mono ml-auto">{e.code}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-3">
                <div><Label className="text-xs">Raison sociale</Label><Input defaultValue={e.nom} /></div>
                <div><Label className="text-xs">N° IDE</Label><Input defaultValue={`CHE-${100 + Math.floor(Math.random()*900)}.${100 + Math.floor(Math.random()*900)}.${100 + Math.floor(Math.random()*900)}`} /></div>
                <div><Label className="text-xs">Adresse</Label><Input defaultValue="Route de Berne 12, 1010 Lausanne" /></div>
                <div><Label className="text-xs">Téléphone</Label><Input defaultValue="+41 21 555 00 00" /></div>
                <div className="md:col-span-2"><Label className="text-xs">Email contact</Label><Input defaultValue={`contact@${e.code.toLowerCase()}.ch`} /></div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
```

par :

```tsx
        <TabsContent value="identite" className="space-y-4">
          {entites.map(e => (
            <Card key={e.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: e.couleur ?? '#999' }} />
                  {e.nom}
                  <Badge variant="outline" className="font-mono ml-auto">{e.code}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Raison sociale, adresse, IBAN et contacts sont définis dans
                  <code className="mx-1">src/lib/pdf.ts</code>
                  (imprimés sur les devis PDF). Leur édition depuis cet écran n'est pas
                  encore disponible.
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
```

- [ ] **Étape 4 : mettre à jour la fonction du composant pour lire les vraies entités**

Ligne 53-54 :
```typescript
function Parametres() {
  const s = useStore();
```
→
```typescript
function Parametres() {
  const { data: entites = [] } = useEntites();
```

- [ ] **Étape 5 : vérifier les autres usages de `s.` dans le composant**

Les sections restantes (`ouvriers`, `heures`, `acces`) référencent encore `s.validiteDevisJours`,
`s.setValiditeDevis`, `s.conditionsDevis`, `s.setConditionsDevis`, `s.dureeJourneeMin`,
`s.setDureeJournee` (lignes 157, 161, 173) — ces champs sont, comme l'onglet Identité,
non reliés à Supabase (aucune colonne `parametres` ni `entites` ne les stocke réellement à
ce stade). Applique le même traitement qu'à l'étape 3 : remplace ces trois champs par un
texte explicatif équivalent plutôt que des `Input`/`Textarea` qui n'enregistrent rien,
par exemple :

```tsx
              <p className="text-xs text-muted-foreground italic">
                Validité par défaut des devis et conditions par défaut : configuration à
                construire dans un prochain chantier (non câblée à Supabase actuellement).
              </p>
```
à la place des blocs `Input`/`Textarea` correspondants (lignes 154-164), et la même chose
pour le bloc "Durée journée de référence" (lignes 167-178).

- [ ] **Étape 6 : vérification**

Run: `npx tsc --noEmit`
Run: `npm run dev`, ouvrir Paramètres en tant qu'admin, vérifier que l'écran ne montre plus
que des sections réellement fonctionnelles (Taux horaire, Comptes utilisateurs, Taux par
employé, Rôles) et des sections clairement marquées comme non câblées, sans donnée
suisse/fictive résiduelle.

- [ ] **Étape 7 : commit**

```bash
git add src/routes/parametres.index.tsx
git commit -m "fix: retire les sections Parametres non fonctionnelles (donnees fictives)"
```

---

### Task 9 : Supprimer le store legacy devenu inutilisé

**Files:**
- Delete: `src/lib/store.ts`
- Delete: `src/lib/seed.ts` (si plus référencé ailleurs que par `store.ts`)
- Modify: tout fichier qui importait encore `todayIso`, `genererReferenceChantier`,
  `resoudrePrixVente` ou `calculerTotauxDevis` depuis `@/lib/store` (utilitaires purs, à
  déplacer plutôt qu'à supprimer)

- [ ] **Étape 1 : vérifier qu'il ne reste aucun import de `useStore`**

Run: `grep -rn "from '@/lib/store'\|from \"./store\"\|from \"../lib/store\"" src`
Expected : seuls des imports des fonctions utilitaires pures (`todayIso`,
`genererReferenceChantier`, `resoudrePrixVente`, `calculerTotauxDevis`) subsistent, plus
aucun `useStore`.

- [ ] **Étape 2 : déplacer les utilitaires purs restants**

Créer `src/lib/devis-utils.ts` avec le contenu des fonctions utilitaires de
`src/lib/store.ts` lignes 104-130 (`genererReferenceChantier`, `resoudrePrixVente`,
`calculerTotauxDevis`, `todayIso`), inchangées. Mettre à jour leurs importateurs
(`chantiers.index.tsx`, `devis.nouveau.tsx`, et tout autre trouvé à l'étape 1) pour pointer
vers `@/lib/devis-utils` au lieu de `@/lib/store`.

- [ ] **Étape 3 : supprimer les fichiers devenus inutiles**

```bash
rm src/lib/store.ts src/lib/seed.ts
```

(Si `seed.ts` est encore utilisé ailleurs qu'à l'intérieur de `store.ts`, garde-le et
signale-le plutôt que de le supprimer.)

- [ ] **Étape 4 : vérification**

Run: `npx tsc --noEmit`
Expected : aucune erreur d'import manquant.
Run: `npm run dev` — reparcourir rapidement les écrans Devis, Chantiers, Bibliothèque,
Paramètres pour confirmer qu'aucun écran ne plante.

- [ ] **Étape 5 : commit**

```bash
git add -A
git commit -m "chore: supprime le store Zustand legacy (donnees de demo obsoletes)"
```

---

## Bloc C — Formatage

### Task 10 : Formatage complet du code

**Files:** l'ensemble de `src/` (formatage automatique, pas de changement fonctionnel)

- [ ] **Étape 1 : lancer le formateur**

Run: `npx eslint src --fix`

- [ ] **Étape 2 : vérifier qu'aucun changement fonctionnel ne s'est glissé**

Run: `npx tsc --noEmit`
Run: `git diff --stat` — le diff doit toucher un grand nombre de fichiers mais rester
cosmétique (espaces, guillemets, points-virgules). Si une ligne de logique semble modifiée,
vérifie-la avant de continuer.

- [ ] **Étape 3 : commit dédié**

```bash
git add -A
git commit -m "style: formatage complet du code (npx eslint --fix)"
```

---

## Bloc D — Infrastructure

### Task 11 : Créer le projet Supabase dédié (à faire par Laurian)

**Aucun fichier de code.** Action à effectuer par Laurian dans le dashboard Supabase, guidée
étape par étape en session.

- [ ] **Étape 1 : créer le projet**

Laurian se connecte sur supabase.com avec son compte existant, crée un nouveau projet
(nom suggéré : `chantier-hub-<nom-entreprise>`), choisit une région proche de la France
(`eu-west-3` Paris si disponible, sinon `eu-west-1`), et note l'URL du projet et sa clé
publique (Project Settings → Data API), à mettre dans `.env.local` à l'étape suivante.

- [ ] **Étape 2 : vérification**

Le tableau de bord Supabase du nouveau projet affiche "Project is healthy" et aucune table
n'existe encore dans l'éditeur SQL.

---

### Task 12 : Appliquer les migrations (à faire par Laurian, guidé)

**Files:** `supabase/migrations/*.sql` (déjà corrigés par les tâches précédentes, aucune
modif de code ici)

- [ ] **Étape 1 : appliquer les migrations dans l'ordre**

Deux options, à choisir selon si la CLI Supabase est installée :
- Avec la CLI : `supabase link --project-ref <ref-du-nouveau-projet>` puis `supabase db push`.
- Sans la CLI : ouvrir chaque fichier de `supabase/migrations/` dans l'éditeur SQL du
  dashboard Supabase et l'exécuter un par un, **du plus petit numéro au plus grand** (les
  numéros 024 à 027 sont absents, ce n'est pas une erreur).

- [ ] **Étape 2 : vérification**

Dans l'éditeur de tables du dashboard Supabase, vérifier la présence des tables `entites`
(3 lignes : PRO/EXT/INT), `tva_taux` (4 lignes, taux français après la Task 2), `parametres`,
`categories_tarifaires`, `conditions_paiement`. Vérifier qu'aucune erreur SQL n'a été
signalée pendant l'exécution.

- [ ] **Étape 3 : vérifier les GRANTs (leçon connue du projet devis-artisans)**

Se référer à la note du projet devis-artisans : créer une table active bien la RLS mais ne
donne pas automatiquement les droits de base. Les migrations de Chantier Hub accordent déjà
les GRANTs nécessaires (`grant select/insert/update/delete`) — vérifier dans le fichier
005 qu'ils sont bien présents avant de continuer, plutôt que de découvrir l'erreur
"permission denied" plus tard.

---

### Task 13 : Connecter l'app locale au nouveau projet Supabase

**Files:**
- Modify: `.env.local` (jamais commité, exclu par `.gitignore`)

- [ ] **Étape 1 : renseigner les variables d'environnement**

```bash
cp .env.example .env.local
```

Laurian renseigne `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` avec les valeurs notées à
la Task 11.

- [ ] **Étape 2 : vérification**

Run: `npm run dev`
Ouvrir `http://localhost:5173` (ou le port affiché), vérifier que la page de connexion
s'affiche sans erreur de connexion à Supabase dans la console du navigateur.

---

### Task 14 : Créer le compte Vercel et déployer (à faire par Laurian, guidé)

**Aucun fichier de code.**

- [ ] **Étape 1 : créer le compte Vercel**

Laurian crée un compte sur vercel.com (connexion avec GitHub recommandée si le projet a un
dépôt distant, sinon import direct du dossier local via la CLI Vercel).

- [ ] **Étape 2 : configurer les variables d'environnement sur Vercel**

Dans les Project Settings de Vercel, ajouter `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY` avec les mêmes valeurs que `.env.local`.

- [ ] **Étape 3 : déployer**

`npm run build` doit réussir en local avant de déployer (`vercel deploy` ou déploiement
automatique si connecté à un dépôt Git).

- [ ] **Étape 4 : vérification**

L'URL Vercel affiche la page de connexion de l'application, sans erreur dans la console.

---

## Bloc E — Personnalisation réelle

> Chaque tâche de ce bloc démarre par une question à poser à Laurian : les informations
> réelles de l'entreprise ne sont pas encore connues à l'écriture de ce plan.

### Task 15 : Renseigner l'identité de l'entreprise dans `pdf.ts`

**Files:**
- Modify: `src/lib/pdf.ts:17-46`

- [ ] **Étape 1 : recueillir les informations**

Demander à Laurian : raison sociale, adresse complète, SIRET, IBAN, et téléphone/email/site
par entité (PRO/EXT/INT) s'ils diffèrent.

- [ ] **Étape 2 : remplacer la constante `SOCIETE`**

```typescript
const SOCIETE = {
  rue: '<rue réelle>',
  npaLocalite: '<code postal réel> <ville réelle>',
  adresse: '<rue réelle> — <code postal réel> <ville réelle>',
  siret: '<SIRET réel, format 000 000 000 00000>',
  iban: '<IBAN réel> — <nom de la banque>',
};
```

- [ ] **Étape 3 : remplacer la constante `ENTITE_CONTACT`**

```typescript
const ENTITE_CONTACT: Record<string, { tel: string; email: string; site: string }> = {
  PRO: { tel: '<tél réel>', email: '<email réel>', site: '<site réel ou vide>' },
  EXT: { tel: '<tél réel>', email: '<email réel>', site: '<site réel ou vide>' },
  INT: { tel: '<tél réel>', email: '<email réel>', site: '<site réel ou vide>' },
};
```

- [ ] **Étape 4 : vérification**

Générer un PDF de devis de test (Task 18) et vérifier visuellement que toutes les
informations affichées sont réelles, sans aucune trace de valeur d'exemple.

- [ ] **Étape 5 : commit**

```bash
git add src/lib/pdf.ts
git commit -m "feat: personnalisation des informations reelles de l'entreprise"
```

---

### Task 16 : Logos réels

**Files:**
- Create/Modify: `public/logos/logo-pro.png`, `public/logos/logo-ext.png`, `public/logos/logo-int.png`

- [ ] **Étape 1 : recueillir les fichiers**

Demander à Laurian les fichiers logo (idéalement PNG avec fond transparent, mêmes noms de
fichiers déjà référencés dans `src/routes/devis.$id.tsx:31-34` — si un nom ou une entité
diffère, mettre à jour la constante `LOGOS` en conséquence).

- [ ] **Étape 2 : vérification**

Générer un PDF de devis de test, vérifier que le bon logo apparaît en haut à droite de la
page de garde.

- [ ] **Étape 3 : commit**

```bash
git add public/logos
git commit -m "feat: ajoute les logos reels de l'entreprise"
```

---

### Task 17 : Premier texte de CGV réel

**Files:**
- Modify: `src/lib/cgv.ts`

**Rappel important** : ce texte n'a aucune valeur juridique tant qu'il n'a pas été relu par
un professionnel (comptable, avocat, ou fédération du métier). Il remplace le squelette
suisse par un squelette structurellement équivalent mais en français standard (sans
référence à la Suisse), pas un texte définitif.

- [ ] **Étape 1 : adapter le texte générique**

Dans `src/lib/cgv.ts`, remplacer la fonction `cgvGenerique` (lignes 14-37) en conservant la
même structure d'articles mais en retirant toute référence suisse (numéros IDE, régime AFC)
et en généralisant les clauses au droit français (mentionner le SIRET plutôt que l'IDE dans
l'article 1, la juridiction compétente française dans l'article 11, etc.). Conserver le
paramètre `entite: string` et les exports `CGV_PRO`/`CGV_EXT`/`CGV_INT`/`CGV_PAR_CODE`
inchangés dans leur forme.

- [ ] **Étape 2 : conserver l'avertissement en tête de fichier**

Garder (ou renforcer) le commentaire d'avertissement en tête de fichier (lignes 1-12)
rappelant que ce texte doit être validé par un professionnel avant tout envoi de devis réel.

- [ ] **Étape 3 : vérification**

Générer un PDF de devis de test, vérifier que les CGV s'affichent correctement en fin de
document (pagination automatique déjà gérée par `renderCgv` dans `pdf.ts`, aucune modif
nécessaire de ce côté).

- [ ] **Étape 4 : commit**

```bash
git add src/lib/cgv.ts
git commit -m "feat: premier texte de CGV francais (a faire valider par un professionnel)"
```

---

## Bloc F — Mise en route et validation

### Task 18 : Créer le premier compte admin (à faire par Laurian, guidé)

**Aucun fichier de code.**

- [ ] **Étape 1 : créer l'utilisateur**

Dans le dashboard Supabase → Authentication → Users, Laurian crée un utilisateur avec
l'email de la première personne admin (probablement lui-même ou l'entreprise).

- [ ] **Étape 2 : le passer admin en SQL**

Dans l'éditeur SQL Supabase :
```sql
update profiles set role = 'admin' where id = 'UUID-DE-L-UTILISATEUR';
```
(l'UUID est visible dans la liste des utilisateurs créée à l'étape 1 ; la ligne `profiles`
correspondante est créée automatiquement à la première connexion, via le trigger
`handle_new_user` — si la ligne n'existe pas encore, se connecter une première fois avant
de lancer cette commande).

- [ ] **Étape 3 : vérification**

Se connecter sur l'app déployée avec cet utilisateur, vérifier l'accès à l'écran
Paramètres (réservé aux admins).

---

### Task 19 : Test de bout en bout

**Aucun fichier de code — vérification manuelle finale.**

- [ ] **Étape 1 : créer un devis réel**

En tant qu'admin, créer un client de test avec un nom réaliste, puis un devis avec
plusieurs lignes (au moins une ligne titre, une ligne normale, une ligne à taux de TVA
réduit si l'activité de l'entreprise le justifie).

- [ ] **Étape 2 : générer et vérifier le PDF**

Télécharger le PDF, vérifier : logo correct, raison sociale/adresse/SIRET/IBAN réels, TVA à
20 % par défaut (ou le taux choisi), pas de saut d'arrondi à 0.05 près, CGV françaises en
fin de document.

- [ ] **Étape 3 : vérifier le cloisonnement par rôle et par entité**

Créer un compte conducteur assigné à une seule entité (table `user_entites`, ou depuis
Paramètres → Accès si l'interface le permet) : vérifier qu'il ne voit que les devis/chantiers
de son entité. Créer un compte ouvrier : vérifier qu'il ne voit ni les prix, ni les marges,
ni la bibliothèque, uniquement l'écran de pointage des heures.

- [ ] **Étape 4 : rapport final**

Si tout est conforme, l'application est considérée en production pour l'entreprise
d'origine. Toute anomalie constatée à cette étape est à corriger avant de considérer ce
chantier terminé.

---

## Auto-vérification du plan (spec coverage)

- Bloc 0 de la spec (localisation France) → Tasks 1-4. ✅
- Nettoyage store legacy (spec §3, 6 fichiers identifiés) → Tasks 5-9. ✅
- Formatage (spec §3) → Task 10. ✅
- Infrastructure (spec §1) → Tasks 11-14. ✅
- Personnalisation réelle (spec §2) → Tasks 15-17. ✅
- Mise en route et validation (spec §4) → Tasks 18-19. ✅
- Hors périmètre (IA/OCR, redéployabilité multi-client, validation juridique définitive des
  CGV) → volontairement absents de ce plan, conformément à la spec.
