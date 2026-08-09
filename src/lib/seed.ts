import type { AppState, Entite, Client, Ouvrier, Prestation, Devis, Chantier, PointageHeure, JourneeOuvrier, FactureFournisseur, ActivityItem, LigneDevis } from './types';
import { addDays, isoDate } from './format';

// Date d'ancrage de la démo : 21 mai 2026 (fenêtre 01.03.2026 → 21.05.2026)
export const DEMO_TODAY_ISO = '2026-05-21';
const today = new Date(DEMO_TODAY_ISO + 'T12:00:00');
const t = (off: number) => addDays(isoDate(today), off);

// Helper pour générer 3 prix de vente cohérents à partir du prix B2B
function prix(b2b: number, revientPct = 0.62) {
  return {
    prixB2B: b2b,
    prixPrive: Math.round(b2b * 1.15 * 100) / 100,
    prixLuxe: Math.round(b2b * 1.40 * 100) / 100,
    prixRevient: Math.round(b2b * revientPct * 100) / 100,
  };
}

function mkLigne(p: Prestation, qte: number, categoriePrix: 'B2B' | 'prive' | 'luxe', ordre: number, opts: Partial<LigneDevis> = {}): LigneDevis {
  const pu = categoriePrix === 'B2B' ? p.prixB2B : categoriePrix === 'prive' ? p.prixPrive : p.prixLuxe;
  return {
    id: `lg-${Math.random().toString(36).slice(2, 9)}`,
    ordre,
    prestationId: p.id,
    codeCFC: p.codeCFC,
    libelle: p.libelle,
    quantite: qte,
    unite: p.unite,
    prixUnitaireHT: pu,
    prixRevientUnitaire: p.prixRevient,
    tauxTVA: p.tauxTVA,
    totalHT: Math.round(pu * qte * 100) / 100,
    ...opts,
  };
}

function recalcDevis(d: Omit<Devis, 'totalHT' | 'totalTVA' | 'totalTTC' | 'coutRevientTotal' | 'margePrevisionnelle' | 'tauxMarge'>): Devis {
  const totalHT = d.lignes.reduce((s, l) => s + l.totalHT, 0);
  const totalTVA = Math.round(d.lignes.reduce((s, l) => s + l.totalHT * (l.tauxTVA / 100), 0) * 100) / 100;
  const totalTTC = Math.round((totalHT + totalTVA) * 100) / 100;
  const coutRevientTotal = Math.round(d.lignes.reduce((s, l) => s + l.prixRevientUnitaire * l.quantite, 0) * 100) / 100;
  const margePrevisionnelle = Math.round((totalHT - coutRevientTotal) * 100) / 100;
  const tauxMarge = totalHT > 0 ? Math.round((margePrevisionnelle / totalHT) * 1000) / 10 : 0;
  return { ...d, totalHT: Math.round(totalHT * 100) / 100, totalTVA, totalTTC, coutRevientTotal, margePrevisionnelle, tauxMarge };
}

export function makeSeed(): AppState {
  const entites: Entite[] = [
    { id: 'e-pro', nom: 'ARTISAN PRO', code: 'PRO', couleur: '#1F2937' },
    { id: 'e-int', nom: 'INTERIEUR', code: 'INT', couleur: '#8A6A4B' },
    { id: 'e-ext', nom: 'EXTERIEUR', code: 'EXT', couleur: '#3F6C51' },
  ];

  const clients: Client[] = [
    // Les 6 clients du cadrage démo
    { id: 'c-dubois', nom: 'Famille Dubois', categoriePrix: 'prive', email: 'p.dubois@email.example', telephone: '+41 21 555 00 00', ville: 'Lausanne', adresse: 'Av. de la Gare 45', entiteId: 'e-int', createdAt: t(-90) },
    { id: 'c-nordia', nom: 'Boutique Nordia SA', categoriePrix: 'B2B', email: 'facturation@nordia.example', telephone: '+41 21 555 00 00', ville: 'Lausanne', adresse: 'Rue du Bourg 12', entiteId: 'e-pro', createdAt: t(-180) },
    { id: 'c-berger', nom: 'M. et Mme Berger', categoriePrix: 'luxe', email: 'berger@email.example', telephone: '+41 21 555 00 00', ville: 'Montreux', adresse: 'Chemin du Lac 8', entiteId: 'e-ext', createdAt: t(-50) },
    { id: 'c-velora', nom: 'Enseigne Velora', categoriePrix: 'B2B', email: 'admin@velora.example', telephone: '+41 21 555 00 00', ville: 'Genève', adresse: 'Rue du Rhône 45', entiteId: 'e-pro', createdAt: t(-160) },
    { id: 'c-roulin', nom: 'Famille Roulin', categoriePrix: 'prive', email: 'roulin@email.example', telephone: '+41 21 555 00 00', ville: 'Pully', adresse: 'Av. de Tivoli 22', entiteId: 'e-int', createdAt: t(-60) },
    { id: 'c-perret', nom: 'Mme Perret', categoriePrix: 'prive', email: 'perret@email.example', telephone: '+41 21 555 00 00', ville: 'Vevey', adresse: 'Rte de Lavaux 14', entiteId: 'e-ext', createdAt: t(-40) },
    // Clients additionnels pour densité
    { id: 'c-distrival', nom: 'Groupe Distrival', categoriePrix: 'B2B', email: 'travaux@distrival.example', telephone: '+41 21 555 00 00', ville: 'Berne', adresse: 'Thiersteinerallee 14', entiteId: 'e-pro', createdAt: t(-120) },
    { id: 'c-laurent', nom: 'M. Laurent', categoriePrix: 'luxe', email: 'laurent@email.example', telephone: '+41 21 555 00 00', ville: 'Gstaad', adresse: 'Promenade 3', entiteId: 'e-int', createdAt: t(-30) },
  ];

  const ouvriers: Ouvrier[] = [
    { id: 'o-luc', nom: 'Bernard', prenom: 'Luc', tauxHoraire: 95, actif: true },
    { id: 'o-paul', nom: 'Girard', prenom: 'Paul', tauxHoraire: 105, actif: true },
    { id: 'o-hugo', nom: 'Moreau', prenom: 'Hugo', tauxHoraire: 88, actif: true },
    { id: 'o-nino', nom: 'Lambert', prenom: 'Nino', tauxHoraire: 92, actif: true },
  ];

  // Bibliothèque — sous-tâches définies pour les keywords clés du devis vocal
  const stCarrelage = [
    "Dépose de l'ancien carrelage",
    'Ponçage et préparation du support',
    "Couche d'impression",
    'Fourniture du carrelage',
    'Pose du carrelage',
    'Fourniture et réalisation des joints',
    'Joints silicone et finitions',
  ];
  const stPeinture = [
    'Protection des sols et mobilier',
    'Préparation des murs (rebouchage, ponçage)',
    "Couche d'impression",
    'Application 1ère couche',
    'Application 2ème couche de finition',
  ];
  const stParquet = [
    'Dépose de l\'ancien revêtement',
    'Préparation et nivellement du support',
    'Pose sous-couche acoustique',
    'Fourniture du parquet',
    'Pose du parquet',
    'Pose des plinthes et finitions',
  ];
  const stCloison = [
    'Traçage et préparation',
    'Pose ossature métallique',
    'Pose plaques BA13 côté 1',
    'Pose isolation laine minérale',
    'Pose plaques BA13 côté 2',
    'Bandes, enduit et ponçage',
  ];
  const stElec = [
    'Étude et schéma de principe',
    'Tirage des câbles',
    'Pose appareillage et prises',
    'Raccordement tableau',
    'Mise en service et contrôle',
  ];
  const stPlomberie = [
    "Dépose de l'existant",
    'Modification des arrivées et évacuations',
    'Pose des équipements sanitaires',
    'Raccordements et étanchéité',
    'Mise en eau et tests',
  ];
  const stTerrasse = [
    'Préparation du terrain',
    'Pose des plots et lambourdes',
    'Fourniture des lames',
    'Pose des lames',
    'Finitions et bouchons de vis',
  ];
  const stCloture = [
    'Implantation et traçage',
    'Scellement des poteaux',
    'Fourniture des panneaux',
    'Pose des panneaux',
    'Finitions et nettoyage',
  ];
  const stPergola = [
    'Étude technique et plan d\'implantation',
    'Préparation du sol et scellement',
    'Fourniture structure aluminium',
    'Montage de la structure',
    'Pose des lames orientables et motorisation',
    'Raccordement électrique et mise en service',
  ];

  const prestations: Prestation[] = [
    // === Artisan Pro & Confort (B2B retail) ===
    { id: 'p-pro-1', entiteId: 'e-pro', codeCFC: '281.0', familleCFC: 'Revêtements de sol', libelle: 'Sol PVC haute trafic boutique', unite: 'm2', ...prix(120), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-2', entiteId: 'e-pro', codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Peinture murs et plafonds boutique', unite: 'm2', ...prix(34), tauxTVA: 8.1, sousTaches: stPeinture, actif: true },
    { id: 'p-pro-3', entiteId: 'e-pro', codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Éclairage LED rail triphasé', unite: 'piece', ...prix(145), tauxTVA: 8.1, sousTaches: stElec, actif: true },
    { id: 'p-pro-4', entiteId: 'e-pro', codeCFC: '273.0', familleCFC: 'Menuiserie intérieure', libelle: 'Comptoir caisse sur mesure', unite: 'forfait', ...prix(3500, 0.55), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-5', entiteId: 'e-pro', codeCFC: '291.0', familleCFC: 'Signalétique', libelle: 'Signalétique boutique complète', unite: 'forfait', ...prix(1200, 0.5), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-6', entiteId: 'e-pro', codeCFC: '202.0', familleCFC: 'Démolition', libelle: 'Démolition aménagement existant', unite: 'forfait', ...prix(2500, 0.6), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-7', entiteId: 'e-pro', codeCFC: '281.1', familleCFC: 'Revêtements de sol', libelle: 'Dalles moquette professionnelles', unite: 'm2', ...prix(62), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-8', entiteId: 'e-pro', codeCFC: '221.0', familleCFC: 'Façade & vitrine', libelle: 'Vitrine sécurisée verre feuilleté', unite: 'ml', ...prix(1180), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-9', entiteId: 'e-pro', codeCFC: '258.0', familleCFC: 'Maintenance', libelle: 'Intervention maintenance boutique', unite: 'h', ...prix(115, 0.45), tauxTVA: 8.1, actif: true },
    { id: 'p-pro-10', entiteId: 'e-pro', codeCFC: '271.0', familleCFC: 'Plâtrerie', libelle: 'Cloison sèche placo BA13', unite: 'm2', ...prix(68), tauxTVA: 8.1, sousTaches: stCloison, actif: true },

    // === Maill Intérieure (rénovation intérieur) ===
    { id: 'p-mint-1', entiteId: 'e-int', codeCFC: '281.5', familleCFC: 'Revêtements de sol', libelle: 'Carrelage sol/mur', unite: 'm2', ...prix(95), tauxTVA: 8.1, sousTaches: stCarrelage, actif: true },
    { id: 'p-mint-2', entiteId: 'e-int', codeCFC: '281.2', familleCFC: 'Revêtements de sol', libelle: 'Pose parquet flottant chêne', unite: 'm2', ...prix(85), tauxTVA: 8.1, sousTaches: stParquet, actif: true },
    { id: 'p-mint-3', entiteId: 'e-int', codeCFC: '285.0', familleCFC: 'Peinture & tapisserie', libelle: 'Peinture murs et plafond 2 couches', unite: 'm2', ...prix(35), tauxTVA: 8.1, sousTaches: stPeinture, actif: true },
    { id: 'p-mint-4', entiteId: 'e-int', codeCFC: '271.0', familleCFC: 'Plâtrerie', libelle: 'Cloison placo BA13 avec isolation', unite: 'm2', ...prix(72), tauxTVA: 8.1, sousTaches: stCloison, actif: true },
    { id: 'p-mint-5', entiteId: 'e-int', codeCFC: '232.0', familleCFC: 'Électricité', libelle: 'Travaux électricité qualifié', unite: 'h', ...prix(105, 0.5), tauxTVA: 8.1, sousTaches: stElec, actif: true },
    { id: 'p-mint-6', entiteId: 'e-int', codeCFC: '251.0', familleCFC: 'Sanitaire', libelle: 'Travaux plomberie qualifié', unite: 'h', ...prix(115, 0.5), tauxTVA: 8.1, sousTaches: stPlomberie, actif: true },
    { id: 'p-mint-7', entiteId: 'e-int', codeCFC: '273.0', familleCFC: 'Menuiserie intérieure', libelle: 'Porte intérieure standard posée', unite: 'piece', ...prix(320), tauxTVA: 8.1, actif: true },
    { id: 'p-mint-8', entiteId: 'e-int', codeCFC: '258.5', familleCFC: 'Cuisine', libelle: 'Cuisine équipée standard', unite: 'forfait', ...prix(18000, 0.7), tauxTVA: 8.1, actif: true },
    { id: 'p-mint-9', entiteId: 'e-int', codeCFC: '258.6', familleCFC: 'Cuisine', libelle: 'Cuisine équipée haut de gamme', unite: 'forfait', ...prix(38000, 0.72), tauxTVA: 8.1, actif: true },
    { id: 'p-mint-10', entiteId: 'e-int', codeCFC: '202.0', familleCFC: 'Démolition', libelle: 'Dépose cloison existante', unite: 'forfait', ...prix(480, 0.55), tauxTVA: 8.1, actif: true },
    { id: 'p-mint-11', entiteId: 'e-int', codeCFC: '243.0', familleCFC: 'Isolation', libelle: 'Isolation thermique laine minérale', unite: 'm2', ...prix(28), tauxTVA: 8.1, actif: true },
    { id: 'p-mint-12', entiteId: 'e-int', codeCFC: '281.3', familleCFC: 'Revêtements de sol', libelle: 'Poignée de porte (remplacement)', unite: 'piece', ...prix(85, 0.45), tauxTVA: 8.1, actif: true },
    { id: 'p-mint-13', entiteId: 'e-int', codeCFC: '258.0', familleCFC: 'Maintenance', libelle: 'Intervention dépannage', unite: 'h', ...prix(120, 0.45), tauxTVA: 8.1, actif: true },

    // === Maill Extérieure ===
    { id: 'p-mext-1', entiteId: 'e-ext', codeCFC: '414.0', familleCFC: 'Clôtures', libelle: 'Clôture rigide H180 galvanisée', unite: 'ml', ...prix(145), tauxTVA: 8.1, sousTaches: stCloture, actif: true },
    { id: 'p-mext-2', entiteId: 'e-ext', codeCFC: '423.0', familleCFC: 'Pergolas', libelle: 'Pergola bioclimatique alu motorisée', unite: 'm2', ...prix(480, 0.65), tauxTVA: 8.1, sousTaches: stPergola, actif: true },
    { id: 'p-mext-3', entiteId: 'e-ext', codeCFC: '420.0', familleCFC: 'Terrasses', libelle: 'Terrasse bois ipé sur lambourdes', unite: 'm2', ...prix(195), tauxTVA: 8.1, sousTaches: stTerrasse, actif: true },
    { id: 'p-mext-4', entiteId: 'e-ext', codeCFC: '415.0', familleCFC: 'Portails', libelle: 'Portail alu motorisé 3.5m', unite: 'piece', ...prix(2800, 0.68), tauxTVA: 8.1, actif: true },
    { id: 'p-mext-5', entiteId: 'e-ext', codeCFC: '411.0', familleCFC: 'Aménagement extérieur', libelle: 'Pavés extérieurs sur lit de sable', unite: 'm2', ...prix(95), tauxTVA: 8.1, actif: true },
    { id: 'p-mext-6', entiteId: 'e-ext', codeCFC: '422.0', familleCFC: 'Jardin', libelle: 'Gazon synthétique haute densité', unite: 'm2', ...prix(55), tauxTVA: 8.1, actif: true },
    { id: 'p-mext-7', entiteId: 'e-ext', codeCFC: '232.5', familleCFC: 'Éclairage extérieur', libelle: 'Spot LED IP65 extérieur', unite: 'piece', ...prix(125), tauxTVA: 8.1, actif: true },
    { id: 'p-mext-8', entiteId: 'e-ext', codeCFC: '422.5', familleCFC: 'Jardin', libelle: 'Jardinière alu thermolaqué', unite: 'piece', ...prix(380), tauxTVA: 8.1, actif: true },
    { id: 'p-mext-9', entiteId: 'e-ext', codeCFC: '423.5', familleCFC: 'Abris', libelle: 'Carport aluminium polycarbonate', unite: 'm2', ...prix(220), tauxTVA: 8.1, actif: true },
    { id: 'p-mext-10', entiteId: 'e-ext', codeCFC: '258.0', familleCFC: 'Maintenance', libelle: 'Intervention extérieure', unite: 'h', ...prix(110, 0.45), tauxTVA: 8.1, actif: true },
  ];

  // === Hiérarchie 3 niveaux : on convertit sousTaches → postes ===
  // Pour chaque prestation ayant des sousTaches, on crée des postes en répartissant le prix B2B et le temps.
  // Quelques postes reçoivent en plus des sous-postes (méthodes alternatives) pour démontrer le 3e niveau.
  const sousPostesSpec: Record<string, { posteIdx: number; items: { libelle: string; ratio: number; tempsRatio: number }[] }> = {
    'p-mint-1': { posteIdx: 4, items: [
      { libelle: 'Méthode pose collée standard', ratio: 1.0, tempsRatio: 1.0 },
      { libelle: 'Méthode pose double-encollage (chantier humide)', ratio: 1.15, tempsRatio: 1.25 },
    ] },
    'p-mext-2': { posteIdx: 4, items: [
      { libelle: 'Lames orientables manuelles', ratio: 0.85, tempsRatio: 0.9 },
      { libelle: 'Lames orientables motorisées + télécommande', ratio: 1.0, tempsRatio: 1.0 },
      { libelle: 'Motorisation + capteur pluie/vent', ratio: 1.2, tempsRatio: 1.1 },
    ] },
    'p-mint-3': { posteIdx: 3, items: [
      { libelle: 'Peinture acrylique mate', ratio: 1.0, tempsRatio: 1.0 },
      { libelle: 'Peinture lessivable cuisine/SDB', ratio: 1.15, tempsRatio: 1.05 },
    ] },
  };
  // Temps par défaut estimés (heures par unité) selon famille
  const tempsParFamille: Record<string, number> = {
    'Revêtements de sol': 0.8, 'Peinture & tapisserie': 0.35, 'Plâtrerie': 0.6,
    'Électricité': 1.0, 'Sanitaire': 1.0, 'Pergolas': 1.5, 'Terrasses': 1.2,
    'Clôtures': 0.7, 'Menuiserie intérieure': 1.2, 'Cuisine': 6,
  };
  for (const p of prestations) {
    if (!p.sousTaches?.length) continue;
    const tempsTotal = tempsParFamille[p.familleCFC] ?? 0.6;
    const n = p.sousTaches.length;
    // répartition non-uniforme : un peu plus de poids sur l'étape "pose" centrale
    const weights = p.sousTaches.map((_, i) => i === Math.floor(n / 2) ? 1.6 : 1);
    const wSum = weights.reduce((a, b) => a + b, 0);
    p.postes = p.sousTaches.map((lib, i) => {
      const part = weights[i] / wSum;
      const prixPart = Math.round(p.prixB2B * part * 100) / 100;
      const tempsPart = Math.round(tempsTotal * part * 100) / 100;
      const sp = sousPostesSpec[p.id];
      const poste: import('./types').Poste = {
        id: `${p.id}-pos-${i + 1}`,
        libelle: lib,
        unite: p.unite,
        prixBrut: prixPart,
        tempsParUnite: tempsPart,
      };
      if (sp && sp.posteIdx === i) {
        poste.sousPostes = sp.items.map((it, j) => ({
          id: `${poste.id}-sp-${j + 1}`,
          libelle: it.libelle,
          unite: p.unite,
          prixBrut: Math.round(prixPart * it.ratio * 100) / 100,
          tempsParUnite: Math.round(tempsPart * it.tempsRatio * 100) / 100,
        }));
      }
      return poste;
    });
    p.tempsParUnite = Math.round(p.postes.reduce((s, x) => s + x.tempsParUnite, 0) * 100) / 100;
  }

  // === Chantiers — nomenclature [CODE]-[VILLE3]-[NUM3] ===
  const chantiers: Chantier[] = [
    { id: 'ch-1', reference: 'INT-LAU-001', nom: 'Rénovation appartement Dubois', entiteId: 'e-int', clientId: 'c-dubois', ville: 'Lausanne', adresse: 'Av. de la Gare 45', dateDebut: t(-21), dateFinPrevue: t(21), statut: 'en_cours', devisIds: ['d-1'], createdAt: t(-30) },
    { id: 'ch-2', reference: 'PRO-LAU-001', nom: 'Aménagement boutique Nordia Centre', entiteId: 'e-pro', clientId: 'c-nordia', ville: 'Lausanne', adresse: 'Rue du Bourg 12', dateDebut: t(-14), dateFinPrevue: t(28), statut: 'en_cours', devisIds: ['d-2'], createdAt: t(-25) },
    { id: 'ch-3', reference: 'EXT-MTX-001', nom: 'Pergola chalet Berger', entiteId: 'e-ext', clientId: 'c-berger', ville: 'Montreux', adresse: 'Chemin du Lac 8', dateDebut: t(7), dateFinPrevue: t(35), statut: 'signe', devisIds: ['d-3'], createdAt: t(-15) },
    { id: 'ch-4', reference: 'EXT-VEV-001', nom: 'Clôture villa Perret', entiteId: 'e-ext', clientId: 'c-perret', ville: 'Vevey', adresse: 'Rte de Lavaux 14', dateDebut: t(14), dateFinPrevue: t(28), statut: 'prospect', devisIds: [], createdAt: t(-5) },
    { id: 'ch-5', reference: 'INT-PUL-001', nom: 'Maintenance poignée porte Roulin', entiteId: 'e-int', clientId: 'c-roulin', ville: 'Pully', adresse: 'Av. de Tivoli 22', dateDebut: t(-2), dateFinPrevue: t(-2), statut: 'termine', devisIds: [], createdAt: t(-3) },
    { id: 'ch-6', reference: 'PRO-GEN-001', nom: 'Promotion Velora Rive — 24 mois', entiteId: 'e-pro', clientId: 'c-velora', ville: 'Genève', adresse: 'Rue du Rhône 45', dateDebut: t(30), dateFinPrevue: t(720), statut: 'prospect', devisIds: ['d-4'], createdAt: t(-2) },
  ];

  // === Devis ===
  const pById = (id: string) => prestations.find(p => p.id === id)!;

  const d1Lignes: LigneDevis[] = [
    mkLigne(pById('p-mint-10'), 1, 'prive', 1),
    mkLigne(pById('p-mint-4'), 22, 'prive', 2),
    mkLigne(pById('p-mint-5'), 28, 'prive', 3),
    mkLigne(pById('p-mint-6'), 18, 'prive', 4),
    mkLigne(pById('p-mint-2'), 55, 'prive', 5),
    mkLigne(pById('p-mint-3'), 180, 'prive', 6),
    mkLigne(pById('p-mint-1'), 18, 'prive', 7),
    mkLigne(pById('p-mint-7'), 4, 'prive', 8),
    mkLigne(pById('p-mint-8'), 1, 'prive', 9),
  ];
  const d2Lignes: LigneDevis[] = [
    mkLigne(pById('p-pro-6'), 1, 'B2B', 1),
    mkLigne(pById('p-pro-1'), 180, 'B2B', 2),
    mkLigne(pById('p-pro-2'), 220, 'B2B', 3),
    mkLigne(pById('p-pro-3'), 32, 'B2B', 4),
    mkLigne(pById('p-pro-4'), 1, 'B2B', 5),
    mkLigne(pById('p-pro-5'), 1, 'B2B', 6),
  ];
  const d3Lignes: LigneDevis[] = [
    mkLigne(pById('p-mext-2'), 24, 'luxe', 1, { estForfait: true }),
  ];
  d3Lignes[0].libelle = 'Pergola bioclimatique selon détail — forfait';

  const devis: Devis[] = [
    recalcDevis({ id: 'd-1', numero: 'INT-DEV-2026-001', entiteId: 'e-int', clientId: 'c-dubois', chantierId: 'ch-1', dateCreation: t(-28), dateValidite: t(2), statut: 'accepte', lignes: d1Lignes, notesIA: 'Rénovation appartement ~65 m², occupé pendant travaux partiel.', createdAt: t(-28) }),
    recalcDevis({ id: 'd-2', numero: 'PRO-DEV-2026-001', entiteId: 'e-pro', clientId: 'c-nordia', chantierId: 'ch-2', dateCreation: t(-22), dateValidite: t(8), statut: 'accepte', lignes: d2Lignes, notesIA: 'Aménagement nuit, boutique ouverte journée.', createdAt: t(-22) }),
    recalcDevis({ id: 'd-3', numero: 'EXT-DEV-2026-001', entiteId: 'e-ext', clientId: 'c-berger', chantierId: 'ch-3', dateCreation: t(-10), dateValidite: t(20), statut: 'accepte', lignes: d3Lignes, notesIA: 'Forfait pergola haut de gamme — chalet Montreux.', createdAt: t(-10) }),
    recalcDevis({ id: 'd-4', numero: 'PRO-DEV-2026-002', entiteId: 'e-pro', clientId: 'c-velora', chantierId: 'ch-6', dateCreation: t(-3), dateValidite: t(27), statut: 'brouillon', lignes: [], createdAt: t(-3) }),
  ];

  // === Pointages — semaine en cours, journée incomplète vendredi pour Luc ===
  const monday = new Date();
  const dow = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - dow);
  const wd = (i: number) => isoDate(new Date(monday.getTime() + i * 86400000));

  const pointages: PointageHeure[] = [];
  function addP(chantierId: string, ouvrierId: string, dateIso: string, hDeb: string, hFin: string, trajet: boolean, surSite: boolean) {
    const [hd, md] = hDeb.split(':').map(Number);
    const [hf, mf] = hFin.split(':').map(Number);
    const heures = Math.round(((hf * 60 + mf) - (hd * 60 + md)) / 6) / 10;
    pointages.push({
      id: `pt-${pointages.length + 1}`,
      chantierId, ouvrierId, date: dateIso,
      heureDebut: hDeb, heureFin: hFin, heuresTravaillees: heures,
      inclutTrajet: trajet,
      geolocalisation: { latitude: 46.51 + Math.random() * 0.1, longitude: 6.63 + Math.random() * 0.1, surSite },
      createdAt: dateIso,
    });
  }
  // Luc : journées complètes lun-jeu, vendredi INCOMPLET (6h15 = 6h15)
  addP('ch-1', 'o-luc', wd(0), '07:30', '12:00', true, true);
  addP('ch-1', 'o-luc', wd(0), '13:00', '17:10', false, true);
  addP('ch-1', 'o-luc', wd(1), '07:30', '12:00', true, true);
  addP('ch-1', 'o-luc', wd(1), '13:00', '17:10', false, true);
  addP('ch-2', 'o-luc', wd(2), '07:30', '12:00', true, true);
  addP('ch-1', 'o-luc', wd(2), '13:00', '17:10', false, true);
  addP('ch-1', 'o-luc', wd(3), '07:30', '12:00', true, true);
  addP('ch-1', 'o-luc', wd(3), '13:00', '17:10', false, true);
  addP('ch-1', 'o-luc', wd(4), '08:00', '12:00', true, true);
  addP('ch-5', 'o-luc', wd(4), '13:00', '15:15', false, true); // 6h15 total
  // Paul : 3 chantiers même jour mardi
  addP('ch-2', 'o-paul', wd(1), '07:00', '09:30', true, true);
  addP('ch-1', 'o-paul', wd(1), '10:00', '12:30', false, true);
  addP('ch-3', 'o-paul', wd(1), '13:30', '18:00', false, false);
  addP('ch-2', 'o-paul', wd(0), '07:30', '12:00', true, true);
  addP('ch-2', 'o-paul', wd(0), '13:00', '17:10', false, true);
  addP('ch-1', 'o-paul', wd(2), '07:30', '12:00', true, true);
  addP('ch-1', 'o-paul', wd(2), '13:00', '17:10', false, true);
  addP('ch-2', 'o-paul', wd(3), '07:30', '12:00', true, true);
  addP('ch-2', 'o-paul', wd(3), '13:00', '17:10', false, true);
  addP('ch-2', 'o-paul', wd(4), '07:30', '12:00', true, true);
  addP('ch-2', 'o-paul', wd(4), '13:00', '17:10', false, true);
  // Hugo et Nino quelques pointages
  addP('ch-1', 'o-nino', wd(0), '07:30', '12:00', true, true);
  addP('ch-1', 'o-nino', wd(0), '13:00', '17:10', false, true);
  addP('ch-2', 'o-hugo', wd(1), '07:30', '12:00', true, true);
  addP('ch-2', 'o-hugo', wd(1), '13:00', '17:10', false, true);

  // Journées agrégées
  const journees: JourneeOuvrier[] = [];
  const map = new Map<string, JourneeOuvrier>();
  for (const p of pointages) {
    const k = `${p.ouvrierId}_${p.date}`;
    const j = map.get(k) ?? { id: k, ouvrierId: p.ouvrierId, date: p.date, totalHeures: 0, complete: false, verrouillee: true };
    j.totalHeures = Math.round((j.totalHeures + p.heuresTravaillees) * 100) / 100;
    map.set(k, j);
  }
  for (const j of map.values()) {
    j.complete = j.totalHeures >= 8.6667; // 8h40
    j.verrouillee = !j.complete;
    journees.push(j);
  }

  // === Factures fournisseurs ===
  const factures: FactureFournisseur[] = [
    { id: 'f-1', chantierId: 'ch-1', fournisseur: 'Sanitas Troesch', numeroFacture: 'F-2026-1042', date: t(-10), montantHT: 4280, tauxTVA: 8.1, montantTTC: 4626.68, nomFichier: 'sanitas-troesch-1042.pdf', statut: 'valide', uploadedAt: t(-9) },
    { id: 'f-2', chantierId: 'ch-1', fournisseur: 'Migros Pro', numeroFacture: 'MP-2026-3120', date: t(-15), montantHT: 1820, tauxTVA: 8.1, montantTTC: 1967.42, nomFichier: 'migros-pro-3120.pdf', statut: 'valide', uploadedAt: t(-14) },
    { id: 'f-3', chantierId: 'ch-2', fournisseur: 'HG Commerciale', numeroFacture: 'HG-2026-2103', date: t(-8), montantHT: 6450, tauxTVA: 8.1, montantTTC: 6972.45, nomFichier: 'hg-2103.pdf', statut: 'a_valider', uploadedAt: t(-7) },
    { id: 'f-4', chantierId: 'ch-2', fournisseur: 'Dupont Matériaux', numeroFacture: 'DP-2026-441', date: t(-5), montantHT: 3210, tauxTVA: 8.1, montantTTC: 3470.01, nomFichier: 'dupont-441.pdf', statut: 'valide', uploadedAt: t(-4) },
    { id: 'f-5', chantierId: 'ch-3', fournisseur: 'Tessera Carrelages', numeroFacture: 'TC-2026-778', date: t(-12), montantHT: 8920, tauxTVA: 8.1, montantTTC: 9642.52, nomFichier: 'tessera-778.pdf', statut: 'valide', uploadedAt: t(-11) },
    { id: 'f-6', chantierId: 'ch-4', fournisseur: 'Bois Vaudois SA', numeroFacture: 'BV-2026-2241', date: t(-6), montantHT: 12450, tauxTVA: 8.1, montantTTC: 13458.45, nomFichier: 'bois-vaudois-2241.pdf', statut: 'a_valider', uploadedAt: t(-5) },
    { id: 'f-7', chantierId: 'ch-1', fournisseur: 'Silva Peintures', numeroFacture: 'SP-2026-118', date: t(-3), montantHT: 1640, tauxTVA: 8.1, montantTTC: 1772.84, nomFichier: 'silva-118.pdf', statut: 'a_valider', uploadedAt: t(-2) },
    { id: 'f-8', chantierId: 'ch-3', fournisseur: 'Iseli Quincaillerie', numeroFacture: 'IQ-2026-9087', date: t(-18), montantHT: 940, tauxTVA: 8.1, montantTTC: 1016.14, nomFichier: 'iseli-9087.pdf', statut: 'valide', uploadedAt: t(-17) },
  ];

  const activity: ActivityItem[] = [
    { id: 'a-1', type: 'devis', titre: 'Devis INT-DEV-2026-001 accepté', description: 'Famille Dubois', entiteId: 'e-int', createdAt: t(-25) },
    { id: 'a-2', type: 'facture', titre: 'Facture Sanitas Troesch rattachée', description: 'INT-LAU-001 · 4\'626.68 CHF', entiteId: 'e-int', createdAt: t(-9) },
    { id: 'a-3', type: 'pointage', titre: 'Pointage Luc', description: 'PRO-LAU-001 · 8h00', entiteId: 'e-pro', createdAt: t(-1) },
    { id: 'a-4', type: 'chantier', titre: 'Chantier EXT-MTX-001 signé', description: 'Pergola chalet Berger', entiteId: 'e-ext', createdAt: t(-10) },
  ];

  return {
    entites, clients, ouvriers, prestations, devis, chantiers, pointages, journees, factures, activity,
    currentRole: 'admin',
    currentEntiteId: 'all',
    currentOuvrierId: 'o-luc',
    dureeJourneeMin: 520, // 8h40
    validiteDevisJours: 30,
    conditionsDevis: 'Paiement : 30% à la signature, 40% à mi-parcours, 30% à la livraison. Validité 30 jours.',
    mentionsLegales: 'Votre societe · Adresse du siege · TVA 8.1%',
  };
}
