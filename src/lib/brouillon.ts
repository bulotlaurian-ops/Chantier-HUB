// Brouillons locaux de saisie (localStorage) — retour client : quitter l'app
// (chercher une adresse dans un autre onglet, retour arrière…) faisait perdre
// tout ce qui était tapé. Chaque formulaire important écrit sa saisie en continu
// sous une clé dédiée, la restaure à la réouverture et l'efface à l'enregistrement.
// localStorage est par navigateur : aucun risque de fuite entre utilisateurs.

const PREFIXE = 'chantier.brouillon.';

export const CLE_BROUILLON_DEVIS = `${PREFIXE}devis`;
export const CLE_BROUILLON_CLIENT = `${PREFIXE}client`;
export const CLE_BROUILLON_CHANTIER = `${PREFIXE}chantier`;
export const CLE_BROUILLON_CHANTIER_GLOBAL = `${PREFIXE}chantier-global`;

export function lireBrouillon<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

export function ecrireBrouillon(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // stockage plein ou indisponible : on ne bloque jamais la saisie pour ça
  }
}

export function effacerBrouillon(cle: string): void {
  try {
    localStorage.removeItem(cle);
  } catch {
    // ignore
  }
}
