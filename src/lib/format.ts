export function formatEUR(n: number): string {
  const v = Math.round(n * 100) / 100;
  const neg = v < 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${withSpaces},${decPart} €`;
}

export function formatEURShort(n: number): string {
  const v = Math.round(n);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
}

// Montant français sans suffixe : 1 345,00 (pour les colonnes/totaux du PDF de devis).
export function formatMontant(n: number): string {
  const v = Math.round(n * 100) / 100;
  const neg = v < 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${withSpaces},${decPart}`;
}

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

// Date longue française : "16 mars 2026" (en-tête PDF).
export function formatDateLong(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function formatHeures(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

export function formatHeuresFromMin(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = Math.round(min % 60);
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

// Génère une ville abrégée 3 lettres (sans accents, majuscules)
export function abregeVille(ville: string): string {
  const v = ville
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  return (v.slice(0, 3) || "XXX").padEnd(3, "X");
}

export function startOfWeek(d: Date): Date {
  const n = new Date(d);
  const day = (n.getDay() + 6) % 7; // monday-based
  n.setDate(n.getDate() - day);
  n.setHours(0, 0, 0, 0);
  return n;
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}
