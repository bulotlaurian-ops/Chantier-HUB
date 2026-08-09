export type EntiteCode = 'PRO' | 'EXT' | 'INT';

export interface Entite {
  id: string;
  nom: string;
  code: EntiteCode;
  couleur: string; // hex
}

export type CategoriePrix = 'B2B' | 'prive' | 'luxe';

export interface Client {
  id: string;
  nom: string;
  categoriePrix: CategoriePrix;
  email: string;
  telephone: string;
  ville: string;
  adresse: string;
  entiteId: string;
  createdAt: string;
}

export interface Ouvrier {
  id: string;
  nom: string;
  prenom: string;
  tauxHoraire: number;
  actif: boolean;
}

export type Unite = 'm2' | 'ml' | 'piece' | 'forfait' | 'h';

export interface SousPoste {
  id: string;
  libelle: string;
  unite: Unite;
  prixBrut: number;
  tempsParUnite: number; // heures par unité
}

export interface Poste {
  id: string;
  libelle: string;
  unite: Unite;
  prixBrut: number; // prix par unité de la prestation parente
  tempsParUnite: number;
  sousPostes?: SousPoste[];
}

export interface Prestation {
  id: string;
  entiteId: string;
  codeCFC: string;
  familleCFC: string;
  libelle: string;
  unite: Unite;
  prixB2B: number;
  prixPrive: number;
  prixLuxe: number;
  prixRevient: number;
  tauxTVA: number;
  tempsParUnite?: number; // estimation globale
  sousTaches?: string[]; // legacy (ai-sim)
  postes?: Poste[]; // hiérarchie 3 niveaux
  actif: boolean;
}

export interface LigneDevis {
  id: string;
  ordre: number;
  prestationId?: string;
  posteId?: string;
  codeCFC?: string;
  libelle: string;
  quantite: number;
  unite: string;
  prixUnitaireHT: number;
  prixRevientUnitaire: number;
  tauxTVA: number;
  totalHT: number;
  tempsParUnite?: number;
  estSousTache?: boolean;
  estPoste?: boolean;
  prestationParenteId?: string;
  estForfait?: boolean;
}

export type StatutDevis = 'brouillon' | 'envoye' | 'accepte' | 'refuse';

export interface Devis {
  id: string;
  numero: string;
  entiteId: string;
  clientId: string;
  chantierId?: string;
  dateCreation: string;
  dateValidite: string;
  statut: StatutDevis;
  lignes: LigneDevis[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  coutRevientTotal: number;
  margePrevisionnelle: number;
  tauxMarge: number;
  notesIA?: string;
  createdAt: string;
}

export type StatutChantier = 'prospect' | 'signe' | 'en_cours' | 'termine';

export interface Chantier {
  id: string;
  reference: string;
  nom: string;
  entiteId: string;
  clientId: string;
  ville: string;
  adresse: string;
  dateDebut: string;
  dateFinPrevue: string;
  statut: StatutChantier;
  devisIds: string[];
  createdAt: string;
}

export interface PointageHeure {
  id: string;
  chantierId: string;
  ouvrierId: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  heuresTravaillees: number;
  inclutTrajet: boolean;
  note?: string;
  geolocalisation: { latitude: number; longitude: number; surSite: boolean };
  createdAt: string;
}

export interface JourneeOuvrier {
  id: string; // ouvrierId_date
  ouvrierId: string;
  date: string;
  totalHeures: number;
  complete: boolean;
  verrouillee: boolean;
  motifDeblocage?: string;
}

export interface FactureFournisseur {
  id: string;
  chantierId: string;
  fournisseur: string;
  numeroFacture: string;
  date: string;
  montantHT: number;
  tauxTVA: number;
  montantTTC: number;
  nomFichier: string;
  statut: 'a_valider' | 'valide';
  uploadedAt: string;
}

export type Role = 'admin' | 'conducteur' | 'ouvrier';

export interface ActivityItem {
  id: string;
  type: 'devis' | 'facture' | 'pointage' | 'chantier';
  titre: string;
  description: string;
  entiteId?: string;
  createdAt: string;
}

export interface AppState {
  entites: Entite[];
  clients: Client[];
  ouvriers: Ouvrier[];
  prestations: Prestation[];
  devis: Devis[];
  chantiers: Chantier[];
  pointages: PointageHeure[];
  journees: JourneeOuvrier[];
  factures: FactureFournisseur[];
  activity: ActivityItem[];
  currentRole: Role;
  currentEntiteId: string | 'all';
  currentOuvrierId: string;
  dureeJourneeMin: number;
  validiteDevisJours: number;
  conditionsDevis: string;
  mentionsLegales: string;
}
