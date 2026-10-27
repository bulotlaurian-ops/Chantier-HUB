import type { Database } from "./database.types";

// =====================================================================
// Réforme facture électronique (migration 038) — règles partagées.
// Particulier : PDF/papier inchangé, ventes remontées en e-reporting.
// Professionnel : SIREN obligatoire, facture électronique au 1er sept. 2027.
// =====================================================================

export type TypeClient = Database["public"]["Enums"]["type_client"];
export type CategorieOperation = Database["public"]["Enums"]["categorie_operation"];

export const TYPE_CLIENT_LABEL: Record<TypeClient, string> = {
  particulier: "Particulier",
  professionnel: "Professionnel",
};

export const CATEGORIE_OPERATION_LABEL: Record<CategorieOperation, string> = {
  services: "Prestation de services",
  biens: "Livraison de biens",
  mixte: "Mixte (biens et services)",
};

// Travaux du bâtiment = prestation de services dans l'immense majorité des cas.
export const CATEGORIE_OPERATION_DEFAUT: CategorieOperation = "services";

// Mention imprimée sur une facture en autoliquidation (sous-traitance BTP).
// À faire valider par le comptable avant tout usage réel.
export const MENTION_AUTOLIQUIDATION =
  "Autoliquidation, TVA due par le preneur (art. 283-2 nonies du CGI).";

export const MENTION_TVA_DEBITS = "Option pour le paiement de la taxe d'après les débits.";

// Saisie tolérante : « 123 456 789 » → « 123456789 ».
export function normaliserSiren(saisie: string): string {
  return saisie.replace(/\s+/g, "");
}

// SIREN valide = 9 chiffres + clé de Luhn (même contrôle que l'INSEE).
export function sirenValide(siren: string): boolean {
  if (!/^[0-9]{9}$/.test(siren)) return false;
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(siren[8 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}

export function formatSiren(siren: string): string {
  return siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}
