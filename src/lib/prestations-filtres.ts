import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Prestation } from "@/lib/queries/prestations";

// =====================================================================
// Filtrage partagé de la bibliothèque (page Bibliothèque + sélecteur devis).
// 100 % client-side : la liste est déjà chargée et bornée par la RLS.
// Convention : un Set de filtre VIDE = aucune contrainte (« toutes »).
// =====================================================================

export const SANS_FAMILLE = "— Sans famille";
export const FOURNISSEUR_INTERNE = "Interne"; // libellé des prestations à fournisseur NULL
export const ENTITES = ["PRO"] as const;

export interface FiltresPrestation {
  q: string;
  entites: Set<string>;
  fournisseurs: Set<string>;
  familles: Set<string>;
}

export interface OptionsFiltres {
  entites: string[]; // les 3 entités (fixe)
  fournisseurs: string[]; // distincts en base, NULL → "Interne"
  familles: string[]; // distinctes en base, NULL → "— Sans famille"
}

// Clés de regroupement null-safe
const familleKey = (p: Prestation) => p.famille ?? SANS_FAMILLE;
const fournisseurKey = (p: Prestation) => p.fournisseur ?? FOURNISSEUR_INTERNE;

const sortFr = (a: string, b: string) => a.localeCompare(b, "fr");

// Options dynamiques (fournisseurs / familles distinctes), entités fixes.
export function optionsFiltres(prestations: Prestation[]): OptionsFiltres {
  const fournSet = new Set<string>();
  const famSet = new Set<string>();
  for (const p of prestations) {
    fournSet.add(fournisseurKey(p));
    famSet.add(familleKey(p));
  }
  const familles = Array.from(famSet).sort((a, b) =>
    a === SANS_FAMILLE ? 1 : b === SANS_FAMILLE ? -1 : sortFr(a, b),
  );
  const fournisseurs = Array.from(fournSet).sort((a, b) =>
    a === FOURNISSEUR_INTERNE ? 1 : b === FOURNISSEUR_INTERNE ? -1 : sortFr(a, b),
  );
  return { entites: [...ENTITES], fournisseurs, familles };
}

// ET logique entre critères. Set vide = pas de contrainte.
// Les lignes à entité NULL sont masquées dès qu'un sous-ensemble d'entités est sélectionné.
export function filtrerPrestations(list: Prestation[], f: FiltresPrestation): Prestation[] {
  const q = f.q.trim().toLowerCase();
  return list.filter((p) => {
    if (f.entites.size && !(p.entite != null && f.entites.has(p.entite))) return false;
    if (f.fournisseurs.size && !f.fournisseurs.has(fournisseurKey(p))) return false;
    if (f.familles.size && !f.familles.has(familleKey(p))) return false;
    if (q) {
      const hay = `${p.libelle} ${p.code ?? ""} ${p.code_cfc ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Regroupe par famille, tri alpha, « Sans famille » en dernier.
// L'ordre des lignes dans chaque groupe = ordre d'entrée (déjà trié par libellé en amont).
export function grouperParFamille(list: Prestation[]): [string, Prestation[]][] {
  const m = new Map<string, Prestation[]>();
  for (const p of list) {
    const k = familleKey(p);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  return Array.from(m.entries()).sort((a, b) =>
    a[0] === SANS_FAMILLE ? 1 : b[0] === SANS_FAMILLE ? -1 : sortFr(a[0], b[0]),
  );
}

const mkToggle = (setter: Dispatch<SetStateAction<Set<string>>>) => (val: string) =>
  setter((prev) => {
    const n = new Set(prev);
    if (n.has(val)) n.delete(val);
    else n.add(val);
    return n;
  });

// Hook d'état des filtres, partagé par les 2 écrans.
//   entitePreselection : pré-coche une entité (entité du devis courant) — débrayable.
export function useFiltresPrestation(
  prestations: Prestation[],
  opts?: { entitePreselection?: string | null },
) {
  const pre = opts?.entitePreselection ?? null;
  const [q, setQ] = useState("");
  const [entites, setEntites] = useState<Set<string>>(() => (pre ? new Set([pre]) : new Set()));
  const [fournisseurs, setFournisseurs] = useState<Set<string>>(new Set());
  const [familles, setFamilles] = useState<Set<string>>(new Set());

  // Re-cale le filtre entité si la présélection change (ex. entité du devis modifiée).
  const preRef = useRef(pre);
  useEffect(() => {
    if (preRef.current !== pre) {
      preRef.current = pre;
      setEntites(pre ? new Set([pre]) : new Set());
    }
  }, [pre]);

  const filtres: FiltresPrestation = { q, entites, fournisseurs, familles };
  const options = useMemo(() => optionsFiltres(prestations), [prestations]);

  const reset = () => {
    setQ("");
    setEntites(pre ? new Set([pre]) : new Set());
    setFournisseurs(new Set());
    setFamilles(new Set());
  };

  const actif = q.trim() !== "" || entites.size > 0 || fournisseurs.size > 0 || familles.size > 0;

  return {
    filtres,
    options,
    setQ,
    toggleEntite: mkToggle(setEntites),
    toggleFournisseur: mkToggle(setFournisseurs),
    toggleFamille: mkToggle(setFamilles),
    reset,
    actif,
    appliquer: (list: Prestation[]) => filtrerPrestations(list, filtres),
  };
}
