import type { Prestation } from '@/lib/types';

// Totaux d'une prestation (modèle front / store Zustand — encore utilisé par devis.nouveau
// tant que la vue Devis n'est pas migrée sur Supabase).
export function prestationTotaux(p: Prestation): { prix: number; temps: number } {
  if (p.postes && p.postes.length) {
    const prix = p.postes.reduce((s, po) => s + po.prixBrut, 0);
    const temps = p.postes.reduce((s, po) => s + po.tempsParUnite, 0);
    return { prix: Math.round(prix * 100) / 100, temps: Math.round(temps * 100) / 100 };
  }
  return { prix: p.prixB2B, temps: p.tempsParUnite ?? 0 };
}
