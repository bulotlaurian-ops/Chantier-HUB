// =====================================================================
// Devis assisté par IA — capture audio + appel de l'Edge Function relais.
// L'IA ne renvoie QUE de la structure (désignations, unités, quantités,
// prestation_id pour mapping) ; les prix sont résolus par l'app via le circuit
// de tarification existant (ligneDepuisPrestation). Cf. n8n/n8n-workflow-devis-assiste.md.
// =====================================================================
import { supabase } from "@/lib/supabase";

// ---------- Types du contrat ----------
export type Confiance = "haute" | "moyenne" | "basse";

export interface Candidat {
  prestation_id: string;
  libelle: string;
}

// Ligne proposée (création) ou embarquée dans une opération d'ajout (édition).
export interface LigneProposee {
  type: "titre" | "prestation";
  designation: string;
  prestation_id?: string | null;
  unite?: string | null;
  quantite?: number;
  est_option?: boolean;
  confiance?: Confiance;
  candidats?: Candidat[];
}

// Ligne du devis courant envoyée en mode édition (pour ciblage par id).
export interface LigneCourante {
  id: string;
  designation: string;
  unite: string | null;
  quantite: number;
  est_titre: boolean;
  est_option: boolean;
}

export type OperationPatch =
  | { op: "ajouter_ligne"; position?: "fin" | "debut" | number; ligne: LigneProposee }
  | { op: "modifier_ligne"; ligne_id: string; champs: ChampsModifiables }
  | { op: "supprimer_ligne"; ligne_id: string }
  | {
      op: "ambigu";
      message: string;
      candidats_ligne_ids: string[];
      operation_en_attente: OperationPatch;
    };

export interface ChampsModifiables {
  quantite?: number;
  unite?: string | null;
  designation?: string;
  est_option?: boolean;
}

export interface DevisIACreation {
  ok: true;
  mode: "creation";
  transcription: string | null;
  lignes: LigneProposee[];
  avertissements: string[];
}
export interface DevisIAEdition {
  ok: true;
  mode: "edition";
  transcription: string | null;
  operations: OperationPatch[];
  avertissements: string[];
}
export type DevisIAResultat = DevisIACreation | DevisIAEdition;

export interface DevisIAErreurBody {
  ok: false;
  erreur: string;
}

// ---------- Contexte + paramètres d'appel ----------
export interface DevisIAContexte {
  entite_code: string;
  client: { id: string; nom: string; categorie_tarifaire: string | null };
  devis_courant?: { lignes: LigneCourante[] };
}

export interface CallDevisIAParams {
  mode: "creation" | "edition";
  inputType: "audio" | "texte";
  texte?: string;
  audioBlob?: Blob;
  contexte: DevisIAContexte;
}

// Erreur typée : `code` reprend l'`erreur` du contrat (transcription_echouee,
// llm_indisponible, payload_invalide, role_non_autorise, reseau, timeout…).
export class DevisIAError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "DevisIAError";
  }
}

// ---------- Capture audio (MediaRecorder webm/opus) ----------
export interface Recorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export async function startRecording(): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new DevisIAError("micro_indisponible", "Micro non disponible");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();
  const cleanup = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: "audio/webm" }));
        };
        rec.stop();
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* déjà arrêté */
      }
      cleanup();
    },
  };
}

// ---------- Appel de l'Edge Function ----------
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/devis-assiste`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

export async function callDevisIA(p: CallDevisIAParams): Promise<DevisIAResultat> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new DevisIAError("non_authentifie", "Session expirée — reconnecte-toi.");

  let audio_base64: string | null = null;
  if (p.inputType === "audio") {
    if (!p.audioBlob) throw new DevisIAError("audio_manquant");
    audio_base64 = await blobToBase64(p.audioBlob);
  }

  const payload = {
    mode: p.mode,
    input_type: p.inputType,
    texte: p.inputType === "texte" ? (p.texte ?? "") : null,
    audio_base64,
    contexte: p.contexte,
  };

  let resp: Response;
  try {
    resp = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: ANON,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new DevisIAError("reseau", "Connexion impossible — réessaie ou saisis manuellement.");
  }

  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    /* corps non-JSON */
  }

  if (!resp.ok) {
    throw new DevisIAError((body as DevisIAErreurBody)?.erreur ?? `http_${resp.status}`);
  }
  if (!body || (body as { ok?: boolean }).ok === false) {
    throw new DevisIAError((body as DevisIAErreurBody)?.erreur ?? "reponse_invalide");
  }
  return body as DevisIAResultat;
}

// =====================================================================
// Voie B — Import d'un devis sous-traitant (PDF) via OCR (workflow n8n dédié).
// Les prix viennent du sous-traitant (pas de la biblio) → ni prestation_id, ni confiance.
// =====================================================================
export interface LigneDevisST {
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number;
}
export interface DevisSTResultat {
  fournisseur: string | null;
  lignes: LigneDevisST[];
  avertissements: string[];
}

const OCR_ST_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-devis-st`;

export async function callOcrDevisST(p: {
  fichierBase64: string;
  mimeType: string;
  contexte: DevisIAContexte;
}): Promise<DevisSTResultat> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new DevisIAError("non_authentifie", "Session expirée — reconnecte-toi.");

  let resp: Response;
  try {
    resp = await fetch(OCR_ST_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: ANON,
      },
      body: JSON.stringify({
        fichier_base64: p.fichierBase64,
        mime_type: p.mimeType,
        contexte: p.contexte,
      }),
    });
  } catch {
    throw new DevisIAError("reseau", "Connexion impossible — réessaie ou saisis manuellement.");
  }

  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    /* corps non-JSON */
  }

  if (!resp.ok)
    throw new DevisIAError((body as DevisIAErreurBody)?.erreur ?? `http_${resp.status}`);
  if (!body || (body as { ok?: boolean }).ok === false) {
    throw new DevisIAError((body as DevisIAErreurBody)?.erreur ?? "reponse_invalide");
  }
  const b = body as {
    fournisseur?: string | null;
    lignes?: LigneDevisST[];
    avertissements?: string[];
  };
  return {
    fournisseur: b.fournisseur ?? null,
    lignes: Array.isArray(b.lignes) ? b.lignes : [],
    avertissements: Array.isArray(b.avertissements) ? b.avertissements : [],
  };
}

// Messages utilisateur par code d'erreur (fallback : saisie manuelle).
export function messageErreurIA(code: string): string {
  switch (code) {
    case "transcription_echouee":
      return "Transcription impossible. Reformule ou saisis le texte.";
    case "llm_indisponible":
      return "L'assistant IA est momentanément indisponible.";
    case "payload_invalide":
      return "Requête invalide.";
    case "aucune_operation":
      return "Aucune modification détectée dans la consigne.";
    case "role_non_autorise":
      return "Action réservée aux administrateurs et conducteurs.";
    case "non_authentifie":
      return "Session expirée — reconnecte-toi.";
    case "timeout":
      return "L'analyse a pris trop de temps. Réessaie.";
    case "reseau":
      return "Connexion impossible.";
    default:
      return "Échec de l'assistance IA. Tu peux saisir manuellement.";
  }
}
