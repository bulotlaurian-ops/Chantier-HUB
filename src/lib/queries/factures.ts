import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/lib/database.types";
import type { DevisDetail } from "@/lib/queries/devis";
import { todayIso } from "@/lib/devis-utils";
import { addDays } from "@/lib/format";

export type FactureRow = Tables<"factures_fournisseurs">;
export type RepartitionRow = Tables<"factures_repartition">;

export type FactureEnrichie = FactureRow & {
  repartitions: (RepartitionRow & {
    chantier: { id: string; reference: string; nom: string; entite_id: string } | null;
  })[];
};

const KEY = ["factures"] as const;
const COUTS_KEY = ["chantier_couts_reels"] as const;
const SELECT =
  "*, repartitions:factures_repartition(*, chantier:chantiers(id, reference, nom, entite_id))";
const BUCKET = "factures";

// Liste des factures (RLS : admin tout ; conducteur les siennes/visibles ; ouvrier aucune).
export function useFactures() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<FactureEnrichie[]> => {
      const { data, error } = await supabase
        .from("factures_fournisseurs")
        .select(SELECT)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FactureEnrichie[];
    },
  });
}

// Facture avec le montant HT réparti sur UN chantier donné.
// repartition_id et comptabilise sont nécessaires pour exclure ou retirer une
// affectation depuis la fiche chantier.
export type FactureChantier = FactureRow & {
  montant_ht_affecte: number;
  repartition_id: string;
  comptabilise: boolean;
};

// Factures attribuées à un chantier (via factures_repartition). RLS borne la visibilité.
export function useFacturesChantier(chantierId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "chantier", chantierId],
    enabled: !!chantierId,
    queryFn: async (): Promise<FactureChantier[]> => {
      const { data, error } = await supabase
        .from("factures_repartition")
        .select("id, montant_ht_affecte, comptabilise, facture:factures_fournisseurs(*)")
        .eq("chantier_id", chantierId as string);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => r.facture)
        .map((r) => ({
          ...(r.facture as unknown as FactureRow),
          montant_ht_affecte: Number(r.montant_ht_affecte),
          repartition_id: r.id as string,
          comptabilise: (r.comptabilise as boolean | null) ?? true,
        }));
    },
  });
}

// Factures qu'il reste à affecter (montant HT non encore réparti > 0), pour
// l'affectation directe depuis la fiche chantier.
export type FactureAffectable = FactureRow & { deja_affecte: number; reste: number };

export function useFacturesAffectables() {
  return useQuery({
    queryKey: [...KEY, "affectables"],
    queryFn: async (): Promise<FactureAffectable[]> => {
      const { data, error } = await supabase
        .from("factures_fournisseurs")
        .select("*, repartitions:factures_repartition(montant_ht_affecte)")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((f) => {
          const reps = (f.repartitions ?? []) as { montant_ht_affecte: number }[];
          const deja = reps.reduce((s, r) => s + Number(r.montant_ht_affecte), 0);
          const { repartitions: _ignore, ...facture } = f as Record<string, unknown>;
          return {
            ...(facture as unknown as FactureRow),
            deja_affecte: Math.round(deja * 100) / 100,
            reste: Math.round((Number(f.montant_ht) - deja) * 100) / 100,
          };
        })
        .filter((f) => f.reste > 0.001);
    },
  });
}

// Affecte tout ou partie d'une facture à un chantier.
export function useCreateRepartition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      facture_id,
      chantier_id,
      montant_ht_affecte,
    }: {
      facture_id: string;
      chantier_id: string;
      montant_ht_affecte: number;
    }) => {
      const { error } = await supabase
        .from("factures_repartition")
        .insert({ facture_id, chantier_id, montant_ht_affecte });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["chantier_couts_reels"] });
    },
  });
}

// Exclut (ou réintègre) une affectation du coût fournisseurs du chantier. Le
// montant reste visible et rattaché à sa facture : seule la marge change.
export function useToggleRepartitionComptabilisee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comptabilise }: { id: string; comptabilise: boolean }) => {
      const { error } = await supabase
        .from("factures_repartition")
        .update({ comptabilise })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["chantier_couts_reels"] });
    },
  });
}

// Détache une facture du chantier (la facture elle-même est conservée).
export function useDeleteRepartition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("factures_repartition").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["chantier_couts_reels"] });
    },
  });
}

export interface RepartitionInput {
  chantier_id: string;
  montant_ht_affecte: number;
}
export interface FactureInput {
  fournisseur: string;
  numero_facture?: string | null;
  date?: string | null;
  montant_ht: number;
  taux_tva: number;
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: COUTS_KEY });
};

// montant_ttc est calculé par trigger ; on n'envoie que HT + TVA.
export function useCreateFacture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      facture,
      repartitions,
    }: {
      facture: FactureInput;
      repartitions: RepartitionInput[];
    }): Promise<FactureRow> => {
      const { data, error } = await supabase
        .from("factures_fournisseurs")
        .insert({
          fournisseur: facture.fournisseur,
          numero_facture: facture.numero_facture ?? null,
          date: facture.date ?? null,
          montant_ht: facture.montant_ht,
          taux_tva: facture.taux_tva,
        })
        .select()
        .single();
      if (error) throw error;
      if (repartitions.length) {
        const { error: e2 } = await supabase.from("factures_repartition").insert(
          repartitions.map((r) => ({
            facture_id: data.id,
            chantier_id: r.chantier_id,
            montant_ht_affecte: r.montant_ht_affecte,
          })),
        );
        if (e2) throw e2;
      }
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

// Édition : maj des champs + remplacement intégral des répartitions.
export function useUpdateFacture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      facture,
      repartitions,
    }: {
      id: string;
      facture: FactureInput;
      repartitions: RepartitionInput[];
    }) => {
      const { error: e1 } = await supabase
        .from("factures_fournisseurs")
        .update({
          fournisseur: facture.fournisseur,
          numero_facture: facture.numero_facture ?? null,
          date: facture.date ?? null,
          montant_ht: facture.montant_ht,
          taux_tva: facture.taux_tva,
        })
        .eq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("factures_repartition")
        .delete()
        .eq("facture_id", id);
      if (e2) throw e2;
      if (repartitions.length) {
        const { error: e3 } = await supabase.from("factures_repartition").insert(
          repartitions.map((r) => ({
            facture_id: id,
            chantier_id: r.chantier_id,
            montant_ht_affecte: r.montant_ht_affecte,
          })),
        );
        if (e3) throw e3;
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

// Validation (admin). Le trigger check_validation_facture refuse si Σ répartitions ≠ montant HT.
export function useValiderFacture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("factures_fournisseurs")
        .update({ statut: "valide" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteFacture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("factures_fournisseurs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

// Clé Storage sûre : pas d'espaces/accents/caractères spéciaux (les noms réels de
// factures en ont — ex « 2026-02-28 FOURNISSEUR - FACT 260207182.pdf »), qui font échouer
// l'upload ou l'URL de download n8n. On garde le nom d'origine pour l'affichage.
function slugFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base =
    (dot > 0 ? name.slice(0, dot) : name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "fichier";
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase()
      : "";
  return ext ? `${base}.${ext}` : base;
}

// Upload du fichier (path {facture_id}/{slug}) puis maj nom_fichier (origine) / fichier_url (= path).
// Renvoie le PATH réellement uploadé → à réutiliser pour l'OCR (cohérence garantie).
export function useSetFichierFacture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }): Promise<string> => {
      const path = `${id}/${slugFilename(file.name)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) throw error;
      const { error: e2 } = await supabase
        .from("factures_fournisseurs")
        .update({ nom_fichier: file.name, fichier_url: path })
        .eq("id", id);
      if (e2) throw e2;
      return path;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// URL signée pour lire le fichier privé (jamais d'URL publique).
export async function getSignedUrlFacture(path: string, expiresIn = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ---- OCR (Edge Function relais → n8n Vision) ----
// L'IA extrait UNIQUEMENT l'en-tête (fournisseur/n°/date/montant HT/TVA). Champ
// manquant = null. Le statut reste a_valider (jamais auto-validé).
export interface OcrExtraction {
  fournisseur: string | null;
  numero_facture: string | null;
  date_facture: string | null;
  montant_ht: number | null;
  taux_tva: number | null;
}

const OCR_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-facture`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Lance l'OCR sur un fichier déjà uploadé ({facture_id}/{nom}). Lève une erreur
// (code dans le message) si ok:false ou réseau → l'UI retombe en saisie manuelle.
export async function ocrFacture(
  factureId: string,
  fichierPath: string,
  bucket = BUCKET,
): Promise<OcrExtraction> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("non_authentifie");
  let resp: Response;
  try {
    resp = await fetch(OCR_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: ANON,
      },
      body: JSON.stringify({ facture_id: factureId, fichier_path: fichierPath, bucket }),
    });
  } catch {
    throw new Error("reseau");
  }
  let body: { ok?: boolean; erreur?: string; extracted?: OcrExtraction } | null = null;
  try {
    body = await resp.json();
  } catch {
    /* corps non-JSON */
  }
  if (!resp.ok || !body || body.ok === false) {
    throw new Error(body?.erreur ?? `http_${resp.status}`);
  }
  return (body.extracted ?? {}) as OcrExtraction;
}

// =====================================================================
// CLIENT INVOICES (factures) — v1
// =====================================================================

export type FactureRowClient = Tables<"factures">;
export type LigneFactureRow = Tables<"lignes_facture">;

export type FactureEnrichieClient = FactureRowClient & {
  client: { id: string; nom: string } | null;
  entite: { id: string; nom: string; couleur: string | null; code: string } | null;
};

export type FactureDetail = FactureRowClient & {
  client: Tables<"clients"> | null;
  entite: Tables<"entites"> | null;
  devis: { numero: string } | null;
  lignes: LigneFactureRow[];
};

const KEY_CLIENT = ["factures_client"] as const;
const LIST_SELECT = "*, client:clients(id, nom), entite:entites(id, nom, couleur, code)";
const DETAIL_SELECT =
  "*, client:clients(*), entite:entites(*), devis:devis(numero), lignes:lignes_facture(*)";

// Délai par défaut : 30 jours (délai légal par défaut entre professionnels en France
// en l'absence d'accord explicite — conditions_paiement du devis est un texte libre,
// pas un nombre de jours exploitable automatiquement, cf. spec).
const DELAI_ECHEANCE_JOURS = 30;

export function useFacturesList() {
  return useQuery({
    queryKey: [...KEY_CLIENT, "list"],
    queryFn: async (): Promise<FactureEnrichieClient[]> => {
      const { data, error } = await supabase
        .from("factures")
        .select(LIST_SELECT)
        .order("date_emission", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FactureEnrichieClient[];
    },
  });
}

// Existe-t-il déjà une facture pour ce devis ? (une facture = un devis, cf. spec —
// sert à masquer le bouton "Facturer" sur la fiche devis si c'est déjà fait.)
export function useFactureParDevis(devisId: string | undefined) {
  return useQuery({
    queryKey: [...KEY_CLIENT, "par-devis", devisId],
    queryFn: async (): Promise<FactureRowClient | null> => {
      const { data, error } = await supabase
        .from("factures")
        .select("*")
        .eq("devis_id", devisId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!devisId,
  });
}

// Fetch imprératif (pas un hook) : utilisé juste avant de générer le PDF depuis la
// liste, où on n'a pas déjà les lignes en mémoire comme sur la fiche devis.
export async function fetchFactureDetail(id: string): Promise<FactureDetail> {
  const { data, error } = await supabase
    .from("factures")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  const f = data as FactureDetail;
  f.lignes = [...(f.lignes ?? [])].sort((a, b) => a.ordre - b.ordre);
  return f;
}

// Crée la facture (+ copie figée des lignes) depuis un devis accepté. Le devis n'est
// jamais modifié par cette opération.
export function useCreateFactureClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (src: DevisDetail): Promise<FactureRowClient> => {
      const { data: numero, error: e0 } = await supabase.rpc("generer_numero_facture");
      if (e0) throw e0;
      const insert: TablesInsert<"factures"> = {
        numero: numero as string,
        devis_id: src.id,
        entite_id: src.entite_id,
        client_id: src.client_id,
        date_echeance: addDays(todayIso(), DELAI_ECHEANCE_JOURS),
        total_ht: src.total_ht,
        total_tva: src.total_tva,
        total_ttc: src.total_ttc,
        arrondi: src.arrondi,
      };
      const { data: f, error } = await supabase.from("factures").insert(insert).select().single();
      if (error) throw error;
      if (src.lignes.length) {
        const rows = src.lignes.map((l, i) => ({
          facture_id: f.id,
          ordre: i,
          libelle: l.libelle,
          unite: l.unite,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          remise_pct: l.remise_pct,
          taux_tva: l.taux_tva,
          total_ht: l.total_ht,
          est_option: l.est_option,
          est_titre: l.est_titre,
        }));
        const { error: e2 } = await supabase.from("lignes_facture").insert(rows);
        if (e2) throw e2;
      }
      return f;
    },
    onSuccess: (_f, src) => {
      qc.invalidateQueries({ queryKey: KEY_CLIENT });
      qc.invalidateQueries({ queryKey: [...KEY_CLIENT, "par-devis", src.id] });
    },
  });
}

export function useUpdateFactureStatut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: FactureRowClient["statut"] }) => {
      const { error } = await supabase
        .from("factures")
        .update({ statut, date_paiement: statut === "payee" ? todayIso() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CLIENT }),
  });
}

export function useUpdateFactureEcheance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date_echeance }: { id: string; date_echeance: string }) => {
      const { error } = await supabase.from("factures").update({ date_echeance }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_CLIENT }),
  });
}
