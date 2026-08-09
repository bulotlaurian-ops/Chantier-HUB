import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type Entite = Tables<"entites">;

// Référentiel des 3 entités (commun). Lecture seule pour l'instant.
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
