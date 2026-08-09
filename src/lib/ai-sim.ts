import type { Prestation, LigneDevis, CategoriePrix } from './types';
import { resoudrePrixVente } from './store';

/**
 * Décomposition automatique d'un texte de visite en lignes de devis avec sous-tâches.
 * Recherche des mots-clés dans la description, identifie la prestation racine et
 * éclate ses sous-tâches.
 */

interface Keyword {
  match: RegExp;
  // identifie une prestation racine par CFC ou libellé approximatif
  picker: (prestations: Prestation[]) => Prestation | undefined;
  defaultQty: number;
  unit: string;
}

const KEYWORDS: Keyword[] = [
  { match: /\bcarrelage|carrel/i,  picker: ps => ps.find(p => /carrelage/i.test(p.libelle)), defaultQty: 10, unit: 'm2' },
  { match: /\bpeinture|peindre|repeindre|rafra/i, picker: ps => ps.find(p => /peinture/i.test(p.libelle)), defaultQty: 80, unit: 'm2' },
  { match: /\bparquet/i, picker: ps => ps.find(p => /parquet/i.test(p.libelle)), defaultQty: 30, unit: 'm2' },
  { match: /\bcloison|placo/i, picker: ps => ps.find(p => /cloison|placo/i.test(p.libelle)), defaultQty: 15, unit: 'm2' },
  { match: /\bélectricit|electricit|elec\b/i, picker: ps => ps.find(p => /électricit|electricit/i.test(p.libelle)), defaultQty: 12, unit: 'h' },
  { match: /\bplomberie|plombier|sanitaire/i, picker: ps => ps.find(p => /plomberie/i.test(p.libelle)), defaultQty: 12, unit: 'h' },
  { match: /\bterrasse/i, picker: ps => ps.find(p => /terrasse/i.test(p.libelle)), defaultQty: 25, unit: 'm2' },
  { match: /\bclôture|cloture/i, picker: ps => ps.find(p => /clôture/i.test(p.libelle)), defaultQty: 40, unit: 'ml' },
  { match: /\bpergola/i, picker: ps => ps.find(p => /pergola/i.test(p.libelle)), defaultQty: 18, unit: 'm2' },
  { match: /\bporte\b/i, picker: ps => ps.find(p => /porte intérieure/i.test(p.libelle)), defaultQty: 1, unit: 'piece' },
  { match: /\bcuisine/i, picker: ps => ps.find(p => /cuisine équipée/i.test(p.libelle)), defaultQty: 1, unit: 'forfait' },
];

// extraire un nombre + unité depuis le texte ex: "10 m²", "5 mètres", "3 pièces"
function extractQuantity(text: string, unit: string): number | undefined {
  const re = unit === 'm2'
    ? /(\d+(?:[.,]\d+)?)\s*(?:m²|m2|m\s*carrés?|metres?\s*carrés?)/i
    : unit === 'ml'
      ? /(\d+(?:[.,]\d+)?)\s*(?:ml|m(?:l)?\s*linéaires?|metres?\s*linéaires?)/i
      : unit === 'h'
        ? /(\d+(?:[.,]\d+)?)\s*(?:h|heures?)/i
        : /(\d+)\s*(?:pi[èe]ces?|portes?)/i;
  const m = text.match(re);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return undefined;
}

export interface AIDevisResult {
  lignes: LigneDevis[];
  notesIA: string;
}

let lineCounter = 0;
const nextLineId = () => `lg-${Date.now()}-${++lineCounter}`;

export function genererLignesDevis(description: string, prestations: Prestation[], categoriePrix: CategoriePrix): AIDevisResult {
  const lignes: LigneDevis[] = [];
  let ordre = 1;
  const matched: string[] = [];

  for (const k of KEYWORDS) {
    if (!k.match.test(description)) continue;
    const parent = k.picker(prestations);
    if (!parent) continue;
    matched.push(parent.libelle.toLowerCase());
    const qte = extractQuantity(description, k.unit) ?? k.defaultQty;
    const pu = resoudrePrixVente(parent, categoriePrix);
    // Ligne parente entête (qty 0 visuelle) — on l'ignore et on génère les sous-tâches
    if (parent.sousTaches && parent.sousTaches.length > 0) {
      // entête parent (titre)
      const parentLine: LigneDevis = {
        id: nextLineId(),
        ordre: ordre++,
        prestationId: parent.id,
        codeCFC: parent.codeCFC,
        libelle: parent.libelle,
        quantite: qte,
        unite: parent.unite,
        prixUnitaireHT: pu,
        prixRevientUnitaire: parent.prixRevient,
        tauxTVA: parent.tauxTVA,
        totalHT: Math.round(pu * qte * 100) / 100,
      };
      lignes.push(parentLine);
      // sous-tâches indicatives (qty proportionnelle, prix réparti)
      const partPu = Math.round((pu / parent.sousTaches.length) * 100) / 100;
      const partRev = Math.round((parent.prixRevient / parent.sousTaches.length) * 100) / 100;
      parent.sousTaches.forEach(st => {
        lignes.push({
          id: nextLineId(),
          ordre: ordre++,
          prestationParenteId: parentLine.id,
          codeCFC: parent.codeCFC,
          libelle: st,
          quantite: qte,
          unite: parent.unite,
          prixUnitaireHT: partPu,
          prixRevientUnitaire: partRev,
          tauxTVA: parent.tauxTVA,
          totalHT: Math.round(partPu * qte * 100) / 100,
          estSousTache: true,
        });
      });
      // décrémente la ligne parent pour qu'elle ne fasse pas double total
      parentLine.prixUnitaireHT = 0;
      parentLine.prixRevientUnitaire = 0;
      parentLine.totalHT = 0;
    } else {
      lignes.push({
        id: nextLineId(),
        ordre: ordre++,
        prestationId: parent.id,
        codeCFC: parent.codeCFC,
        libelle: parent.libelle,
        quantite: qte,
        unite: parent.unite,
        prixUnitaireHT: pu,
        prixRevientUnitaire: parent.prixRevient,
        tauxTVA: parent.tauxTVA,
        totalHT: Math.round(pu * qte * 100) / 100,
      });
    }
  }

  const notesIA = matched.length
    ? `Décomposition automatique : ${matched.join(', ')}. Quantités estimées depuis la description.`
    : `Aucun mot-clé reconnu. Ajoutez manuellement les prestations depuis la bibliothèque.`;

  return { lignes, notesIA };
}

/**
 * Applique une commande vocale de raffinement sur les lignes existantes.
 * Ex : "enlève la dépose", "fais-le au forfait"
 */
export function appliquerCommandeIA(commande: string, lignes: LigneDevis[]): { lignes: LigneDevis[]; message: string } {
  const c = commande.toLowerCase();

  if (/\benl[èe]ve|supprime|retire|sans/.test(c)) {
    // récupère un mot cible (ex: "dépose", "ponçage")
    const targets = ['dépose', 'depose', 'ponçage', 'poncage', 'impression', 'silicone', 'protection', 'finitions', 'joints'];
    const target = targets.find(t => c.includes(t));
    if (target) {
      const filtered = lignes.filter(l => !new RegExp(target, 'i').test(l.libelle));
      return { lignes: renum(filtered), message: `${lignes.length - filtered.length} ligne(s) supprimée(s) contenant "${target}".` };
    }
  }
  if (/\bforfait/.test(c)) {
    // bascule TOUTES les lignes en une seule ligne forfaitaire
    const totalHT = lignes.reduce((s, l) => s + l.totalHT, 0);
    const totalRevient = lignes.reduce((s, l) => s + l.prixRevientUnitaire * l.quantite, 0);
    const taux = lignes[0]?.tauxTVA ?? 8.1;
    const codeCFC = lignes[0]?.codeCFC;
    const lib = lignes.find(l => !l.estSousTache)?.libelle ?? 'Prestation';
    return {
      lignes: [{
        id: nextLineId(),
        ordre: 1,
        codeCFC,
        libelle: `${lib} selon détail — forfait`,
        quantite: 1,
        unite: 'forfait',
        prixUnitaireHT: Math.round(totalHT * 100) / 100,
        prixRevientUnitaire: Math.round(totalRevient * 100) / 100,
        tauxTVA: taux,
        totalHT: Math.round(totalHT * 100) / 100,
        estForfait: true,
      }],
      message: `Devis basculé en ligne forfaitaire.`,
    };
  }
  return { lignes, message: `Commande non reconnue. Essayez « enlève la dépose » ou « fais-le au forfait ».` };
}

function renum(lignes: LigneDevis[]): LigneDevis[] {
  return lignes.map((l, i) => ({ ...l, ordre: i + 1 }));
}

// ====== Transcriptions pré-écrites (mode upload) ======
const SAMPLE_TRANSCRIPTS = [
  "Rendez-vous chez M. Dubois, salle de bain à rénover, environ 10 m² de carrelage à refaire et peinture des murs.",
  "Visite chez Mme Perret : 40 ml de clôture à poser autour du jardin avec un portail motorisé.",
  "Demande pergola bioclimatique 18 m² chez les Berger pour leur terrasse côté lac.",
  "Rénovation cuisine famille Roulin : démolition d'une cloison, électricité, plomberie et nouvelle cuisine équipée.",
];

export function fakeTranscript(filename?: string): string {
  if (!filename) return SAMPLE_TRANSCRIPTS[0];
  const i = Math.abs(filename.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % SAMPLE_TRANSCRIPTS.length;
  return SAMPLE_TRANSCRIPTS[i];
}

// ====== Extraction PDF sous-traitant (bibliothèque) ======
export interface PrestationImportee {
  codeCFC: string;
  familleCFC: string;
  libelle: string;
  unite: 'm2' | 'ml' | 'piece' | 'forfait' | 'h';
  prixUnitaireHT: number;
}

const SOUS_TRAITANTS = [
  { nom: 'Carrelages Romand SA', specialty: 'carrelage' as const },
  { nom: 'Peinture Vaud Sàrl', specialty: 'peinture' as const },
  { nom: 'Élec Service SA', specialty: 'elec' as const },
  { nom: 'Bois & Terrasse', specialty: 'terrasse' as const },
  { nom: 'Métal Pro Clôtures', specialty: 'cloture' as const },
];

const TEMPLATES: Record<string, PrestationImportee[]> = {
  carrelage: [
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Carrelage grès cérame 60x60', unite: 'm2', prixUnitaireHT: 88 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Carrelage faïence murale 30x60', unite: 'm2', prixUnitaireHT: 72 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Plinthes carrelage assorties', unite: 'ml', prixUnitaireHT: 22 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Joints époxy haute résistance', unite: 'm2', prixUnitaireHT: 18 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Dépose ancien carrelage', unite: 'm2', prixUnitaireHT: 35 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Mosaïque verre douche', unite: 'm2', prixUnitaireHT: 145 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Profilé alu finition', unite: 'ml', prixUnitaireHT: 14 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Receveur douche maçonné', unite: 'forfait', prixUnitaireHT: 480 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Étanchéité SPEC sous carrelage', unite: 'm2', prixUnitaireHT: 28 },
    { codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Travaux annexes carreleur', unite: 'h', prixUnitaireHT: 85 },
  ],
  peinture: [
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Peinture mat lessivable 2 couches', unite: 'm2', prixUnitaireHT: 32 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Peinture satinée', unite: 'm2', prixUnitaireHT: 38 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Sous-couche universelle', unite: 'm2', prixUnitaireHT: 12 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Enduit de rebouchage', unite: 'm2', prixUnitaireHT: 8 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Ponçage support', unite: 'm2', prixUnitaireHT: 11 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Protection des sols', unite: 'forfait', prixUnitaireHT: 220 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Peinture plafond blanc mat', unite: 'm2', prixUnitaireHT: 28 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Laque boiseries', unite: 'm2', prixUnitaireHT: 65 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Papier peint pose', unite: 'm2', prixUnitaireHT: 42 },
    { codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Heure de peintre', unite: 'h', prixUnitaireHT: 78 },
  ],
  elec: [
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Pose prise simple', unite: 'piece', prixUnitaireHT: 85 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Pose interrupteur va-et-vient', unite: 'piece', prixUnitaireHT: 95 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Spot LED encastré', unite: 'piece', prixUnitaireHT: 65 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Tableau électrique 12 modules', unite: 'piece', prixUnitaireHT: 480 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Câblage 3G2.5 par mètre', unite: 'ml', prixUnitaireHT: 14 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Mise en service et contrôle', unite: 'forfait', prixUnitaireHT: 320 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Heure électricien qualifié', unite: 'h', prixUnitaireHT: 105 },
    { codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Prise étanche extérieure', unite: 'piece', prixUnitaireHT: 125 },
  ],
  terrasse: [
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Lame bois ipé 145x21', unite: 'm2', prixUnitaireHT: 175 },
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Lambourdes exotiques', unite: 'm2', prixUnitaireHT: 38 },
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Plots réglables', unite: 'piece', prixUnitaireHT: 12 },
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Pose lames terrasse', unite: 'm2', prixUnitaireHT: 65 },
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Finitions périphériques', unite: 'ml', prixUnitaireHT: 28 },
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Traitement bois saturateur', unite: 'm2', prixUnitaireHT: 18 },
    { codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Heure de menuisier ext.', unite: 'h', prixUnitaireHT: 92 },
  ],
  cloture: [
    { codeCFC: '414.0', familleCFC: 'Clôtures', libelle: 'Panneau rigide H180 galvanisé', unite: 'ml', prixUnitaireHT: 78 },
    { codeCFC: '414.0', familleCFC: 'Clôtures', libelle: 'Poteau galvanisé H200', unite: 'piece', prixUnitaireHT: 85 },
    { codeCFC: '414.0', familleCFC: 'Clôtures', libelle: 'Scellement béton poteau', unite: 'piece', prixUnitaireHT: 45 },
    { codeCFC: '414.0', familleCFC: 'Clôtures', libelle: 'Pose panneau rigide', unite: 'ml', prixUnitaireHT: 35 },
    { codeCFC: '415.0', familleCFC: 'Portails', libelle: 'Portail battant alu 3.5m', unite: 'piece', prixUnitaireHT: 1850 },
    { codeCFC: '415.0', familleCFC: 'Portails', libelle: 'Motorisation portail', unite: 'piece', prixUnitaireHT: 980 },
    { codeCFC: '414.0', familleCFC: 'Clôtures', libelle: 'Pose et réglage portail', unite: 'forfait', prixUnitaireHT: 580 },
  ],
};

export function simulerImportPDF(filename: string): { fournisseur: string; prestations: PrestationImportee[] } {
  const idx = Math.abs(filename.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % SOUS_TRAITANTS.length;
  const st = SOUS_TRAITANTS[idx];
  return { fournisseur: st.nom, prestations: TEMPLATES[st.specialty] };
}

export function simulerImportExcel(): PrestationImportee[] {
  // Mix de prestations pour un contrat-cadre grand compte retail
  return [
    ...TEMPLATES.peinture.slice(0, 5),
    ...TEMPLATES.elec.slice(0, 4),
  ];
}

// ====== Extraction facture fournisseur (en-tête + montant) ======
const FOURNISSEURS_FACT = ['Sanitas Troesch', 'Geberit', 'Hilti Schweiz', 'Sika Suisse', 'Knauf', 'Saint-Gobain', 'Rexel', 'Holcim'];

export function extraireFactureFournisseur(filename: string): { fournisseur: string; numeroFacture: string; date: string; montantHT: number; tauxTVA: number; montantTTC: number } {
  const seed = Math.abs(filename.split('').reduce((s, c) => s + c.charCodeAt(0), 0));
  const fournisseur = FOURNISSEURS_FACT[seed % FOURNISSEURS_FACT.length];
  const numero = `F-2026-${1000 + (seed % 9000)}`;
  const d = new Date();
  d.setDate(d.getDate() - (seed % 21));
  const date = d.toISOString().slice(0, 10);
  const montantHT = Math.round((800 + (seed % 12) * 580 + Math.random() * 500) * 100) / 100;
  const tauxTVA = 8.1;
  const montantTTC = Math.round(montantHT * (1 + tauxTVA / 100) * 100) / 100;
  return { fournisseur, numeroFacture: numero, date, montantHT, tauxTVA, montantTTC };
}
