import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, Chantier, Client, Devis, Prestation, PointageHeure, JourneeOuvrier, FactureFournisseur, ActivityItem, Ouvrier, Role, CategoriePrix, LigneDevis } from './types';
import { makeSeed } from './seed';
import { abregeVille, isoDate } from './format';

interface Store extends AppState {
  upsertChantier: (c: Chantier) => void;
  upsertClient: (c: Client) => void;
  upsertDevis: (d: Devis) => void;
  upsertPrestation: (p: Prestation) => void;
  deletePrestation: (id: string) => void;
  upsertOuvrier: (o: Ouvrier) => void;
  addPointage: (p: PointageHeure) => void;
  deletePointage: (id: string) => void;
  upsertFacture: (f: FactureFournisseur) => void;
  validerFacture: (id: string) => void;
  deleteFacture: (id: string) => void;
  pushActivity: (a: ActivityItem) => void;
  debloquerJournee: (id: string, motif: string) => void;
  setRole: (r: Role) => void;
  setEntite: (id: string | 'all') => void;
  setOuvrier: (id: string) => void;
  setDureeJournee: (min: number) => void;
  setValiditeDevis: (j: number) => void;
  setConditionsDevis: (c: string) => void;
  resetDemo: () => void;
}

const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => {
  const i = arr.findIndex(x => x.id === item.id);
  if (i === -1) return [...arr, item];
  const next = arr.slice();
  next[i] = item;
  return next;
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...makeSeed(),
      upsertChantier: (c) => set(s => ({ chantiers: upsert(s.chantiers, c) })),
      upsertClient: (c) => set(s => ({ clients: upsert(s.clients, c) })),
      upsertDevis: (d) => set(s => ({ devis: upsert(s.devis, d) })),
      upsertPrestation: (p) => set(s => ({ prestations: upsert(s.prestations, p) })),
      deletePrestation: (id) => set(s => ({ prestations: s.prestations.filter(p => p.id !== id) })),
      upsertOuvrier: (o) => set(s => ({ ouvriers: upsert(s.ouvriers, o) })),
      addPointage: (p) => set(s => {
        const pointages = [...s.pointages, p];
        return { pointages, journees: recomputeJournees(pointages, s.journees) };
      }),
      deletePointage: (id) => set(s => {
        const pointages = s.pointages.filter(p => p.id !== id);
        return { pointages, journees: recomputeJournees(pointages, s.journees) };
      }),
      upsertFacture: (f) => set(s => ({ factures: upsert(s.factures, f) })),
      validerFacture: (id) => set(s => ({ factures: s.factures.map(f => f.id === id ? { ...f, statut: 'valide' as const } : f) })),
      deleteFacture: (id) => set(s => ({ factures: s.factures.filter(f => f.id !== id) })),
      pushActivity: (a) => set(s => ({ activity: [a, ...s.activity].slice(0, 50) })),
      debloquerJournee: (id, motif) => set(s => ({
        journees: s.journees.map(j => j.id === id ? { ...j, verrouillee: false, motifDeblocage: motif } : j),
      })),
      setRole: (r) => set({ currentRole: r }),
      setEntite: (id) => set({ currentEntiteId: id }),
      setOuvrier: (id) => set({ currentOuvrierId: id }),
      setDureeJournee: (min) => set({ dureeJourneeMin: min }),
      setValiditeDevis: (j) => set({ validiteDevisJours: j }),
      setConditionsDevis: (c) => set({ conditionsDevis: c }),
      resetDemo: () => set(() => ({ ...makeSeed() })),
    }),
    // v5 : purge le store périmé d'avant la refonte 005 (anciens codes entités
    // MNC/MINT/MEXT) qui cassait le filtre par entité (liste devis/chantiers vide).
    { name: 'chantier-hub-v5', version: 5 }
  )
);

function recomputeJournees(pointages: PointageHeure[], existing: JourneeOuvrier[]): JourneeOuvrier[] {
  const map = new Map<string, JourneeOuvrier>();
  for (const p of pointages) {
    const id = `${p.ouvrierId}_${p.date}`;
    const prev = map.get(id) ?? existing.find(j => j.id === id);
    const totalHeures = (prev?.totalHeures ?? 0);
    map.set(id, {
      id, ouvrierId: p.ouvrierId, date: p.date,
      totalHeures: 0, // recalc below
      complete: false, verrouillee: true,
      motifDeblocage: prev?.motifDeblocage,
    });
  }
  // recalc totals
  for (const j of map.values()) {
    const total = pointages
      .filter(p => p.ouvrierId === j.ouvrierId && p.date === j.date)
      .reduce((s, p) => s + p.heuresTravaillees, 0);
    j.totalHeures = Math.round(total * 100) / 100;
    j.complete = j.totalHeures >= 8.6667;
    j.verrouillee = !j.complete && !j.motifDeblocage;
  }
  return Array.from(map.values());
}

// ===== Helpers exposés =====

export function genererReferenceChantier(entiteCode: string, ville: string, existingRefs: string[]): string {
  const prefix = `${entiteCode}-${abregeVille(ville)}-`;
  const nums = existingRefs
    .filter(r => r.startsWith(prefix))
    .map(r => parseInt(r.slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + String(next).padStart(3, '0');
}

export function resoudrePrixVente(p: Prestation, cat: CategoriePrix): number {
  return cat === 'B2B' ? p.prixB2B : cat === 'prive' ? p.prixPrive : p.prixLuxe;
}

export function calculerTotauxDevis(lignes: LigneDevis[]): { totalHT: number; totalTVA: number; totalTTC: number; coutRevientTotal: number; margePrevisionnelle: number; tauxMarge: number } {
  const totalHT = Math.round(lignes.reduce((s, l) => s + l.totalHT, 0) * 100) / 100;
  const totalTVA = Math.round(lignes.reduce((s, l) => s + l.totalHT * (l.tauxTVA / 100), 0) * 100) / 100;
  const totalTTC = Math.round((totalHT + totalTVA) * 100) / 100;
  const coutRevientTotal = Math.round(lignes.reduce((s, l) => s + l.prixRevientUnitaire * l.quantite, 0) * 100) / 100;
  const margePrevisionnelle = Math.round((totalHT - coutRevientTotal) * 100) / 100;
  const tauxMarge = totalHT > 0 ? Math.round((margePrevisionnelle / totalHT) * 1000) / 10 : 0;
  return { totalHT, totalTVA, totalTTC, coutRevientTotal, margePrevisionnelle, tauxMarge };
}

export function todayIso(): string {
  return isoDate(new Date());
}
