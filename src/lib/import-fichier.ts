import * as XLSX from 'xlsx';
import type { Tables } from '@/lib/database.types';
import type { LigneDevisST } from '@/lib/devis-ia';

// =====================================================================
// Import de fichiers fournisseurs (PDF → OCR n8n ; Excel → parsing local).
// Le parsing Excel produit le MÊME format intermédiaire que l'OCR PDF
// (ParsedRow), ce qui laisse le pipeline aval (preview, insertion) inchangé.
// =====================================================================

export type TypeFichier = 'pdf' | 'excel' | 'inconnu';

export function detecterType(file: File): TypeFichier {
  const n = (file.name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'excel';
  const m = (file.type || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('ms-excel')) return 'excel';
  return 'inconnu';
}

export function fichierVersBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(file);
  });
}

// ------------------------------------------------------------------ Unités
type Unite = Tables<'prestations'>['unite'];
const UNITE_ENUM: Unite[] = ['m2', 'ml', 'pce', 'u', 'fft', 'h', 'forfait'];
const UNITE_MAP: Record<string, Unite> = {
  m2: 'm2', 'm²': 'm2', 'm^2': 'm2',
  ml: 'ml', m: 'ml', 'mètre': 'ml', metre: 'ml',
  pce: 'pce', 'pièce': 'pce', piece: 'pce', pcs: 'pce', pc: 'pce',
  u: 'u', 'unité': 'u', unite: 'u', un: 'u', 'u.': 'u',
  fft: 'fft', ft: 'fft', forfait: 'forfait', forf: 'forfait',
  h: 'h', heure: 'h', hr: 'h',
  l: 'u', litre: 'u', kg: 'u', pot: 'u', sac: 'u', rouleau: 'u', lot: 'u',
};
export function normUnite(u: string | null | undefined): Unite {
  const k = (u ?? '').trim().toLowerCase();
  if (!k) return 'u';
  if ((UNITE_ENUM as string[]).includes(k)) return k as Unite;
  return UNITE_MAP[k] ?? 'u';
}

// ------------------------------------------------------------------ Format intermédiaire
export interface ParsedRow {
  libelle: string;
  unite: string | null;
  quantite: number | null;
  prix_unitaire: number | null;
  total: number | null;
  famille: string | null;
}

// Nombre robuste : gère « 1'234.50 » (CH), « 1 234,50 » (FR), « CHF 90.- », etc.
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,'\- ]/g, '').replace(/'/g, '').replace(/\s/g, '');
  if (!s || s === '-') return null;
  const hasC = s.includes(','), hasD = s.includes('.');
  if (hasC && hasD) {
    // le dernier séparateur est le décimal ; l'autre = milliers
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasC) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const sansAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Mots-clés d'en-tête, du plus spécifique au plus générique.
const KEYS: Record<keyof Omit<ParsedRow, never>, string[]> = {
  libelle: ['designation', 'désignation', 'libelle', 'libellé', 'article', 'description', 'prestation', 'produit', 'fourniture'],
  prix_unitaire: ['prix unitaire', 'prix u', 'p.u', 'pu ht', 'pu', 'prix ht', "prix d'achat", 'prix achat', 'prix net', 'tarif', 'prix'],
  total: ['total ht', 'montant ht', 'montant', 'total', 'sous-total'],
  quantite: ['quantite', 'quantité', 'qte', 'qté', 'qty', 'nbre', 'nb'],
  unite: ['unite', 'unité', 'un.', 'un'],
  famille: ['famille', 'categorie', 'catégorie', 'rubrique', 'chapitre', 'groupe'],
};

type ColMap = Partial<Record<keyof ParsedRow, number>>;

function mapperColonnes(cells: string[]): ColMap {
  const map: ColMap = {};
  (Object.keys(KEYS) as (keyof ParsedRow)[]).forEach((champ) => {
    for (const kw of KEYS[champ]) {
      const idx = cells.findIndex((c, i) =>
        !Object.values(map).includes(i) && (c === kw || c.includes(kw)));
      if (idx >= 0) { map[champ] = idx; break; }
    }
  });
  return map;
}

function parseFeuille(ws: XLSX.WorkSheet): ParsedRow[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
  // Détecte la ligne d'en-tête : libellé + (prix unitaire ou total) reconnus.
  let hdr = -1; let map: ColMap = {};
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const cells = (aoa[i] ?? []).map((c) => sansAccents(String(c ?? '')));
    const m = mapperColonnes(cells);
    if (m.libelle != null && (m.prix_unitaire != null || m.total != null)) { hdr = i; map = m; break; }
  }
  // Repli positionnel : 1re colonne = libellé, dernière colonne numérique = prix.
  if (hdr < 0) {
    const first = aoa.findIndex((r) => (r ?? []).some((c) => String(c ?? '').trim()));
    if (first < 0) return [];
    map = { libelle: 0 };
    hdr = first - 1;
  }

  const out: ParsedRow[] = [];
  for (let i = hdr + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const libelle = String(r[map.libelle ?? 0] ?? '').trim();
    if (!libelle) continue;
    if (/^(total|sous[- ]?total|montant)\b/i.test(libelle)) continue; // lignes de total
    const quantite = map.quantite != null ? toNum(r[map.quantite]) : null;
    const total = map.total != null ? toNum(r[map.total]) : null;
    let prix_unitaire = map.prix_unitaire != null ? toNum(r[map.prix_unitaire]) : null;
    if (prix_unitaire == null && total != null) prix_unitaire = quantite ? total / quantite : total;
    if (prix_unitaire == null && map.prix_unitaire == null && map.total == null) {
      // repli positionnel : dernière cellule numérique de la ligne
      for (let c = r.length - 1; c >= 0; c--) { const n = toNum(r[c]); if (n != null) { prix_unitaire = n; break; } }
    }
    out.push({
      libelle,
      unite: map.unite != null ? (String(r[map.unite] ?? '').trim() || null) : null,
      quantite,
      prix_unitaire,
      total,
      famille: map.famille != null ? (String(r[map.famille] ?? '').trim() || null) : null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ Classeur (multi-feuilles)
export interface ClasseurExcel {
  feuilles: string[];
  parseFeuilles(noms: string[]): ParsedRow[];
}

export async function ouvrirExcel(file: File): Promise<ClasseurExcel> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return {
    feuilles: wb.SheetNames,
    parseFeuilles(noms) {
      return noms.flatMap((n) => { const ws = wb.Sheets[n]; return ws ? parseFeuille(ws) : []; });
    },
  };
}

// ------------------------------------------------------------------ Mappers
// Vers le format des lignes de devis sous-traitant (identique à la sortie OCR).
export function versLignesDevis(rows: ParsedRow[]): LigneDevisST[] {
  return rows.map((r) => ({
    designation: r.libelle,
    unite: r.unite ?? '',
    quantite: r.quantite ?? 1,
    prix_unitaire: r.prix_unitaire ?? 0,
  }));
}

// Vers le format des prestations candidates pour la bibliothèque.
export interface CandidatBiblio {
  libelle: string;
  prix_achat_net: number | null;
  unite: string | null;
  famille: string | null;
}
export function versCandidatsBiblio(rows: ParsedRow[]): CandidatBiblio[] {
  return rows.map((r) => ({
    libelle: r.libelle,
    prix_achat_net: r.prix_unitaire ?? r.total ?? null,
    unite: r.unite,
    famille: r.famille,
  }));
}
