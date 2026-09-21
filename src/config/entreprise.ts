// =====================================================================
// CONFIGURATION PAR ENTREPRISE : le seul fichier à modifier pour livrer
// l'application à une nouvelle entreprise (avec le logo dans public/logos/,
// le texte des CGV dans src/lib/cgv.ts et les lignes de la table `entites`).
// Tout ce qui s'imprime sur les devis et factures, s'affiche sur la page de
// connexion ou figure dans les pages légales vient d'ici.
// Une valeur qui commence par « [À COMPLÉTER » s'affiche surlignée en jaune
// dans les pages légales, pour ne pas la publier par oubli.
// =====================================================================

export const A_COMPLETER = "[À COMPLÉTER";

// ---------------------------------------------------------------------
// L'entreprise qui utilise l'application (responsable du traitement des
// données au sens du RGPD). Imprimée sur les PDF et dans les pages légales.
// ---------------------------------------------------------------------
export const ENTREPRISE = {
  nom: "GP Ravalement",
  formeJuridique: "EURL au capital de 4 000 Euros",
  siret: "753 992 163 00018",
  rue: "6B Chemin Vieux de Montolieu",
  npaLocalite: "11310 SAINT-DENIS",
  adresse: "6B Chemin Vieux de Montolieu, 11310 Saint-Denis",
  // Forme imprimée dans le pied de page des PDF.
  adressePied: "6B Chemin Vieux de Montolieu — 11310 Saint-Denis",
  // ⚠️ IBAN à renseigner (donnée non publique, à fournir par l'entreprise).
  iban: "IBAN A RENSEIGNER",
  email: "pascalgasc@yahoo.fr",
  telephone: "06 11 30 50 13",
  representant: "[À COMPLÉTER : nom du représentant légal]",
};

// ---------------------------------------------------------------------
// Coordonnées et accroche par entité (clé = colonne `code` de la table
// `entites`). Le pied de page des PDF les affiche.
// ---------------------------------------------------------------------
export const CONTACT_PAR_ENTITE: Record<
  string,
  { tel: string; email: string; site: string; tagline: string }
> = {
  PRO: {
    tel: ENTREPRISE.telephone,
    email: ENTREPRISE.email,
    site: "",
    tagline: "Neuf & rénovation Isolation Peinture",
  },
};

// Logo imprimé sur les devis et factures, par code d'entité (fichier dans public/).
export const LOGOS_PAR_ENTITE: Record<string, string> = {
  PRO: "/logos/logo-pro.png",
};

// Nom du produit (titre de l'onglet, menu, pages légales). Le préfixe et le suffixe
// servent au logo du menu, écrit en deux tons.
export const APP = {
  nom: "GP HUB",
  prefixe: "GP",
  suffixe: "HUB",
};

// Marque affichée sur la page de connexion et la réinitialisation de mot de passe.
export const MARQUE = {
  nom: "GP",
  suffixe: "Ravalement",
  accroche: "La gestion de vos devis et chantiers, du premier prix à la marge réelle.",
  sousTitre: "Neuf & rénovation · Isolation · Peinture",
};

// ---------------------------------------------------------------------
// Toi, l'éditeur : sous-traitant de l'entreprise pour le RGPD. Identique
// pour tous tes clients, à renseigner une fois.
// ---------------------------------------------------------------------
export const EDITEUR = {
  nom: "[À COMPLÉTER : nom ou raison sociale]",
  statut: "[À COMPLÉTER : ex. entrepreneur individuel (micro-entreprise), SAS, EURL]",
  siret: "[À COMPLÉTER : SIRET]",
  adresse: "[À COMPLÉTER : adresse postale]",
  email: "[À COMPLÉTER : e-mail de contact]",
};

// Hébergement propre à chaque déploiement (un projet Supabase et un n8n par client).
export const HEBERGEMENT = {
  supabase: {
    region: "[À COMPLÉTER : région du projet Supabase, visible dans Project Settings]",
    adresse: "[À COMPLÉTER : adresse de Supabase, Inc. (voir supabase.com/privacy)]",
  },
  n8n: {
    hebergement: "[À COMPLÉTER : n8n Cloud (UE) ou serveur auto-hébergé, et où]",
  },
};
