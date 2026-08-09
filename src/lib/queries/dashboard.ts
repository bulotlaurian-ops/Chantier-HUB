import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Forme du jsonb renvoyé par la RPC dashboard_kpis (NULL pour un ouvrier).
export interface DashboardKpis {
  devis: {
    par_statut: Record<string, number>;
    ca_ht_accepte: number;
    taux_acceptation: number | null;
  };
  marge: {
    marge_chf: number;
    reference: number;
    pct_global: number | null;
    nb_calculables: number;
    nb_non_calculables: number;
  };
  chantiers: { actifs: number; termines_periode: number };
  heures: { travaillees: number; trajet: number };
  a_traiter: {
    factures_a_valider_nb: number;
    factures_a_valider_montant: number;
    devis_envoyes_30j: number;
  };
}

// Agrégats du dashboard via RPC (SECURITY INVOKER → RLS du caller). enabled=false
// pour ne pas la monter côté ouvrier (elle renverrait NULL de toute façon).
export function useDashboardKpis(from: string, to: string, entiteId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["dashboard_kpis", from, to, entiteId],
    enabled,
    queryFn: async (): Promise<DashboardKpis | null> => {
      const { data, error } = await supabase.rpc("dashboard_kpis", {
        p_from: from,
        p_to: to,
        p_entite: entiteId ?? undefined,
      });
      if (error) throw error;
      return (data as unknown as DashboardKpis | null) ?? null;
    },
  });
}

export type Periode = "semaine" | "mois" | "trimestre";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Bornes [from, to] INCLUSIVES d'une période, ancrées sur `ref` (def. aujourd'hui).
export function periodeBornes(kind: Periode, ref = new Date()): { from: string; to: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (kind === "semaine") {
    const day = (ref.getDay() + 6) % 7; // lundi = 0
    const start = new Date(y, m, ref.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: iso(start), to: iso(end) };
  }
  if (kind === "mois") {
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
  const startMonth = Math.floor(m / 3) * 3; // trimestre
  return { from: iso(new Date(y, startMonth, 1)), to: iso(new Date(y, startMonth + 3, 0)) };
}
