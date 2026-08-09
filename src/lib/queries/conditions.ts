import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type ConditionPaiement = Tables<"conditions_paiement">;

// Condition de paiement par défaut pour un client : privilégie celle dont
// type_client = catégorie du client, sinon la par_defaut de l'entité.
// Renvoie le libellé prêt à l'emploi (multi-ligne).
export function conditionParDefaut(
  options: ConditionPaiement[],
  clientTypeCode: string | null | undefined,
): string | null {
  if (!options.length) return null;
  const byType = clientTypeCode ? options.find((o) => o.type_client === clientTypeCode) : undefined;
  const chosen = byType ?? options.find((o) => o.par_defaut) ?? options[0];
  return chosen ? chosen.libelle.replace(/ \/ /g, "\n") : null;
}

// Options de conditions de paiement d'une entité (référentiel réel seedé).
export function useConditionsPaiement(entiteId: string | undefined) {
  return useQuery({
    queryKey: ["conditions_paiement", entiteId],
    queryFn: async (): Promise<ConditionPaiement[]> => {
      const { data, error } = await supabase
        .from("conditions_paiement")
        .select("*")
        .eq("entite_id", entiteId!)
        .order("ordre");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!entiteId,
    staleTime: 5 * 60_000,
  });
}
