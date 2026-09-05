import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

// Bibliothèque COMMUNE aux 3 entités (§4). Modèle : prix de référence + prix d'achat
// + grille `tarifs` (remise/coefficient/prix absolu par catégorie). Plus de B2B/privé/luxe.
export type SousPoste = Tables<"sous_postes">;
export type Poste = Tables<"postes"> & { sous_postes: SousPoste[] };
export type Tarif = Tables<"tarifs">;
export type ModeTarif = Tables<"tarifs">["mode"];
export type Prestation = Tables<"prestations"> & { postes: Poste[]; tarifs: Tarif[] };

const KEY = ["prestations"] as const;
const SELECT = "*, postes(*, sous_postes(*)), tarifs(*)";

// Prix résultant d'un tarif appliqué au prix de référence.
//   remise_pct : ref × (1 + valeur)   [valeur négative, ex -0.20]
//   coefficient: ref × valeur          [ex 1.05]
//   prix_absolu: valeur
export function prixDepuisTarif(mode: ModeTarif, valeur: number, ref: number): number {
  const v =
    mode === "remise_pct" ? ref * (1 + valeur) : mode === "coefficient" ? ref * valeur : valeur;
  return Math.round(v * 100) / 100;
}

// Résolution du prix de vente pour une catégorie (depuis la grille tarifs, sinon référence).
// Base = prix de vente de référence, avec repli sur le prix d'achat si PV=0 (cas SG/CDO) —
// même logique de repli que prixAffichage(), sinon la ligne de devis serait créée à 0.
export function prixVentePourCategorie(
  p: Prestation,
  categorieId: string | null | undefined,
): number {
  const base =
    p.prix_vente_reference && p.prix_vente_reference > 0
      ? p.prix_vente_reference
      : (p.prix_achat_net ?? 0);
  if (!categorieId) return base;
  const t = p.tarifs.find((x) => x.categorie_id === categorieId);
  return t ? prixDepuisTarif(t.mode, t.valeur, base) : base;
}

// Prix à AFFICHER en bibliothèque (liste + sélecteur). Logique de repli :
//   principal = prix_vente_reference si ≠ 0, sinon prix_achat_net (cas SG/CDO, PV=0).
//   secondaire = l'autre prix (le coût d'achat) quand les deux existent et diffèrent.
// → PRO/clôtures affichent leur prix de vente ; SG/CDO affichent enfin leur prix.
export function prixAffichage(p: Pick<Prestation, "prix_vente_reference" | "prix_achat_net">): {
  principal: number;
  secondaire: number | null;
} {
  const pv = p.prix_vente_reference ?? 0;
  const pa = p.prix_achat_net ?? 0;
  if (pv !== 0) {
    return { principal: pv, secondaire: pa !== 0 && pa !== pv ? pa : null };
  }
  return { principal: pa, secondaire: null };
}

// Champs d'une ligne de devis (sans uid/id locaux). Forme commune à toutes les sources.
export interface LigneDevisChamps {
  prestation_id: string | null;
  code: string | null;
  libelle: string;
  unite: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  prix_revient_unitaire: number;
  taux_tva: number;
  temps_par_unite: number | null;
  remise_pct: number;
  est_option: boolean;
  est_titre: boolean;
}

// SOURCE UNIQUE de construction d'une ligne à partir d'une prestation de la biblio.
// Utilisée par la saisie manuelle ET l'insertion IA → résolution de prix identique
// (tarif de la catégorie du client via prixVentePourCategorie, jamais un raccourci).
export function ligneDepuisPrestation(
  p: Prestation,
  categorieId: string | null | undefined,
  tvaCourants: Record<string, number> | undefined,
  tauxStandard: number,
  opts?: { quantite?: number; est_option?: boolean },
): LigneDevisChamps {
  return {
    prestation_id: p.id,
    code: p.code,
    libelle: p.libelle,
    unite: p.unite,
    quantite: opts?.quantite ?? 1,
    prix_unitaire_ht: prixVentePourCategorie(p, categorieId),
    prix_revient_unitaire: p.prix_achat_net ?? 0,
    taux_tva: tvaCourants?.[p.type_tva] ?? tauxStandard,
    temps_par_unite: p.temps_par_unite,
    remise_pct: 0,
    est_option: opts?.est_option ?? false,
    est_titre: false,
  };
}

// Ligne libre (hors biblio) : libellé + unité + quantité, prix à saisir, TVA standard.
export function ligneLibre(
  libelle: string,
  unite: string | null,
  quantite: number,
  tauxStandard: number,
  opts?: { est_option?: boolean; est_titre?: boolean },
): LigneDevisChamps {
  return {
    prestation_id: null,
    code: null,
    libelle,
    unite,
    quantite,
    prix_unitaire_ht: 0,
    prix_revient_unitaire: 0,
    taux_tva: tauxStandard,
    temps_par_unite: null,
    remise_pct: 0,
    est_option: opts?.est_option ?? false,
    est_titre: opts?.est_titre ?? false,
  };
}

const trierPostes = (p: { postes?: Poste[] }) => ({
  ...p,
  postes: [...(p.postes ?? [])]
    .sort((a, b) => a.ordre - b.ordre)
    .map((po) => ({
      ...po,
      sous_postes: [...(po.sous_postes ?? [])].sort((a, b) => a.ordre - b.ordre),
    })),
});

// Options distinctes pour les dropdowns d'ajout (fournisseur / famille / code CFC).
export interface PrestationsOptions {
  fournisseurs: string[];
  familles: string[];
  cfc: { code: string; libelle: string | null }[];
}
export function usePrestationsOptions() {
  return useQuery({
    queryKey: [...KEY, "options"],
    queryFn: async (): Promise<PrestationsOptions> => {
      const { data, error } = await supabase
        .from("prestations")
        .select("fournisseur, famille, code_cfc, code_cfc_libelle");
      if (error) throw error;
      const fournisseurs = new Set<string>();
      const familles = new Set<string>();
      const cfc = new Map<string, string | null>();
      for (const r of data ?? []) {
        if (r.fournisseur) fournisseurs.add(r.fournisseur);
        if (r.famille) familles.add(r.famille);
        if (r.code_cfc) cfc.set(r.code_cfc, r.code_cfc_libelle ?? null);
      }
      const triFr = (a: string, b: string) => a.localeCompare(b, "fr");
      return {
        fournisseurs: [...fournisseurs].sort(triFr),
        familles: [...familles].sort(triFr),
        cfc: [...cfc.entries()]
          .map(([code, libelle]) => ({ code, libelle }))
          .sort((a, b) => triFr(a.code, b.code)),
      };
    },
  });
}

// Bibliothèque CONSOMMABLE : seulement les prestations actives (validées). Les
// `pending`/`rejete` (actif=false) ne fuient ni en biblio ni dans le select devis.
export function usePrestations() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Prestation[]> => {
      const { data, error } = await supabase
        .from("prestations")
        .select(SELECT)
        .eq("actif", true)
        .order("libelle");
      if (error) throw error;
      return (data ?? []).map(trierPostes) as Prestation[];
    },
  });
}

// Toutes les prestations VISIBLES (sans filtre actif) — pour l'écran bibliothèque.
// La RLS borne : admin = tous statuts ; conducteur = actif=true ; ouvrier = rien.
export function usePrestationsToutes() {
  return useQuery({
    queryKey: [...KEY, "toutes"],
    queryFn: async (): Promise<Prestation[]> => {
      const { data, error } = await supabase.from("prestations").select(SELECT).order("libelle");
      if (error) throw error;
      return (data ?? []).map(trierPostes) as Prestation[];
    },
  });
}

// Mise à jour de champs simples (famille, code_cfc, code_cfc_libelle…) — édition inline admin.
export function useUpdatePrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"prestations"> }) => {
      const { error } = await supabase.from("prestations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ---- Circuit pending → validé ----
export type PrestationPending = Prestation & {
  auteur: { nom: string; prenom: string | null } | null;
};

// Liste des propositions en attente (admin uniquement via RLS).
export function usePrestationsPending() {
  return useQuery({
    queryKey: [...KEY, "pending"],
    queryFn: async (): Promise<PrestationPending[]> => {
      const { data, error } = await supabase
        .from("prestations")
        .select(`${SELECT}, auteur:profiles!prestations_created_by_fkey(nom, prenom)`)
        .eq("statut_validation", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(trierPostes) as unknown as PrestationPending[];
    },
  });
}

export interface ProposerPrestationInput {
  libelle: string;
  unite: Tables<"prestations">["unite"];
  prix_vente_reference: number;
  entite_code: string; // trace dans `source` (§4 : biblio commune, pas d'entite_id)
}

// Soumission d'une prestation hors biblio par un conducteur (INSERT pending).
export function useProposerPrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProposerPrestationInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("prestations").insert({
        libelle: input.libelle,
        unite: input.unite,
        prix_vente_reference: input.prix_vente_reference,
        type_tva: "standard",
        source: `suggestion:${input.entite_code}`,
        statut_validation: "pending",
        actif: false,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Ajout DIRECT en bibliothèque (valide + actif) par un conducteur/admin depuis le
// preview devis IA / import ST — pas de passage pending (RLS prestations_conducteur_ajouter).
export function useAjouterPrestationBiblio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProposerPrestationInput): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("prestations").insert({
        libelle: input.libelle,
        unite: input.unite,
        prix_vente_reference: input.prix_vente_reference,
        type_tva: "standard",
        source: `suggestion:${input.entite_code}`,
        statut_validation: "valide",
        actif: true,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Validation (admin) : éventuels ajustements + statut valide + actif → disponible en biblio.
export function useValiderPrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch?: {
        libelle?: string;
        unite?: Tables<"prestations">["unite"];
        prix_vente_reference?: number;
      };
    }): Promise<Prestation> => {
      const { data, error } = await supabase
        .from("prestations")
        .update({ ...patch, statut_validation: "valide", actif: true })
        .eq("id", id)
        .select(SELECT)
        .single();
      if (error) throw error;
      return trierPostes(data as unknown as Prestation) as Prestation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Rejet (admin) : trace conservée (statut rejete, actif=false) — pas de DELETE.
export function useRejeterPrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("prestations")
        .update({ statut_validation: "rejete", actif: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface NouveauPoste {
  libelle: string;
  unite: Tables<"postes">["unite"];
  prix_brut: number;
  temps_par_unite: number | null;
}

export interface NouveauTarif {
  categorie_id: string;
  mode: ModeTarif;
  valeur: number;
}

export function useCreatePrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      prestation: TablesInsert<"prestations">;
      postes: NouveauPoste[];
      tarifs?: NouveauTarif[];
    }) => {
      // created_by = auteur courant : requis par la RLS d'insertion conducteur.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data: p, error } = await supabase
        .from("prestations")
        .insert({ ...input.prestation, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      if (input.postes.length) {
        const rows = input.postes.map((po, i) => ({ ...po, prestation_id: p.id, ordre: i }));
        const { error: e2 } = await supabase.from("postes").insert(rows);
        if (e2) throw e2;
      }
      if (input.tarifs && input.tarifs.length) {
        const rows = input.tarifs.map((t) => ({ ...t, prestation_id: p.id }));
        const { error: e3 } = await supabase.from("tarifs").insert(rows);
        if (e3) throw e3;
      }
      return p;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeletePrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prestations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDuplicatePrestation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: Prestation) => {
      const { id, created_at, postes, tarifs, ...rest } = src;
      void id;
      void created_at;
      // created_by = auteur courant (et non celui de la source) : requis par la RLS conducteur.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { data: p, error } = await supabase
        .from("prestations")
        .insert({ ...rest, created_by: user.id, libelle: `${src.libelle} (copie)` })
        .select()
        .single();
      if (error) throw error;
      if (tarifs.length) {
        const { error: et } = await supabase.from("tarifs").insert(
          tarifs.map((t) => ({
            prestation_id: p.id,
            categorie_id: t.categorie_id,
            mode: t.mode,
            valeur: t.valeur,
          })),
        );
        if (et) throw et;
      }
      for (const po of postes) {
        const { data: newPoste, error: e2 } = await supabase
          .from("postes")
          .insert({
            prestation_id: p.id,
            libelle: po.libelle,
            unite: po.unite,
            prix_brut: po.prix_brut,
            temps_par_unite: po.temps_par_unite,
            inclus_defaut: po.inclus_defaut,
            ordre: po.ordre,
          })
          .select()
          .single();
        if (e2) throw e2;
        if (po.sous_postes.length) {
          const sp = po.sous_postes.map((s) => ({
            poste_id: newPoste.id,
            libelle: s.libelle,
            unite: s.unite,
            prix_brut: s.prix_brut,
            temps_par_unite: s.temps_par_unite,
            ordre: s.ordre,
          }));
          const { error: e3 } = await supabase.from("sous_postes").insert(sp);
          if (e3) throw e3;
        }
      }
      return p;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePoste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"postes"> }) => {
      const { error } = await supabase.from("postes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeletePoste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("postes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderPostes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; ordre: number }[]) => {
      const results = await Promise.all(
        ordered.map((o) => supabase.from("postes").update({ ordre: o.ordre }).eq("id", o.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
