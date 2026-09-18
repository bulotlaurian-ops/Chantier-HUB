# Facturation client (v1) — Plan d'implémentation

> **Pour les exécutants agentiques :** SOUS-SKILL REQUIS : utiliser
> superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans
> pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher
> (`- [ ]`) pour le suivi.

**Objectif :** permettre de générer une facture PDF depuis un devis accepté, avec
numérotation légale et suivi de paiement basique.

**Architecture :** deux nouvelles tables (`factures`, `lignes_facture`) qui copient
l'état d'un devis accepté au moment de la génération (jamais recalculées ensuite), un
nouvel onglet de navigation qui les liste, un bouton "Facturer" sur la fiche devis, et une
extension du générateur PDF existant (`pdf.ts`) plutôt qu'une duplication.

**Tech Stack :** React 19 + TanStack Router/Start (file-based routing), Supabase
(Postgres + RLS), TanStack Query, jsPDF. Pas de framework de test dans ce repo (voir
Contraintes globales).

**Spec :** `docs/superpowers/specs/2026-09-18-facturation-client-design.md`

## Contraintes globales

- Langue de toute l'UI et des commentaires : français, comme le reste du repo.
- Aucune commande `pytest`/`vitest`/`jest` n'existe dans ce projet (vérifié : aucun
  script de test dans `package.json`, aucun fichier `*.test.*`/`*.spec.*`). Chaque tâche
  se vérifie donc avec `npx tsc --noEmit -p tsconfig.json`, `npx eslint <fichier> --fix`,
  et pour la logique pure (PDF), un petit script Node jetable comme ceux déjà utilisés
  dans ce projet pour vérifier `pdf.ts` — pas de suite de tests à créer.
- Les migrations SQL ne peuvent pas être appliquées depuis cette session (pas de CLI
  Supabase lié). C'est Laurian qui les applique lui-même via le SQL Editor du dashboard
  Supabase — décrire précisément quoi coller et quoi vérifier, ne pas supposer que la
  migration est déjà live.
- Toute nouvelle table doit recevoir un `grant select, insert, update, delete on
  <table> to authenticated` explicite : le `grant ... on all tables` de la migration 032
  ne couvre que les tables qui existaient à cette date-là (leçon déjà tirée dans ce repo,
  cf. commentaire de `032_grants_authenticated.sql`).
- `statut_facture` (enum) existe déjà pour `factures_fournisseurs` avec des valeurs
  différentes (`a_valider`/`valide`) — le nouvel enum s'appelle `statut_facture_client`,
  jamais `statut_facture`.
- Une facture émise n'est **jamais supprimable**, y compris par un admin : `factures` et
  `lignes_facture` n'ont pas de policy RLS pour DELETE (absence de policy = refus par
  défaut sous RLS), ce n'est pas qu'une question d'absence de bouton dans l'UI.

---

## Task 1 : Migration SQL — tables, numérotation, RLS

**Files:**
- Create: `supabase/migrations/036_facturation_client.sql`

**Interfaces:**
- Produces : table `factures` (colonnes : `id, numero, devis_id, entite_id, client_id,
  date_emission, date_echeance, statut, date_paiement, total_ht, total_tva, total_ttc,
  arrondi, created_by, created_at`), table `lignes_facture` (colonnes : `id, facture_id,
  ordre, libelle, unite, quantite, prix_unitaire_ht, remise_pct, taux_tva, total_ht,
  est_option, est_titre`), enum `statut_facture_client` (`'emise' | 'payee'`), fonction
  RPC `generer_numero_facture()` retournant `text` (format `FA-2026-001`).

- [ ] **Étape 1 : écrire la migration**

```sql
-- =====================================================================
-- Chantier Hub — 036 : facturation client (v1)
-- =====================================================================
-- Une facture = un devis accepté, montant total (pas d'acompte, pas de facturation
-- partielle en v1 — cf. spec 2026-09-18-facturation-client-design.md). Les lignes sont
-- COPIÉES depuis lignes_devis au moment de la génération : une facture émise est un
-- document légalement figé, elle ne doit plus bouger même si le devis source est
-- modifié après coup (même principe que snapshots_marge). Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Statut de paiement. Nommé statut_facture_client (pas statut_facture, déjà pris
--    par factures_fournisseurs avec des valeurs différentes : a_valider / valide).
-- ---------------------------------------------------------------------
do $$ begin
  create type statut_facture_client as enum ('emise', 'payee');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- B. Numérotation légale : chronologique, sans trou, remise à zéro chaque année civile.
--    Même mécanique que generer_numero_devis (008_numerotation_et_defauts.sql) :
--    compteur atomique via insert ... on conflict ... returning (anti-race).
-- ---------------------------------------------------------------------
create table if not exists compteurs_factures (
  prefixe text primary key,
  dernier int not null default 0
);

create or replace function generer_numero_facture()
returns text language plpgsql set search_path = public as $$
declare p text := to_char(current_date,'YYYY'); n int;
begin
  insert into compteurs_factures(prefixe, dernier) values (p, 1)
  on conflict (prefixe) do update set dernier = compteurs_factures.dernier + 1
  returning dernier into n;
  return 'FA-' || p || '-' || lpad(n::text,3,'0');
end $$;

-- ---------------------------------------------------------------------
-- C. Tables.
-- ---------------------------------------------------------------------
create table if not exists factures (
  id             uuid primary key default gen_random_uuid(),
  numero         text not null unique,
  devis_id       uuid not null unique references devis(id),
  entite_id      uuid not null references entites(id),
  client_id      uuid not null references clients(id),
  date_emission  date not null default current_date,
  date_echeance  date not null,
  statut         statut_facture_client not null default 'emise',
  date_paiement  date,
  total_ht       numeric(14,2) not null,
  total_tva      numeric(14,2) not null,
  total_ttc      numeric(14,2) not null,
  arrondi        numeric(6,2) not null default 0,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create table if not exists lignes_facture (
  id                  uuid primary key default gen_random_uuid(),
  facture_id          uuid not null references factures(id) on delete cascade,
  ordre               int not null default 0,
  libelle             text not null,
  unite               text,
  quantite            numeric(12,2) not null,
  prix_unitaire_ht    numeric(12,2) not null,
  remise_pct          numeric(5,2) not null default 0,
  taux_tva            numeric(5,2) not null,
  total_ht            numeric(14,2) not null,
  est_option          boolean not null default false,
  est_titre           boolean not null default false
);

-- ---------------------------------------------------------------------
-- D. RLS. Même principe que devis (user_a_acces_entite couvre déjà admin/conducteur/
--    ouvrier en un seul appel, cf. 005_refonte_modele.sql). PAS de policy DELETE :
--    sous RLS, une commande sans aucune policy est refusée par défaut, y compris pour
--    un admin — c'est la garantie qu'une facture émise ne peut jamais être supprimée,
--    même par appel direct à l'API, pas seulement par absence de bouton côté UI.
-- ---------------------------------------------------------------------
alter table factures enable row level security;
alter table lignes_facture enable row level security;
alter table compteurs_factures enable row level security;

drop policy if exists factures_select on factures;
create policy factures_select on factures for select to authenticated
  using (user_a_acces_entite(entite_id));

drop policy if exists factures_insert on factures;
create policy factures_insert on factures for insert to authenticated
  with check (user_a_acces_entite(entite_id));

drop policy if exists factures_update on factures;
create policy factures_update on factures for update to authenticated
  using (user_a_acces_entite(entite_id)) with check (user_a_acces_entite(entite_id));

drop policy if exists lignes_facture_select on lignes_facture;
create policy lignes_facture_select on lignes_facture for select to authenticated
  using (exists (select 1 from factures f where f.id = facture_id and user_a_acces_entite(f.entite_id)));

drop policy if exists lignes_facture_insert on lignes_facture;
create policy lignes_facture_insert on lignes_facture for insert to authenticated
  with check (exists (select 1 from factures f where f.id = facture_id and user_a_acces_entite(f.entite_id)));

drop policy if exists compteurs_factures_staff on compteurs_factures;
create policy compteurs_factures_staff on compteurs_factures for all to authenticated
  using (current_role_app() in ('admin','conducteur'))
  with check (current_role_app() in ('admin','conducteur'));

-- ---------------------------------------------------------------------
-- E. GRANT explicite (le grant "on all tables" de la migration 032 ne couvre pas les
--    tables créées après coup — leçon déjà tirée dans ce repo, cf. 032).
-- ---------------------------------------------------------------------
grant select, insert, update, delete on factures, lignes_facture, compteurs_factures to authenticated;
```

- [ ] **Étape 2 : demander à Laurian d'appliquer la migration**

C'est une action base de données réelle sur son projet Supabase — à faire par lui, pas à
sa place. Lui donner ces instructions :

1. Ouvrir le dashboard Supabase du projet → SQL Editor.
2. Coller le contenu de `supabase/migrations/036_facturation_client.sql`.
3. Exécuter (bouton Run).
4. Vérifier avec cette requête (à coller ensuite dans le même éditeur) :

```sql
select
  (select count(*) from information_schema.tables where table_name = 'factures') as t1,
  (select count(*) from information_schema.tables where table_name = 'lignes_facture') as t2,
  (select count(*) from information_schema.tables where table_name = 'compteurs_factures') as t3,
  (select generer_numero_facture()) as premier_numero;
```

Résultat attendu : `t1=1, t2=1, t3=1`, et `premier_numero` de la forme `FA-2026-001`
(l'année réelle au moment du test). Si `premier_numero` n'a pas le suffixe `-001`,
relancer la requête ne redonnera jamais le même numéro (compteur incrémenté à chaque
appel) — c'est normal, ce n'est pas un bug.

- [ ] **Étape 3 : commit**

```bash
git add supabase/migrations/036_facturation_client.sql
git commit -m "feat: migration facturation client (tables, numerotation, RLS)"
```

---

## Task 2 : Types Supabase + hooks de requête

**Files:**
- Modify: `src/lib/database.types.ts`
- Create: `src/lib/queries/factures.ts`

**Interfaces:**
- Consumes : tables `factures`/`lignes_facture` et fonction `generer_numero_facture()`
  de la Task 1 ; `todayIso` (`@/lib/devis-utils`), `addDays` (`@/lib/format`), `supabase`
  (`@/lib/supabase`), `DevisDetail` (`@/lib/queries/devis`).
- Produces : `FactureRow`, `LigneFactureRow`, `FactureEnrichie`, `FactureDetail`,
  `useFacturesList()`, `useFactureParDevis(devisId)`, `useCreateFacture()`,
  `useUpdateFactureStatut()`, `useUpdateFactureEcheance()`,
  `fetchFactureDetail(id): Promise<FactureDetail>`.

- [ ] **Étape 1 : ajouter les types dans `database.types.ts`**

Ce fichier est normalement généré par `supabase gen types typescript`, mais le CLI
Supabase n'est pas lié dans cet environnement — on l'édite à la main, en suivant
exactement le style existant (propriétés triées alphabétiquement dans chaque bloc).

Dans `Tables`, insérer par ordre alphabétique **avant** le bloc `factures_fournisseurs`
(qui commence par `factures_fournisseurs: {` — chercher ce texte pour se repérer) :

```typescript
      factures: {
        Row: {
          arrondi: number;
          client_id: string;
          created_at: string;
          created_by: string | null;
          date_echeance: string;
          date_emission: string;
          date_paiement: string | null;
          devis_id: string;
          entite_id: string;
          id: string;
          numero: string;
          statut: Database["public"]["Enums"]["statut_facture_client"];
          total_ht: number;
          total_ttc: number;
          total_tva: number;
        };
        Insert: {
          arrondi?: number;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          date_echeance: string;
          date_emission?: string;
          date_paiement?: string | null;
          devis_id: string;
          entite_id: string;
          id?: string;
          numero: string;
          statut?: Database["public"]["Enums"]["statut_facture_client"];
          total_ht: number;
          total_ttc: number;
          total_tva: number;
        };
        Update: {
          arrondi?: number;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          date_echeance?: string;
          date_emission?: string;
          date_paiement?: string | null;
          devis_id?: string;
          entite_id?: string;
          id?: string;
          numero?: string;
          statut?: Database["public"]["Enums"]["statut_facture_client"];
          total_ht?: number;
          total_ttc?: number;
          total_tva?: number;
        };
        Relationships: [
          {
            foreignKeyName: "factures_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "factures_devis_id_fkey";
            columns: ["devis_id"];
            isOneToOne: true;
            referencedRelation: "devis";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "factures_entite_id_fkey";
            columns: ["entite_id"];
            isOneToOne: false;
            referencedRelation: "entites";
            referencedColumns: ["id"];
          },
        ];
      };
```

Puis, dans `Tables` toujours, insérer par ordre alphabétique **avant** le bloc
`lignes_devis` (chercher `lignes_devis: {`) :

```typescript
      lignes_facture: {
        Row: {
          est_option: boolean;
          est_titre: boolean;
          facture_id: string;
          id: string;
          libelle: string;
          ordre: number;
          prix_unitaire_ht: number;
          quantite: number;
          remise_pct: number;
          taux_tva: number;
          total_ht: number;
          unite: string | null;
        };
        Insert: {
          est_option?: boolean;
          est_titre?: boolean;
          facture_id: string;
          id?: string;
          libelle: string;
          ordre?: number;
          prix_unitaire_ht: number;
          quantite: number;
          remise_pct?: number;
          taux_tva: number;
          total_ht: number;
          unite?: string | null;
        };
        Update: {
          est_option?: boolean;
          est_titre?: boolean;
          facture_id?: string;
          id?: string;
          libelle?: string;
          ordre?: number;
          prix_unitaire_ht?: number;
          quantite?: number;
          remise_pct?: number;
          taux_tva?: number;
          total_ht?: number;
          unite?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lignes_facture_facture_id_fkey";
            columns: ["facture_id"];
            isOneToOne: false;
            referencedRelation: "factures";
            referencedColumns: ["id"];
          },
        ];
      };
```

Dans `Functions`, insérer par ordre alphabétique avant `facture_visible_conducteur`
(chercher ce texte) :

```typescript
      generer_numero_facture: { Args: never; Returns: string };
```

Dans `Enums`, insérer par ordre alphabétique avant `statut_validation` (juste après la
ligne `statut_facture: "a_valider" | "valide";`) :

```typescript
      statut_facture_client: "emise" | "payee";
```

Dans `export const Constants` en bas de fichier, même bloc `Enums`, même position (juste
après la ligne `statut_facture: ["a_valider", "valide"],`) :

```typescript
      statut_facture_client: ["emise", "payee"],
```

- [ ] **Étape 2 : vérifier que le fichier de types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: aucune erreur (ce fichier n'est encore consommé par rien de nouveau, donc ça
valide juste que le TypeScript est syntaxiquement correct).

- [ ] **Étape 3 : écrire les hooks de requête**

Créer `src/lib/queries/factures.ts` :

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/lib/database.types";
import type { DevisDetail } from "@/lib/queries/devis";
import { todayIso } from "@/lib/devis-utils";
import { addDays } from "@/lib/format";

export type FactureRow = Tables<"factures">;
export type LigneFactureRow = Tables<"lignes_facture">;

export type FactureEnrichie = FactureRow & {
  client: { id: string; nom: string } | null;
  entite: { id: string; nom: string; couleur: string | null; code: string } | null;
};

export type FactureDetail = FactureRow & {
  client: Tables<"clients"> | null;
  entite: Tables<"entites"> | null;
  devis: { numero: string } | null;
  lignes: LigneFactureRow[];
};

const KEY = ["factures"] as const;
const LIST_SELECT = "*, client:clients(id, nom), entite:entites(id, nom, couleur, code)";
const DETAIL_SELECT =
  "*, client:clients(*), entite:entites(*), devis:devis(numero), lignes:lignes_facture(*)";

// Délai par défaut : 30 jours (délai légal par défaut entre professionnels en France
// en l'absence d'accord explicite — conditions_paiement du devis est un texte libre,
// pas un nombre de jours exploitable automatiquement, cf. spec).
const DELAI_ECHEANCE_JOURS = 30;

export function useFacturesList() {
  return useQuery({
    queryKey: [...KEY, "list"],
    queryFn: async (): Promise<FactureEnrichie[]> => {
      const { data, error } = await supabase
        .from("factures")
        .select(LIST_SELECT)
        .order("date_emission", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FactureEnrichie[];
    },
  });
}

// Existe-t-il déjà une facture pour ce devis ? (une facture = un devis, cf. spec —
// sert à masquer le bouton "Facturer" sur la fiche devis si c'est déjà fait.)
export function useFactureParDevis(devisId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "par-devis", devisId],
    queryFn: async (): Promise<FactureRow | null> => {
      const { data, error } = await supabase
        .from("factures")
        .select("*")
        .eq("devis_id", devisId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!devisId,
  });
}

// Fetch imprératif (pas un hook) : utilisé juste avant de générer le PDF depuis la
// liste, où on n'a pas déjà les lignes en mémoire comme sur la fiche devis.
export async function fetchFactureDetail(id: string): Promise<FactureDetail> {
  const { data, error } = await supabase
    .from("factures")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  const f = data as FactureDetail;
  f.lignes = [...(f.lignes ?? [])].sort((a, b) => a.ordre - b.ordre);
  return f;
}

// Crée la facture (+ copie figée des lignes) depuis un devis accepté. Le devis n'est
// jamais modifié par cette opération.
export function useCreateFacture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: DevisDetail): Promise<FactureRow> => {
      const { data: numero, error: e0 } = await supabase.rpc("generer_numero_facture");
      if (e0) throw e0;
      const insert: TablesInsert<"factures"> = {
        numero: numero as string,
        devis_id: src.id,
        entite_id: src.entite_id,
        client_id: src.client_id,
        date_echeance: addDays(todayIso(), DELAI_ECHEANCE_JOURS),
        total_ht: src.total_ht,
        total_tva: src.total_tva,
        total_ttc: src.total_ttc,
        arrondi: src.arrondi,
      };
      const { data: f, error } = await supabase
        .from("factures")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      if (src.lignes.length) {
        const rows = src.lignes.map((l, i) => ({
          facture_id: f.id,
          ordre: i,
          libelle: l.libelle,
          unite: l.unite,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          remise_pct: l.remise_pct,
          taux_tva: l.taux_tva,
          total_ht: l.total_ht,
          est_option: l.est_option,
          est_titre: l.est_titre,
        }));
        const { error: e2 } = await supabase.from("lignes_facture").insert(rows);
        if (e2) throw e2;
      }
      return f;
    },
    onSuccess: (_f, src) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, "par-devis", src.id] });
    },
  });
}

export function useUpdateFactureStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: FactureRow["statut"] }) => {
      const { error } = await supabase
        .from("factures")
        .update({ statut, date_paiement: statut === "payee" ? todayIso() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateFactureEcheance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date_echeance }: { id: string; date_echeance: string }) => {
      const { error } = await supabase.from("factures").update({ date_echeance }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

- [ ] **Étape 4 : vérifier**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/queries/factures.ts src/lib/database.types.ts`
Expected : aucune erreur. Si `tsc` signale un champ manquant/en trop sur les types
`factures`/`lignes_facture`, comparer avec les colonnes exactes de la migration Task 1 —
c'est `database.types.ts` qui doit correspondre à la migration, pas l'inverse.

- [ ] **Étape 5 : commit**

```bash
git add src/lib/database.types.ts src/lib/queries/factures.ts
git commit -m "feat: types et hooks de requete pour la facturation client"
```

---

## Task 3 : Génération PDF de la facture

**Files:**
- Modify: `src/lib/pdf.ts`

**Interfaces:**
- Consumes : `PdfDevisData`, `buildDevisPdf` (existants dans ce même fichier).
- Produces : `PdfDevisData` étendu (4 champs optionnels), `PdfFactureData`,
  `buildFacturePdf(f, logoDataUrl?): jsPDF`, `telechargerFacturePdf(f, logoDataUrl?): void`.

Extension de l'existant plutôt que duplication : `buildDevisPdf` fait ~370 lignes
(pagination, report de cumul, CGV, pied de page) — dupliquer tout ça pour la facture
serait un vrai risque de divergence (un futur ajustement du gabarit devis ne serait pas
répercuté sur la facture). On ajoute 4 champs optionnels à `PdfDevisData`, tous `undefined`
pour les appels devis existants → **zéro changement de comportement pour le devis**.

- [ ] **Étape 1 : étendre `PdfDevisData`**

Chercher ce bloc (fin de l'interface `PdfDevisData`) :

```typescript
  conditions_paiement?: string | null;
  notes?: string | null;
}
```

Le remplacer par :

```typescript
  conditions_paiement?: string | null;
  notes?: string | null;
  // Champs facture uniquement (undefined pour un devis → aucun effet) :
  documentLabel?: string; // "Devis" par défaut, "Facture" pour une facture
  dateEcheance?: string | null; // ajoute une ligne "Échéance" dans l'encart Date/Objet
  devisReference?: string | null; // numéro du devis d'origine, ligne dédiée dans l'encart
  mentionsFacture?: boolean; // ajoute les mentions légales pénalités de retard / 40 €
}
```

- [ ] **Étape 2 : paramétrer le libellé "Devis"/"Facture"**

Chercher (dans `buildDevisPdf`, juste après la déclaration de `c`) :

```typescript
  const c = ENTITE_CONTACT[code];

  // =================== EN-TÊTE (page 1) ===================
```

Remplacer par :

```typescript
  const c = ENTITE_CONTACT[code];
  const label = d.documentLabel ?? "Devis";

  // =================== EN-TÊTE (page 1) ===================
```

Chercher :

```typescript
  doc.text(`Devis ${d.numero}`, w - 14, 22, { align: "right" });
```

Remplacer par :

```typescript
  doc.text(`${label} ${d.numero}`, w - 14, 22, { align: "right" });
```

Chercher (dans la boucle du pied de page, en-tête de suite) :

```typescript
      doc.text(`Devis Nº ${d.numero} — ${dateStr}`, 14, 17.5);
```

Remplacer par :

```typescript
      doc.text(`${label} Nº ${d.numero} — ${dateStr}`, 14, 17.5);
```

- [ ] **Étape 3 : ajouter Échéance et référence devis dans l'encart Date/Objet**

Chercher :

```typescript
  const refRows: [string, string][] = [["Date", formatDateLong(d.date_creation)]];
  if (d.objet?.trim()) refRows.push(["Objet", d.objet.trim()]);
```

Remplacer par :

```typescript
  const refRows: [string, string][] = [["Date", formatDateLong(d.date_creation)]];
  if (d.dateEcheance) refRows.push(["Échéance", formatDateLong(d.dateEcheance)]);
  if (d.devisReference) refRows.push(["Devis d'origine", d.devisReference]);
  if (d.objet?.trim()) refRows.push(["Objet", d.objet.trim()]);
```

- [ ] **Étape 4 : ajouter les mentions légales facture**

Chercher (juste après le bloc Visa, avant la section CGV) :

```typescript
  const mention = doc.splitTextToSize(
    "« Bon pour accord, accepte les conditions générales »",
    boxW3 / 2 - 6,
  ) as string[];
  doc.text(mention, visaX + 3, bx + 12);

  // =================== CGV EN FIN DE DOCUMENT (par entité) ===================
```

Remplacer par :

```typescript
  const mention = doc.splitTextToSize(
    "« Bon pour accord, accepte les conditions générales »",
    boxW3 / 2 - 6,
  ) as string[];
  doc.text(mention, visaX + 3, bx + 12);

  // Mentions légales obligatoires sur une facture française (art. L441-10 du Code de
  // commerce) — n'ont pas lieu d'être sur un devis, donc conditionnées à mentionsFacture.
  if (d.mentionsFacture) {
    let my = bx + boxH3 + 10;
    if (my > h - 30) {
      doc.addPage();
      my = 30;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    const mentionsLegales = doc.splitTextToSize(
      "En cas de retard de paiement, une pénalité égale à trois fois le taux d'intérêt " +
        "légal sera exigible, ainsi qu'une indemnité forfaitaire pour frais de " +
        "recouvrement de 40 €, conformément à l'article L441-10 du Code de commerce.",
      w - 28,
    ) as string[];
    doc.text(mentionsLegales, 14, my);
  }

  // =================== CGV EN FIN DE DOCUMENT (par entité) ===================
```

- [ ] **Étape 5 : ajouter les fonctions publiques facture**

Chercher (toute fin du fichier) :

```typescript
export function telechargerDevisPdf(d: PdfDevisData, logoDataUrl?: string): void {
  buildDevisPdf(d, logoDataUrl).save(`Devis ${d.numero}.pdf`);
}
```

Ajouter juste après :

```typescript

// Une facture réutilise entièrement le gabarit devis (même en-tête, même tableau, même
// pied de page) : le type le confirme (PdfFactureData = PdfDevisData avec les 2 champs
// facture-only rendus obligatoires), documentLabel/mentionsFacture sont forcés ici plutôt
// que laissés à la charge de l'appelant.
export type PdfFactureData = PdfDevisData & {
  dateEcheance: string;
  devisReference: string;
};

export function buildFacturePdf(f: PdfFactureData, logoDataUrl?: string): jsPDF {
  return buildDevisPdf({ ...f, documentLabel: "Facture", mentionsFacture: true }, logoDataUrl);
}

export function telechargerFacturePdf(f: PdfFactureData, logoDataUrl?: string): void {
  buildFacturePdf(f, logoDataUrl).save(`Facture ${f.numero}.pdf`);
}
```

- [ ] **Étape 6 : vérifier avec un script Node jetable**

Ce projet n'a pas de suite de tests — on vérifie avec un script Node autonome, comme déjà
fait pour ce même fichier pendant le développement du logo (jsPDF a un build Node :
`node_modules/jspdf/dist/jspdf.node.js`, pas besoin de canvas ici, juste du texte).

`pdf.ts` importe du TypeScript (`./format`, `./cgv`) que `node` seul ne sait pas
résoudre : exécuter le script avec `npx tsx` (s'installe tout seul à la volée s'il n'est
pas déjà présent) plutôt qu'avec `node` directement.

Créer un fichier temporaire `verif-facture-pdf.mts` à la racine du projet (extension
`.mts` pour que `tsx` le traite comme du TypeScript/ESM) :

```typescript
import { buildFacturePdf, type PdfFactureData } from "./src/lib/pdf.ts";

const data: PdfFactureData = {
  numero: "FA-2026-001",
  date_creation: "2026-09-18",
  dateEcheance: "2026-10-18",
  devisReference: "2609002 / 1",
  objet: "Ravalement façade",
  entite: { nom: "GP RAVALEMENT", code: "PRO", couleur: "#1F2937" },
  client: { nom: "DUBOIS Marie", adresse: "18 rue de Bruxelle", ville: "Trèbes" },
  lignes: [
    {
      libelle: "Échafaudage",
      unite: "m2",
      quantite: 1,
      prix_unitaire_ht: 20,
      remise_pct: 0,
      total_ht: 20,
      est_titre: false,
      est_option: false,
    },
  ],
  total_ht: 20,
  total_tva: 2,
  total_ttc: 22,
  arrondi: 0,
  taux_tva: 10,
  conditions_paiement: "Paiement à 30 jours",
  notes: null,
};

const doc = buildFacturePdf(data);
const out = doc.output("arraybuffer");
const text = doc.output("datauristring"); // juste pour vérifier que ça ne throw pas
console.log("PDF généré,", out.byteLength, "octets");

// Vérifie la présence des mentions clés dans le flux de texte brut du PDF.
const raw = Buffer.from(out).toString("latin1");
for (const attendu of ["Facture FA-2026-001", "Échéance", "Devis d'origine", "40", "L441-10"]) {
  console.log(attendu, "->", raw.includes(attendu) ? "présent" : "MANQUANT");
}
```

Run: `npx tsx verif-facture-pdf.mts`
Expected : `PDF généré, <N> octets` (N > 0) et les 5 lignes de vérification à `présent`
(les caractères accentués comme "Échéance" peuvent apparaître encodés différemment dans
le flux PDF brut — si cette vérification-là échoue mais que les 4 autres passent,
regarder le PDF généré directement plutôt que de considérer que c'est cassé).

Supprimer le script une fois la vérification faite (jetable, ne pas le committer) :

```bash
rm verif-facture-pdf.mts
```

- [ ] **Étape 7 : vérifier lint/types du fichier modifié**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/pdf.ts --fix`
Expected : aucune erreur.

- [ ] **Étape 8 : commit**

```bash
git add src/lib/pdf.ts
git commit -m "feat: generation PDF facture (reutilise le gabarit devis)"
```

---

## Task 4 : Badge de statut facture

**Files:**
- Modify: `src/components/ChantierBadges.tsx`

**Interfaces:**
- Consumes : `todayIso` (`@/lib/devis-utils`), `FactureRow["statut"]`
  (`"emise" | "payee"`, cf. Task 2).
- Produces : `StatutFactureAffiche` (type), `statutFactureAffiche(f)`,
  `StatutFactureChip`.

"En retard" n'existe pas en base (cf. spec : calculé, jamais stocké, pour ne jamais
désynchroniser). Ce composant fait ce calcul une seule fois, à un seul endroit, pour que
la liste des factures et n'importe quel autre écran futur l'affichent pareil.

- [ ] **Étape 1 : ajouter l'import `todayIso`**

Chercher (en tête de fichier) :

```typescript
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
```

Remplacer par :

```typescript
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import { todayIso } from "@/lib/devis-utils";
```

- [ ] **Étape 2 : ajouter le chip, à la fin du fichier**

```typescript

type StatutFactureDB = Tables<"factures">["statut"];
export type StatutFactureAffiche = StatutFactureDB | "en_retard";

// "En retard" n'est jamais stocké en base : calculé ici à partir de l'échéance, pour
// ne jamais avoir à resynchroniser un 3e statut manuel (cf. spec facturation client).
export function statutFactureAffiche(f: {
  statut: StatutFactureDB;
  date_echeance: string;
}): StatutFactureAffiche {
  if (f.statut === "payee") return "payee";
  return f.date_echeance < todayIso() ? "en_retard" : "emise";
}

const STATUT_FACTURE_LABELS: Record<StatutFactureAffiche, { label: string; cls: string }> = {
  emise: { label: "Émise", cls: "bg-info/10 text-info border-info/30" },
  payee: { label: "Payée", cls: "bg-success/10 text-success border-success/40" },
  en_retard: { label: "En retard", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function StatutFactureChip({
  statut,
  date_echeance,
}: {
  statut: StatutFactureDB;
  date_echeance: string;
}) {
  const c = STATUT_FACTURE_LABELS[statutFactureAffiche({ statut, date_echeance })];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}
```

- [ ] **Étape 3 : vérifier**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/components/ChantierBadges.tsx --fix`
Expected : aucune erreur.

- [ ] **Étape 4 : commit**

```bash
git add src/components/ChantierBadges.tsx
git commit -m "feat: badge de statut pour les factures client"
```

---

## Task 5 : Page liste des factures

**Files:**
- Create: `src/routes/factures.index.tsx`

**Interfaces:**
- Consumes : `useFacturesList`, `useUpdateFactureStatut`, `useUpdateFactureEcheance`,
  `fetchFactureDetail`, `FactureEnrichie` (Task 2) ; `StatutFactureChip` (Task 4) ;
  `telechargerFacturePdf`, `PdfFactureData` (Task 3) ; `EntiteChip`
  (`@/components/ChantierBadges`, déjà existant) ; `useEntiteFilter`
  (`@/lib/entite-filter`) ; `useEntites` (`@/lib/queries/entites`) ; `PageHeader`
  (`@/components/Badges`) ; `formatEURShort`, `formatDate` (`@/lib/format`).
- Produces : route `/factures/` (fichier `factures.index.tsx` → TanStack Router génère
  la route automatiquement au démarrage du serveur de dev, pas de fichier à éditer à la
  main pour l'enregistrer).

Modelée sur `src/routes/devis.index.tsx` (cartes mobiles + tableau desktop) pour rester
cohérente avec le reste de l'app plutôt que d'inventer un nouveau pattern.

- [ ] **Étape 1 : écrire la page**

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useEntites } from "@/lib/queries/entites";
import { useEntiteFilter } from "@/lib/entite-filter";
import { PageHeader } from "@/components/Badges";
import { EntiteChip, StatutFactureChip } from "@/components/ChantierBadges";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatEURShort } from "@/lib/format";
import { Search, Loader2, FileDown, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useFacturesList,
  useUpdateFactureStatut,
  useUpdateFactureEcheance,
  fetchFactureDetail,
  type FactureEnrichie,
} from "@/lib/queries/factures";
import { telechargerFacturePdf, type PdfFactureData } from "@/lib/pdf";

export const Route = createFileRoute("/factures/")({ component: FacturesListe });

// Même dance fetch + fetch logo + conversion JPEG que sur la fiche devis (src/routes/
// devis.$id.tsx) : le logo n'est jamais bundlé, toujours re-fetché en JPEG pour
// contourner un décodeur PNG fragile pour jsPDF, cf. urlToDataUrl dans devis.$id.tsx.
// Dupliqué ici car la liste n'a pas d'état de devis en mémoire pour appeler la même
// fonction — même logique, fichier différent.
const LOGOS: Record<string, string> = { PRO: "/logos/logo-pro.png" };

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image invalide (décodage <img> échoué)"));
      el.src = objectUrl;
    });
    const targetW = Math.min(700, img.naturalWidth);
    const targetH = Math.round((img.naturalHeight / img.naturalWidth) * targetW);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function FacturesListe() {
  const { currentEntiteId } = useEntiteFilter();
  const { data: storeEntites = [] } = useEntites();
  const { data: facturesData = [], isLoading, isError, error } = useFacturesList();
  const updateStatut = useUpdateFactureStatut();
  const updateEcheance = useUpdateFactureEcheance();
  const [q, setQ] = useState("");
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const selectedCode =
    currentEntiteId === "all"
      ? "all"
      : (storeEntites.find((e) => e.id === currentEntiteId)?.code ?? "all");

  const factures = useMemo(() => {
    return facturesData
      .filter((f) => selectedCode === "all" || f.entite?.code === selectedCode)
      .filter((f) => {
        if (!q) return true;
        const t = q.toLowerCase();
        return f.numero.toLowerCase().includes(t) || (f.client?.nom ?? "").toLowerCase().includes(t);
      });
  }, [facturesData, selectedCode, q]);

  const telecharger = async (f: FactureEnrichie) => {
    setPdfLoadingId(f.id);
    try {
      const detail = await fetchFactureDetail(f.id);
      const code = detail.entite?.code ?? "";
      const logoUrl = LOGOS[code];
      const logo = logoUrl
        ? await urlToDataUrl(logoUrl).catch((e) => {
            console.error("[pdf] logo non converti :", e);
            return undefined;
          })
        : undefined;
      const tauxAffiche =
        detail.total_ht > 0
          ? Math.round((detail.total_tva / detail.total_ht) * 1000) / 10
          : (detail.lignes[0]?.taux_tva ?? 20);
      const data: PdfFactureData = {
        numero: detail.numero,
        date_creation: detail.date_emission,
        dateEcheance: detail.date_echeance,
        devisReference: detail.devis?.numero ?? "",
        objet: null,
        entite: {
          nom: detail.entite?.nom ?? "",
          code,
          couleur: detail.entite?.couleur ?? "#1F2937",
        },
        client: {
          nom: detail.client?.nom ?? "",
          adresse: detail.client?.adresse,
          ville: detail.client?.ville,
          telephone: detail.client?.telephone,
          email: detail.client?.email,
        },
        lignes: detail.lignes.map((l) => ({
          libelle: l.libelle,
          unite: l.unite,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          remise_pct: l.remise_pct,
          total_ht: l.total_ht,
          est_titre: l.est_titre,
          est_option: l.est_option,
        })),
        total_ht: detail.total_ht,
        total_tva: detail.total_tva,
        total_ttc: detail.total_ttc,
        arrondi: detail.arrondi,
        taux_tva: tauxAffiche,
        conditions_paiement: null,
        notes: null,
      };
      telechargerFacturePdf(data, logo);
    } catch (e) {
      toast.error("Téléchargement impossible : " + (e as Error).message);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const basculerPayee = (f: FactureEnrichie) => {
    const next = f.statut === "payee" ? "emise" : "payee";
    updateStatut.mutate(
      { id: f.id, statut: next },
      {
        onSuccess: () =>
          toast.success(next === "payee" ? "Facture marquée payée" : "Facture repassée en émise"),
      },
    );
  };

  // Échéance éditable directement dans la liste (cf. spec : 30 jours par défaut à la
  // création, mais modifiable au cas par cas puisque conditions_paiement est un texte
  // libre non exploitable automatiquement).
  const changerEcheance = (f: FactureEnrichie, dateEcheance: string) => {
    if (!dateEcheance || dateEcheance === f.date_echeance) return;
    updateEcheance.mutate(
      { id: f.id, date_echeance: dateEcheance },
      { onSuccess: () => toast.success("Échéance mise à jour") },
    );
  };

  return (
    <div>
      <PageHeader title="Facture" subtitle={`${factures.length} facture(s)`} />

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher numéro ou client"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 md:overflow-x-auto">
          {/* Cartes mobiles */}
          <div className="md:hidden divide-y">
            {isLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="py-10 text-center text-destructive text-sm">Erreur de chargement.</div>
            ) : factures.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Aucune facture.</div>
            ) : (
              factures.map((f) => (
                <div key={f.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-primary">{f.numero}</span>
                    <StatutFactureChip statut={f.statut} date_echeance={f.date_echeance} />
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">{f.client?.nom}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <EntiteChip entite={f.entite} />
                    <span className="num-tabular font-semibold">{formatEURShort(f.total_ttc)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      Échéance
                      <input
                        type="date"
                        value={f.date_echeance}
                        onChange={(e) => changerEcheance(f, e.target.value)}
                        className="bg-transparent border-b border-dashed border-muted-foreground/40 text-xs text-foreground"
                      />
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => basculerPayee(f)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        title={f.statut === "payee" ? "Repasser en émise" : "Marquer payée"}
                      >
                        <CircleCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => telecharger(f)}
                        disabled={pdfLoadingId === f.id}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        title="Télécharger le PDF"
                      >
                        {pdfLoadingId === f.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Tableau desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Numéro</th>
                <th className="text-left px-4 py-3 font-medium">Entité</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-right px-4 py-3 font-medium">TTC</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Échéance</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
                  </td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-destructive">
                    Erreur de chargement : {(error as Error)?.message}
                  </td>
                </tr>
              )}
              {!isLoading && !isError && factures.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    Aucune facture.
                  </td>
                </tr>
              )}
              {factures.map((f) => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-primary">{f.numero}</td>
                  <td className="px-4 py-3">
                    <EntiteChip entite={f.entite} />
                  </td>
                  <td className="px-4 py-3">{f.client?.nom}</td>
                  <td className="px-4 py-3 text-right num-tabular">{formatEURShort(f.total_ttc)}</td>
                  <td className="px-4 py-3">
                    <StatutFactureChip statut={f.statut} date_echeance={f.date_echeance} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    <input
                      type="date"
                      value={f.date_echeance}
                      onChange={(e) => changerEcheance(f, e.target.value)}
                      className="bg-transparent border-b border-dashed border-muted-foreground/40 text-xs text-foreground"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => basculerPayee(f)}>
                        {f.statut === "payee" ? "Repasser en émise" : "Marquer payée"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => telecharger(f)}
                        disabled={pdfLoadingId === f.id}
                      >
                        {pdfLoadingId === f.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Étape 2 : vérifier**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/routes/factures.index.tsx --fix`
Expected : aucune erreur.

- [ ] **Étape 3 : commit**

```bash
git add src/routes/factures.index.tsx
git commit -m "feat: page liste des factures client"
```

---

## Task 6 : Navigation — renommage + nouvel onglet

**Files:**
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/components/MobileTopBar.tsx`

**Interfaces:**
- Consumes : icône `FileCheck2` (`lucide-react`, déjà vérifiée présente dans la version
  installée).

- [ ] **Étape 1 : `AppSidebar.tsx` — import de l'icône**

Chercher :

```typescript
import {
  LayoutDashboard,
  FileText,
  Hammer,
  Library,
  Settings,
  Clock,
  Users,
  Receipt,
  LogOut,
  BookOpen,
} from "lucide-react";
```

Remplacer par :

```typescript
import {
  LayoutDashboard,
  FileText,
  Hammer,
  Library,
  Settings,
  Clock,
  Users,
  Receipt,
  FileCheck2,
  LogOut,
  BookOpen,
} from "lucide-react";
```

- [ ] **Étape 2 : renommer + ajouter l'item de menu**

Chercher :

```typescript
const ADMIN_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/devis", label: "Devis", icon: FileText },
  { to: "/chantiers", label: "Chantiers", icon: Hammer },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/heures", label: "Suivi des heures", icon: Clock },
  { to: "/factures-fournisseurs", label: "Factures fourn.", icon: Receipt },
  { to: "/bibliotheque", label: "Bibliothèque", icon: Library },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];
```

Remplacer par :

```typescript
const ADMIN_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/devis", label: "Devis", icon: FileText },
  { to: "/chantiers", label: "Chantiers", icon: Hammer },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/heures", label: "Suivi des heures", icon: Clock },
  { to: "/factures", label: "Facture", icon: FileCheck2 },
  { to: "/factures-fournisseurs", label: "Suivi facturation", icon: Receipt },
  { to: "/bibliotheque", label: "Bibliothèque", icon: Library },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];
```

(Les deux items facturation restent côte à côte dans le menu — c'est délibéré, ce sont
les deux écrans liés à l'argent qui entre/sort.)

- [ ] **Étape 3 : `MobileTopBar.tsx` — mettre à jour les titres de page**

Chercher :

```typescript
const TITRES: { prefix: string; label: string }[] = [
  { prefix: "/devis", label: "Devis" },
  { prefix: "/chantiers", label: "Chantiers" },
  { prefix: "/clients", label: "Clients" },
  { prefix: "/heures", label: "Heures" },
  { prefix: "/factures-fournisseurs", label: "Factures" },
  { prefix: "/bibliotheque", label: "Bibliothèque" },
  { prefix: "/parametres", label: "Paramètres" },
];
```

Remplacer par :

```typescript
const TITRES: { prefix: string; label: string }[] = [
  { prefix: "/devis", label: "Devis" },
  { prefix: "/chantiers", label: "Chantiers" },
  { prefix: "/clients", label: "Clients" },
  { prefix: "/heures", label: "Heures" },
  { prefix: "/factures", label: "Facture" },
  { prefix: "/factures-fournisseurs", label: "Suivi facturation" },
  { prefix: "/bibliotheque", label: "Bibliothèque" },
  { prefix: "/parametres", label: "Paramètres" },
];
```

(`/factures` est placé avant `/factures-fournisseurs` dans cette liste : `titrePage`
teste `path.startsWith(prefix + "/")`, et "/factures-fournisseurs" ne commence jamais par
"/factures/" — donc l'ordre n'a pas d'incidence sur la correction, mais les deux entrées
`/factures*` restent groupées visuellement dans le fichier.)

- [ ] **Étape 4 : vérifier**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/components/AppSidebar.tsx src/components/MobileTopBar.tsx --fix`
Expected : aucune erreur.

- [ ] **Étape 5 : vérification manuelle dans le navigateur**

Lancer `npm run dev`, ouvrir `http://localhost:3000`, se connecter en admin. Vérifier :
- Le menu (desktop et mobile via le hamburger) affiche "Facture" et "Suivi facturation"
  comme deux entrées séparées.
- Cliquer "Facture" ouvre `/factures` (page vide pour l'instant : "Aucune facture", pas
  d'erreur de compilation ni de crash).
- Cliquer "Suivi facturation" ouvre l'écran factures fournisseurs, contenu inchangé.

- [ ] **Étape 6 : commit**

```bash
git add src/components/AppSidebar.tsx src/components/MobileTopBar.tsx
git commit -m "feat: renomme factures fournisseurs et ajoute l'onglet Facture"
```

---

## Task 7 : Bouton "Facturer" sur la fiche devis

**Files:**
- Modify: `src/routes/devis.$id.tsx`

**Interfaces:**
- Consumes : `useCreateFacture`, `useFactureParDevis` (Task 2) ; `telechargerFacturePdf`,
  `PdfFactureData` (Task 3).

Refactor ciblé au passage : `genererPdf` construit déjà tout le mapping
entité/client/lignes + résolution du logo. La nouvelle action "Facturer" a besoin
exactement du même mapping (seuls le numéro, la date et 2 champs facture-only changent) —
on l'extrait dans une fonction partagée plutôt que de copier-coller le bloc une seconde
fois dans le même fichier.

- [ ] **Étape 1 : import des icônes et hooks**

Chercher :

```typescript
import {
  ArrowLeft,
  Loader2,
  FileDown,
  Trash2,
  Archive,
  RotateCcw,
  Pencil,
  Copy,
  Layers,
} from "lucide-react";
```

Remplacer par :

```typescript
import {
  ArrowLeft,
  Loader2,
  FileDown,
  Trash2,
  Archive,
  RotateCcw,
  Pencil,
  Copy,
  Layers,
  Receipt,
} from "lucide-react";
```

Chercher :

```typescript
import { telechargerDevisPdf } from "@/lib/pdf";
```

Remplacer par :

```typescript
import { telechargerDevisPdf, telechargerFacturePdf, type PdfFactureData } from "@/lib/pdf";
import { useCreateFacture, useFactureParDevis } from "@/lib/queries/factures";
```

(Pas besoin d'importer `Link` : la ligne 1 de ce fichier l'importe déjà depuis
`@tanstack/react-router` — `import { createFileRoute, Link, useNavigate } from
"@tanstack/react-router";` — réutilisé tel quel à l'étape 4.)

- [ ] **Étape 2 : ajouter les hooks AVANT les retours conditionnels du composant**

`useCreateFacture`/`useFactureParDevis` sont des hooks (pas de simples fonctions comme
`genererPdf`) : les placer après `if (isLoading) return` / `if (!d) return` violerait les
Rules of Hooks (nombre de hooks différent selon que le devis est déjà chargé ou non — React
plante ou avertit dès qu'un devis met un instant à charger). Ils doivent rejoindre les
autres hooks du composant, au même niveau, avant les retours anticipés.

Chercher :

```typescript
  const version = useCreateVersionDevis();
  const { data: versions = [] } = useVersionsDevis(d?.numero);
  const nav = useNavigate();
  const [pdfLoading, setPdfLoading] = useState(false);

  if (isLoading)
```

Remplacer par :

```typescript
  const version = useCreateVersionDevis();
  const { data: versions = [] } = useVersionsDevis(d?.numero);
  const nav = useNavigate();
  const [pdfLoading, setPdfLoading] = useState(false);
  const facturer = useCreateFacture();
  const { data: factureExistante } = useFactureParDevis(d?.id);

  if (isLoading)
```

- [ ] **Étape 3 : extraire le mapping commun devis→PDF et ajouter `facturerDevis`**

Chercher (à l'intérieur de `DevisDetail`, juste avant `const genererPdf = async () => {`) :

```typescript
  const genererPdf = async () => {
    setPdfLoading(true);
    try {
      const code = d.entite?.code ?? "";
      const logoUrl = LOGOS[code];
      const logo = logoUrl
        ? await urlToDataUrl(logoUrl).catch((e) => {
            console.error("[pdf] logo non converti :", e);
            return undefined;
          })
        : undefined;
      // Taux TVA affiché = taux effectif dérivé des totaux (jamais codé en dur, §7)
      const tauxAffiche =
        d.total_ht > 0
          ? Math.round((d.total_tva / d.total_ht) * 1000) / 10
          : (d.lignes[0]?.taux_tva ?? 20);
      telechargerDevisPdf(
        {
          numero: d.numero,
          date_creation: d.date_creation,
          objet: d.objet,
          entite: { nom: d.entite?.nom ?? "", code, couleur: d.entite?.couleur ?? "#1F2937" },
          client: {
            nom: d.client?.nom ?? "",
            adresse: d.client?.adresse,
            ville: d.client?.ville,
            telephone: d.client?.telephone,
            email: d.client?.email,
          },
          lignes: d.lignes.map((l) => ({
            libelle: l.libelle,
            unite: l.unite,
            quantite: l.quantite,
            prix_unitaire_ht: l.prix_unitaire_ht,
            remise_pct: l.remise_pct,
            total_ht: l.total_ht,
            est_titre: l.est_titre,
            est_option: l.est_option,
          })),
          total_ht: d.total_ht,
          total_tva: d.total_tva,
          total_ttc: d.total_ttc,
          arrondi: d.arrondi,
          taux_tva: tauxAffiche,
          conditions_paiement: d.conditions_paiement,
          notes: d.notes,
        },
        logo,
      );
    } catch (e) {
      toast.error("Génération PDF impossible : " + (e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };
```

Remplacer par :

```typescript
  // Mapping DevisDetail → champs communs devis/facture (numéro, date, échéance,
  // référence devis d'origine EXCLUS : propres à chaque appelant). Partagé par
  // genererPdf et facturerDevis pour ne pas dupliquer la résolution du logo.
  const donneesPdfCommunes = async () => {
    const code = d.entite?.code ?? "";
    const logoUrl = LOGOS[code];
    const logo = logoUrl
      ? await urlToDataUrl(logoUrl).catch((e) => {
          console.error("[pdf] logo non converti :", e);
          return undefined;
        })
      : undefined;
    const tauxAffiche =
      d.total_ht > 0
        ? Math.round((d.total_tva / d.total_ht) * 1000) / 10
        : (d.lignes[0]?.taux_tva ?? 20);
    return {
      logo,
      entite: { nom: d.entite?.nom ?? "", code, couleur: d.entite?.couleur ?? "#1F2937" },
      client: {
        nom: d.client?.nom ?? "",
        adresse: d.client?.adresse,
        ville: d.client?.ville,
        telephone: d.client?.telephone,
        email: d.client?.email,
      },
      lignes: d.lignes.map((l) => ({
        libelle: l.libelle,
        unite: l.unite,
        quantite: l.quantite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        remise_pct: l.remise_pct,
        total_ht: l.total_ht,
        est_titre: l.est_titre,
        est_option: l.est_option,
      })),
      total_ht: d.total_ht,
      total_tva: d.total_tva,
      total_ttc: d.total_ttc,
      arrondi: d.arrondi,
      taux_tva: tauxAffiche,
    };
  };

  const genererPdf = async () => {
    setPdfLoading(true);
    try {
      const { logo, ...commun } = await donneesPdfCommunes();
      telechargerDevisPdf(
        {
          ...commun,
          numero: d.numero,
          date_creation: d.date_creation,
          objet: d.objet,
          conditions_paiement: d.conditions_paiement,
          notes: d.notes,
        },
        logo,
      );
    } catch (e) {
      toast.error("Génération PDF impossible : " + (e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  const facturerDevis = async () => {
    setPdfLoading(true);
    try {
      const f = await facturer.mutateAsync(d);
      const { logo, ...commun } = await donneesPdfCommunes();
      const data: PdfFactureData = {
        ...commun,
        numero: f.numero,
        date_creation: f.date_emission,
        objet: d.objet,
        conditions_paiement: d.conditions_paiement,
        notes: d.notes,
        dateEcheance: f.date_echeance,
        devisReference: d.numero,
      };
      telechargerFacturePdf(data, logo);
      toast.success(`Facture ${f.numero} créée`);
    } catch (e) {
      toast.error("Facturation impossible : " + (e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };
```

- [ ] **Étape 4 : ajouter le bouton dans la barre d'actions**

Chercher :

```typescript
            <Button variant="outline" onClick={genererPdf} disabled={pdfLoading}>
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-1" />
              )}
              Télécharger le PDF
            </Button>
```

Remplacer par :

```typescript
            <Button variant="outline" onClick={genererPdf} disabled={pdfLoading}>
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-1" />
              )}
              Télécharger le PDF
            </Button>
            {!archived && d.statut === "accepte" && !factureExistante && (
              <Button
                variant="outline"
                onClick={facturerDevis}
                disabled={pdfLoading || facturer.isPending}
              >
                {facturer.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Receipt className="w-4 h-4 mr-1" />
                )}
                Facturer
              </Button>
            )}
            {factureExistante && (
              <Link
                to="/factures"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline self-center"
              >
                Facture {factureExistante.numero} déjà émise
              </Link>
            )}
```

- [ ] **Étape 5 : vérifier**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/routes/devis.\$id.tsx --fix`
Expected : aucune erreur.

- [ ] **Étape 6 : vérification manuelle de bout en bout**

Avec `npm run dev` lancé (migration Task 1 déjà appliquée côté Supabase — sans ça, cette
étape échouera à l'insertion) :

1. Ouvrir un devis existant, passer son statut à "Accepté" si besoin.
2. Le bouton "Facturer" apparaît à côté de "Télécharger le PDF".
3. Cliquer dessus : un toast "Facture FA-2026-00N créée" apparaît, le PDF se télécharge.
4. Ouvrir le PDF téléchargé : titre "Facture FA-2026-00N", ligne "Échéance" et "Devis
   d'origine" présentes dans l'encart, mentions légales pénalités de retard visibles en
   bas de la dernière page de contenu.
5. Recharger la page devis : le bouton "Facturer" a disparu, remplacé par le lien
   "Facture FA-2026-00N déjà émise".
6. Aller sur `/factures` : la facture apparaît dans la liste, avec le bon montant et le
   statut "Émise". Cliquer "Marquer payée" : le statut passe à "Payée" (badge vert).
7. Retélécharger le PDF depuis la liste (bouton de la ligne) : même contenu qu'à
   l'étape 4.

Si l'étape 3 échoue avec une erreur RLS/403 : vérifier que la migration Task 1 a bien été
appliquée (revoir l'étape 2 de la Task 1) avant de chercher un bug côté code.

- [ ] **Étape 7 : commit**

```bash
git add src/routes/devis.\$id.tsx
git commit -m "feat: bouton Facturer sur la fiche devis"
```

---

## Récapitulatif des fichiers touchés

| Fichier | Nature |
|---|---|
| `supabase/migrations/036_facturation_client.sql` | nouveau |
| `src/lib/database.types.ts` | modifié (types générés à la main) |
| `src/lib/queries/factures.ts` | nouveau |
| `src/lib/pdf.ts` | modifié (extension, pas de duplication) |
| `src/components/ChantierBadges.tsx` | modifié |
| `src/routes/factures.index.tsx` | nouveau |
| `src/components/AppSidebar.tsx` | modifié |
| `src/components/MobileTopBar.tsx` | modifié |
| `src/routes/devis.$id.tsx` | modifié |

Hors périmètre (cf. spec) : facturation partielle, saisie de facture indépendante d'un
devis, suivi de règlement partiel, avoir/annulation, relances automatiques.
