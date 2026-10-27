import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Entite = Tables<"entites">;

// Référentiel des 3 entités (commun). Seule l'option TVA sur les débits est éditable.
export function useEntites() {
  return useQuery({
    queryKey: ["entites"],
    queryFn: async (): Promise<Entite[]> => {
      const { data, error } = await supabase.from("entites").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000, // référentiel quasi statique
  });
}

// Option fiscale « TVA sur les débits » (038) : imprimée sur les factures si activée.
// RLS : écriture admin + conducteur (policy entites_staff_all, 005).
export function useUpdateTvaSurDebits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tva_sur_debits }: { id: string; tva_sur_debits: boolean }) => {
      const { error } = await supabase.from("entites").update({ tva_sur_debits }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entites"] }),
  });
}
