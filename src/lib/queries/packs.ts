import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type PrestationPack = Tables<"prestation_packs">;

const KEY = ["prestation_packs"] as const;

// Toutes les liaisons (packs). Lecture ouverte à tous les authentifiés (RLS).
// Table légère → on charge tout et on résout les prestations liées côté client.
export function usePrestationPacks() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PrestationPack[]> => {
      const { data, error } = await supabase
        .from("prestation_packs")
        .select("id, prestation_id, prestation_liee_id, ordre, created_at")
        .order("ordre");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Ajoute une prestation liée à une prestation principale. Écriture = staff (RLS).
export function useAddPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      prestation_id,
      prestation_liee_id,
      ordre,
    }: {
      prestation_id: string;
      prestation_liee_id: string;
      ordre: number;
    }) => {
      const { error } = await supabase
        .from("prestation_packs")
        .insert({ prestation_id, prestation_liee_id, ordre });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Retire une liaison par son id.
export function useRemovePack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prestation_packs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
