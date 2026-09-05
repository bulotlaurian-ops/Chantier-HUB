import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ModeTarif } from "@/lib/queries/prestations";

// Édition de la grille tarifs (catégories client). Upsert/Delete invalident la
// requête prestations (qui embarque les tarifs). RLS : biblio = staff (admin/conducteur).
export function useUpsertTarif() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      prestation_id: string;
      categorie_id: string;
      mode: ModeTarif;
      valeur: number;
    }) => {
      const { error } = await supabase
        .from("tarifs")
        .upsert(t, { onConflict: "prestation_id,categorie_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prestations"] }),
  });
}

export function useDeleteTarif() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      prestation_id,
      categorie_id,
    }: {
      prestation_id: string;
      categorie_id: string;
    }) => {
      const { error } = await supabase
        .from("tarifs")
        .delete()
        .eq("prestation_id", prestation_id)
        .eq("categorie_id", categorie_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prestations"] }),
  });
}
