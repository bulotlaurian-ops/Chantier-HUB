import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

export type DevisRow = Tables<"devis">;
export type LigneDevisRow = Tables<"lignes_devis">;

export type DevisEnrichi = DevisRow & {
  client: { id: string; nom: string; categorie: { libelle: string; code: string } | null } | null;
  entite: { id: string; nom: string; couleur: string | null; code: string } | null;
  chantier: { id: string; reference: string; nom: string } | null;
};

export type DevisDetail = DevisRow & {
  client: (Tables<"clients"> & { categorie: { libelle: string } | null }) | null;
  entite: Tables<"entites"> | null;
  chantier: { id: string; reference: string; nom: string } | null;
  lignes: LigneDevisRow[];
};

const KEY = ["devis"] as const;
const LIST_SELECT =
  "*, client:clients(id, nom, categorie:categories_tarifaires(libelle, code)), entite:entites(id, nom, couleur, code), chantier:chantiers(id, reference, nom)";
const DETAIL_SELECT =
  "*, client:clients(*, categorie:categories_tarifaires(libelle)), entite:entites(*), chantier:chantiers(id, reference, nom), lignes:lignes_devis(*)";

export function useDevisList(includeArchived = false) {
  return useQuery({
    queryKey: [...KEY, { archived: includeArchived }],
    queryFn: async (): Promise<DevisEnrichi[]> => {
      let q = supabase
        .from("devis")
        .select(LIST_SELECT)
        .order("date_creation", { ascending: false });
      if (!includeArchived) q = q.is("archive_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DevisEnrichi[];
    },
  });
}

export function useDevis(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async (): Promise<DevisDetail | null> => {
      const { data, error } = await supabase
        .from("devis")
        .select(DETAIL_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const d = data as DevisDetail;
      d.lignes = [...(d.lignes ?? [])].sort((a, b) => a.ordre - b.ordre);
      return d;
    },
    enabled: !!id,
  });
}

export interface NouvelleLigne {
  ordre: number;
  prestation_id?: string | null;
  poste_id?: string | null;
  code?: string | null;
  libelle: string;
  quantite: number;
  unite?: string | null;
  prix_unitaire_ht: number;
  remise_pct?: number;
  prix_revient_unitaire: number;
  taux_tva: number;
  total_ht: number;
  est_option?: boolean;
  est_titre?: boolean;
  temps_par_unite?: number | null;
}

export function useCreateDevis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      devis: Omit<TablesInsert<"devis">, "numero">;
      lignes: NouvelleLigne[];
    }): Promise<DevisRow> => {
      const { data: numero, error: e0 } = await supabase.rpc("generer_numero_devis");
      if (e0) throw e0;
      const { data: d, error } = await supabase
        .from("devis")
        .insert({ ...input.devis, numero: numero as string })
        .select()
        .single();
      if (error) throw error;
      if (input.lignes.length) {
        const rows = input.lignes.map((l) => ({ ...l, devis_id: d.id }));
        const { error: e2 } = await supabase.from("lignes_devis").insert(rows);
        if (e2) throw e2;
      }
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Édition COMPLÈTE d'un brouillon : maj de l'en-tête + remplacement des lignes (le numéro
// ne change pas). Réservé aux brouillons côté UI.
export function useUpdateDevisComplet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      devis: TablesUpdate<"devis">;
      lignes: NouvelleLigne[];
    }) => {
      const { error: e1 } = await supabase.from("devis").update(input.devis).eq("id", input.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("lignes_devis").delete().eq("devis_id", input.id);
      if (e2) throw e2;
      if (input.lignes.length) {
        const rows = input.lignes.map((l) => ({ ...l, devis_id: input.id }));
        const { error: e3 } = await supabase.from("lignes_devis").insert(rows);
        if (e3) throw e3;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, v.id] });
    },
  });
}

// ---- Versionnage : numero = "<base> / <version>" (ex. "2607018 / 2") ----
export const numeroBase = (numero: string) => numero.split(" / ")[0].trim();
export const numeroVersion = (numero: string) => {
  const v = parseInt(numero.split(" / ")[1] ?? "1", 10);
  return Number.isFinite(v) ? v : 1;
};

// Copie en BROUILLON d'un devis existant sous un numéro donné (partagé par la
// duplication classique et la création de version).
async function insererCopieDevis(src: DevisDetail, numero: string): Promise<DevisRow> {
  const { data: d, error } = await supabase
    .from("devis")
    .insert({
      numero,
      entite_id: src.entite_id,
      client_id: src.client_id,
      chantier_id: src.chantier_id,
      nature_projet_id: src.nature_projet_id,
      statut: "brouillon",
      objet: src.objet,
      conditions_paiement: src.conditions_paiement,
      fg_mode: src.fg_mode,
      fg_valeur: src.fg_valeur,
      coefficient_global: src.coefficient_global,
      total_ht: src.total_ht,
      total_tva: src.total_tva,
      total_ttc: src.total_ttc,
      arrondi: src.arrondi,
      cout_revient_total: src.cout_revient_total,
      marge: src.marge,
      taux_marge: src.taux_marge,
    })
    .select()
    .single();
  if (error) throw error;
  if (src.lignes.length) {
    const rows = src.lignes.map((l, i) => ({
      devis_id: d.id,
      ordre: i,
      prestation_id: l.prestation_id,
      poste_id: l.poste_id,
      code: l.code,
      libelle: l.libelle,
      quantite: l.quantite,
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_pct: l.remise_pct,
      prix_revient_unitaire: l.prix_revient_unitaire,
      taux_tva: l.taux_tva,
      total_ht: l.total_ht,
      est_option: l.est_option,
      est_titre: l.est_titre,
      temps_par_unite: l.temps_par_unite,
    }));
    const { error: e2 } = await supabase.from("lignes_devis").insert(rows);
    if (e2) throw e2;
  }
  return d;
}

// Duplication d'un devis (émis ou non) → copie en BROUILLON avec un nouveau numéro.
export function useDuplicateDevis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: DevisDetail): Promise<DevisRow> => {
      const { data: numero, error: e0 } = await supabase.rpc("generer_numero_devis");
      if (e0) throw e0;
      return insererCopieDevis(src, numero as string);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Nouvelle VERSION d'un devis : copie en brouillon qui GARDE le numéro de base
// et incrémente le suffixe (2607018 / 1 → 2607018 / 2).
export function useCreateVersionDevis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: DevisDetail): Promise<DevisRow> => {
      const base = numeroBase(src.numero);
      const { data: freres, error: e0 } = await supabase
        .from("devis")
        .select("numero")
        .like("numero", `${base} /%`);
      if (e0) throw e0;
      const next = Math.max(1, ...(freres ?? []).map((f) => numeroVersion(f.numero))) + 1;
      return insererCopieDevis(src, `${base} / ${next}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Toutes les versions partageant le même numéro de base (pour l'historique du détail).
export function useVersionsDevis(numero: string | undefined) {
  const base = numero ? numeroBase(numero) : "";
  return useQuery({
    queryKey: [...KEY, "versions", base],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devis")
        .select("id, numero, statut, date_creation, total_ttc, archive_at")
        .like("numero", `${base} /%`);
      if (error) throw error;
      return (data ?? []).sort((a, b) => numeroVersion(a.numero) - numeroVersion(b.numero));
    },
    enabled: !!base,
  });
}

// Mise à jour de champs simples du devis (objet, conditions de paiement…) — ne touche pas aux totaux.
export function useUpdateDevis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<DevisRow, "objet" | "conditions_paiement" | "notes">>;
    }) => {
      const { error } = await supabase.from("devis").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, v.id] });
    },
  });
}

export function useUpdateDevisStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: DevisRow["statut"] }) => {
      const { error } = await supabase.from("devis").update({ statut }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, v.id] });
    },
  });
}

// Suppression DURE — réservée aux devis brouillon (double confirmation côté UI).
export function useDeleteDevis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("devis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Archivage (soft delete) / restauration — pour les devis émis.
export function useArchiveDevis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, restore = false }: { id: string; restore?: boolean }) => {
      const { error } = await supabase
        .from("devis")
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
