import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/lib/database.types";

export type PointageRow = Tables<"pointages">;

// Pointage enrichi du chantier (référence/nom/ville/entité) et de l'ouvrier
// (nom + taux horaire pour le détail du coût main-d'œuvre sur la fiche chantier).
export type PointageEnrichi = PointageRow & {
  chantier: { id: string; reference: string; nom: string; ville: string | null; entite_id: string } | null;
  ouvrier: { id: string; nom: string; prenom: string | null; taux_horaire: number | null } | null;
};

const KEY = ["pointages"] as const;
const COUTS_KEY = ["chantier_couts_reels"] as const;
const SELECT =
  "*, chantier:chantiers(id, reference, nom, ville, entite_id), ouvrier:profiles(id, nom, prenom, taux_horaire)";

// Liste des pointages. La RLS borne d'office le périmètre selon le rôle :
// ouvrier = les siens ; conducteur = ceux des chantiers de ses entités ; admin = tous.
export function usePointages() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PointageEnrichi[]> => {
      const { data, error } = await supabase
        .from("pointages")
        .select(SELECT)
        .order("date", { ascending: false })
        .order("heure_debut", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PointageEnrichi[];
    },
  });
}

// Saisie DIRECTE du nombre d'heures (retour client — migration 029). Si une
// plage début/fin est présente (anciens enregistrements), le trigger
// calc_heures_pointage reste autoritaire et recalcule depuis la plage ; c'est
// pourquoi l'édition repasse toujours heure_debut/heure_fin à null.
export interface NouveauPointage {
  chantier_id: string;
  ouvrier_id: string;
  date: string;
  heures_travaillees: number;
  heures_trajet?: number;
  note?: string | null;
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: COUTS_KEY });
};

export function useCreatePointage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NouveauPointage): Promise<PointageRow> => {
      const { data, error } = await supabase
        .from("pointages")
        .insert({
          chantier_id: input.chantier_id,
          ouvrier_id: input.ouvrier_id,
          date: input.date,
          heures_travaillees: input.heures_travaillees,
          heures_trajet: input.heures_trajet ?? 0,
          note: input.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

// Exclut (ou réintègre) un pointage du coût main-d'œuvre du chantier. Les
// heures restent saisies et visibles : seule la marge change.
export function useTogglePointageComptabilise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comptabilise }: { id: string; comptabilise: boolean }) => {
      const { error } = await supabase.from("pointages").update({ comptabilise }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdatePointage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"pointages"> }) => {
      const { error } = await supabase.from("pointages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeletePointage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pointages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
