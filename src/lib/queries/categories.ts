import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type CategorieTarifaire = Tables<"categories_tarifaires">;

// Catégories tarifaires configurables (type 'client' ou 'nature_projet').
// ⚠️ Valeurs PROVISOIRES en attente de validation client (§8).
export function useCategoriesTarifaires() {
  return useQuery({
    queryKey: ["categories_tarifaires"],
    queryFn: async (): Promise<CategorieTarifaire[]> => {
      const { data, error } = await supabase.from("categories_tarifaires").select("*").order("ordre");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
