import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type ChantierRow = Tables<"chantiers">;

// Chantier enrichi des libellés client + entité (jointures) pour l'affichage.
export type ChantierEnrichi = ChantierRow & {
  client: { id: string; nom: string } | null;
  entite: { id: string; nom: string; couleur: string | null; code: string } | null;
};

const SELECT = "*, client:clients(id, nom), entite:entites(id, nom, couleur, code)";
const KEY = ["chantiers"] as const;

export function useChantiersList(includeArchived = false) {
  return useQuery({
    queryKey: [...KEY, { archived: includeArchived }],
    queryFn: async (): Promise<ChantierEnrichi[]> => {
      let q = supabase.from("chantiers").select(SELECT).order("created_at", { ascending: false });
      if (!includeArchived) q = q.is("archive_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChantierEnrichi[];
    },
  });
}

// Archivage (soft delete) / restauration d'un chantier.
export function useArchiveChantier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, restore = false }: { id: string; restore?: boolean }) => {
      const { error } = await supabase
        .from("chantiers")
        .update({ archive_at: restore ? null : new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, v.id] });
    },
  });
}

// Suppression DURE — bloquée par les contraintes FK si des devis, pointages ou
// factures y sont liés (l'archivage reste la voie normale dans ce cas).
export function useDeleteChantier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("chantiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useChantier(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async (): Promise<ChantierEnrichi | null> => {
      const { data, error } = await supabase
        .from("chantiers")
        .select(SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as ChantierEnrichi) ?? null;
    },
    enabled: !!id,
  });
}

export interface NouveauChantier {
  entite_id: string;
  client_id: string;
  nom: string;
  ville: string;
  adresse?: string;
  date_debut?: string;
  date_fin_prevue?: string;
}

export function useCreateChantier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NouveauChantier): Promise<ChantierRow> => {
      // Référence générée côté serveur : "NOM CLIENT / VILLE"
      const { data: ref, error: e0 } = await supabase.rpc("generer_reference_chantier", {
        p_client: input.client_id,
        p_ville: input.ville,
      });
      if (e0) throw e0;
      const { data, error } = await supabase
        .from("chantiers")
        .insert({
          reference: ref as string,
          nom: input.nom,
          entite_id: input.entite_id,
          client_id: input.client_id,
          ville: input.ville,
          adresse: input.adresse || null,
          date_debut: input.date_debut || null,
          date_fin_prevue: input.date_fin_prevue || null,
          statut: "prospect",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Coûts + marge réels par chantier (vue chantier_couts_reels, en security_invoker →
// la RLS s'applique au lecteur ; toutes les colonnes sont NULL pour un ouvrier).
// cout_mo_reel = Σ heures × taux (param 70 par défaut) ; cout_fournisseurs_reel =
// Σ répartitions des factures VALIDÉES ; montant_reference = Σ total_ht des devis
// ACCEPTÉS (NULL si aucun → marge non calculable) ; marge_reelle_* dérivées.
export type ChantierCouts = {
  chantier_id: string;
  cout_mo_reel: number | null;
  cout_fournisseurs_reel: number | null;
  montant_reference: number | null;
  marge_reelle_chf: number | null;
  marge_reelle_pct: number | null;
};

// Seuil de marge « faible » (orange) en %. Paramétrable — déplaçable dans `parametres`.
export const SEUIL_MARGE_FAIBLE_PCT = 10;

export type NiveauMarge = "ok" | "faible" | "negatif";
export interface MargeEval {
  calculable: boolean; // false = aucun devis accepté (afficher « — »)
  coutReel: number;
  margeChf: number | null;
  margePct: number | null;
  niveau: NiveauMarge | null;
}

// Dérive l'état de marge d'un chantier à partir des coûts de la vue.
export function evalMarge(c: ChantierCouts | undefined): MargeEval {
  const mo = Number(c?.cout_mo_reel ?? 0);
  const fo = Number(c?.cout_fournisseurs_reel ?? 0);
  const coutReel = mo + fo;
  const ref = c?.montant_reference;
  if (ref == null)
    return { calculable: false, coutReel, margeChf: null, margePct: null, niveau: null };
  const margeChf = Number(c?.marge_reelle_chf ?? 0);
  const margePct = c?.marge_reelle_pct == null ? null : Number(c.marge_reelle_pct);
  const niveau: NiveauMarge =
    margeChf < 0 ? "negatif" : (margePct ?? 0) < SEUIL_MARGE_FAIBLE_PCT ? "faible" : "ok";
  return { calculable: true, coutReel, margeChf, margePct, niveau };
}

// enabled=false pour ne PAS servir les coûts/marge (ex : rôle ouvrier).
export function useChantierCoutsReels(enabled = true) {
  return useQuery({
    queryKey: ["chantier_couts_reels"],
    enabled,
    queryFn: async (): Promise<Record<string, ChantierCouts>> => {
      const { data, error } = await supabase.from("chantier_couts_reels").select("*");
      if (error) throw error;
      const map: Record<string, ChantierCouts> = {};
      for (const r of (data ?? []) as ChantierCouts[]) map[r.chantier_id] = r;
      return map;
    },
  });
}

export function useUpdateChantierStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: ChantierRow["statut"] }) => {
      const { error } = await supabase.from("chantiers").update({ statut }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, v.id] });
    },
  });
}
