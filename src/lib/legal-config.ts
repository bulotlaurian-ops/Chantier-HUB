// Données lues par les pages légales. L'identité de l'entreprise, de l'éditeur
// et des hébergeurs vient de src/config/entreprise.ts (seul fichier à modifier).
import { A_COMPLETER, ENTREPRISE, EDITEUR, HEBERGEMENT } from "@/config/entreprise";

export const LEGAL = {
  misAJour: "21 septembre 2026",
  entreprise: {
    nom: ENTREPRISE.nom,
    forme: ENTREPRISE.formeJuridique,
    siret: ENTREPRISE.siret,
    adresse: ENTREPRISE.adresse,
    email: ENTREPRISE.email,
    telephone: ENTREPRISE.telephone,
    representant: ENTREPRISE.representant,
  },
  editeur: EDITEUR,
  supabase: HEBERGEMENT.supabase,
  n8n: HEBERGEMENT.n8n,
};

export function estAcompleter(valeur: string): boolean {
  return valeur.startsWith(A_COMPLETER);
}
