import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Paramètres globaux (clé/valeur). Réservé admin/conducteur par la RLS.
// ⚠️ Plusieurs valeurs sont des placeholders de démo en attente du client (§8).
export function useParametres() {
  return useQuery({
    queryKey: ["parametres"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from("parametres").select("cle, valeur");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.cle, p.valeur]));
    },
    staleTime: 5 * 60_000,
  });
}

// Met à jour un paramètre existant (clé/valeur). RLS : admin/conducteur.
export function useUpdateParametre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cle, valeur }: { cle: string; valeur: string }) => {
      const { error } = await supabase.from("parametres").update({ valeur }).eq("cle", cle);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parametres"] }),
  });
}

// Helper typé pour lire un paramètre numérique avec valeur de repli explicite.
export function paramNumber(params: Record<string, string> | undefined, cle: string, fallback: number): number {
  const v = params?.[cle];
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
