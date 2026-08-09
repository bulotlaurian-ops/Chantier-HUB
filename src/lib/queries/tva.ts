import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type TypeTva = Tables<"prestations">["type_tva"];

// Taux de TVA EN VIGUEUR par type (table datée tva_taux, §7 — jamais de taux en dur).
// Renvoie un map type_tva -> taux courant (date_fin null).
export function useTauxTvaCourants() {
  return useQuery({
    queryKey: ["tva_taux", "courants"],
    queryFn: async (): Promise<Record<TypeTva, number>> => {
      const { data, error } = await supabase
        .from("tva_taux")
        .select("type, taux, date_fin")
        .is("date_fin", null);
      if (error) throw error;
      const map = {} as Record<TypeTva, number>;
      for (const row of data ?? []) map[row.type] = Number(row.taux);
      return map;
    },
    staleTime: 5 * 60_000,
  });
}
