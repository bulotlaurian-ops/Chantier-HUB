import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import { formatMontant, formatDateLong } from "./format";
import { CGV_PAR_CODE } from "./cgv";

// =====================================================================
// Génération PDF d'un devis Artisan Pro — template unique paramétré par entité.
// Page 1 = garde ; pages suivantes = tableau des lignes ; dernière = récap.
// Le PDF MET EN FORME uniquement : aucun total n'est recalculé (données 005).
// =====================================================================

// Coordonnées de l'entreprise. `rue` / `npaLocalite` = bloc en-tête de la
// page de garde (2 lignes, en gras) ; `adresse` = version compacte du pied de page.
// ⚠️ IBAN à renseigner (n'est pas une donnée publique, en attente de l'entreprise).
const SOCIETE = {
  rue: "6B Chemin Vieux de Montolieu",
  npaLocalite: "11310 SAINT-DENIS",
  adresse: "6B Chemin Vieux de Montolieu — 11310 Saint-Denis",
  siret: "753 992 163 00018",
  iban: "IBAN A RENSEIGNER",
};

// Texte d'accompagnement de la page de garde (identique pour les 3 entités).
// `gapApres` = respiration en mm après le bloc (0 = simple retour à la ligne).
const INTRO_BLOCS: { texte: string; gapApres: number }[] = [
  { texte: "Madame, Monsieur,", gapApres: 5 },
  // gapApres 1.5 = simple retour à la ligne, mais assez lisible pour ne pas se
  // confondre avec le repli automatique du paragraphe ci-dessus.
  {
    texte:
      "Nous vous remercions de votre demande concernant le projet susmentionné et vous soumettons notre offre basée sur nos échanges.",
    gapApres: 1.5,
  },
  { texte: "Vous trouverez ci-après le détail de nos prestations.", gapApres: 5 },
  {
    texte:
      "Veuillez consulter nos conditions générales de vente (CGV), de livraison et de garantie.",
    gapApres: 5,
  },
  {
    texte: "Nos techniciens restent à votre disposition pour tous renseignements complémentaires.",
    gapApres: 5,
  },
  {
    texte: "Nous serions très heureux de participer à la réalisation de votre projet.",
    gapApres: 5,
  },
  { texte: "Meilleures salutations", gapApres: 0 },
];

// Coordonnées SPÉCIFIQUES par entité (tél / email / site). Le site n'existe pas
// dans PdfDevisData → centralisé ici (données passées inchangées).
// ⚠️ À PERSONNALISER au même titre que SOCIETE ci-dessus.
// ⚠️ Téléphone/email à confirmer avec l'entreprise.
const ENTITE_CONTACT: Record<string, { tel: string; email: string; site: string }> = {
  PRO: {
    tel: "TELEPHONE A RENSEIGNER",
    email: "EMAIL A RENSEIGNER",
    site: "",
  },
};

export interface PdfEntite {
  nom: string;
  code: string;
  couleur: string;
  tel?: string; // fallback si le code n'est pas dans ENTITE_CONTACT
  email?: string;
  cgvUrl?: string;
}
export interface PdfClient {
  nom: string;
  adresse?: string | null;
  ville?: string | null;
  pays?: string | null;
}
export interface PdfLigne {
  libelle: string;
  unite: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  remise_pct: number;
  total_ht: number;
  est_titre: boolean;
  est_option: boolean;
}
export interface PdfDevisData {
  numero: string;
  date_creation: string;
  objet?: string | null;
  entite: PdfEntite;
  client: PdfClient;
  lignes: PdfLigne[];
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  arrondi: number;
  taux_tva: number; // ex 8.1 (affichage)
  conditions_paiement?: string | null;
  notes?: string | null;
}

type RGB = [number, number, number];
const GREY: RGB = [110, 110, 110];
const DARK: RGB = [30, 30, 30];
const LINE: RGB = [200, 200, 200];

function hexToRgb(hex: string): RGB {
  const h = (hex || "#1F2937").replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function formatQte(q: number): string {
  return Number.isInteger(q) ? String(q) : String(q);
}

// Dessine un logo (data URL) dans une boîte maxW×maxH, ancré en haut à droite.
function drawLogo(
  doc: jsPDF,
  logo: string | undefined,
  w: number,
  topY: number,
  maxW: number,
  maxH: number,
): number {
  if (!logo) return 0;
  try {
    const p = doc.getImageProperties(logo);
    const scale = Math.min(maxW / p.width, maxH / p.height);
    const lw = p.width * scale,
      lh = p.height * scale;
    doc.addImage(logo, "PNG", w - 14 - lw, topY, lw, lh);
    return lh;
  } catch (e) {
    console.warn("[pdf] logo non rendu :", e);
    return 0;
  }
}

// Pied de page (toutes les pages) : filet + coordonnées, centré, 8 pt.
function drawFooter(doc: jsPDF, w: number, h: number, code: string): void {
  const c = ENTITE_CONTACT[code];
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(14, h - 16, w - 14, h - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  const l1 = [SOCIETE.adresse, c && `T. ${c.tel}`, c?.email, c?.site]
    .filter(Boolean)
    .join("   ·   ");
  const l2 = `SIRET ${SOCIETE.siret}   ·   IBAN ${SOCIETE.iban}`;
  doc.text(l1, w / 2, h - 11, { align: "center" });
  doc.text(l2, w / 2, h - 7, { align: "center" });
}

function formatPct(p: number): string {
  const s = Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/\.?0+$/, "");
  return `${s}%`;
}

// Rend les CGV de l'entité en fin de document : nouvelle(s) page(s), titre +
// texte en 2 colonnes (8 pt, articles numérotés en gras). Rien si texte vide.
function renderCgv(doc: jsPDF, text: string | undefined, w: number, h: number, color: RGB): void {
  if (!text || !text.trim()) return;
  const top = 36,
    bottom = h - 22,
    gutter = 8,
    lh = 3.4;
  const colW = (w - 28 - gutter) / 2;
  const colX = [14, 14 + colW + gutter];
  const artRe = /^\d+\.\s+[A-ZÀ-Ü]/;
  const clauseRe = /^Clause\s+\d/i;

  const drawTitle = (suite: boolean) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...color);
    doc.text(`CONDITIONS GÉNÉRALES DE VENTE${suite ? " (suite)" : ""}`, 14, 26);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(14, 30, w - 14, 30);
  };

  doc.addPage();
  drawTitle(false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  // Chaque ligne du texte = un paragraphe. Découpe à la largeur de colonne ;
  // en-têtes d'article/clause en gras + espace avant ; simple respiration entre paragraphes.
  const flow: { text: string; bold: boolean; gap: number }[] = [];
  for (const raw of text.split("\n")) {
    const s = raw.trim();
    if (!s) continue;
    const isArt = artRe.test(s);
    const isClause = clauseRe.test(s);
    const gap = isArt ? 3.2 : isClause ? 2.4 : 1.4;
    (doc.splitTextToSize(s, colW) as string[]).forEach((wl, i) =>
      flow.push({ text: wl, bold: isArt || isClause, gap: i === 0 ? gap : 0 }),
    );
  }

  let ci = 0,
    y = top;
  for (const it of flow) {
    if (y + it.gap > bottom) {
      if (ci === 0) {
        ci = 1;
        y = top;
      } else {
        doc.addPage();
        drawTitle(true);
        ci = 0;
        y = top;
      }
    }
    y += it.gap;
    doc.setFont("helvetica", it.bold ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text(it.text, colX[ci], y);
    y += lh;
  }
}

export function buildDevisPdf(d: PdfDevisData, logoDataUrl?: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const [cr, cg, cb] = hexToRgb(d.entite.couleur);
  const code = d.entite.code;

  // =================== PAGE 1 — GARDE ===================
  const logoH = drawLogo(doc, logoDataUrl, w, 12, 60, 30);

  // Bloc Artisan Pro (haut-gauche) — nom + adresse sur 3 lignes, TOUT en gras.
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(13);
  doc.text(d.entite.nom.toUpperCase(), 14, 18);
  doc.setFontSize(9.5);
  doc.text(SOCIETE.rue, 14, 24);
  doc.text(SOCIETE.npaLocalite, 14, 29);

  // Bloc client (droite, sous le logo)
  let cy = Math.max(12 + logoH + 12, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text("CLIENT", 120, cy);
  doc.setFontSize(10.5);
  doc.setTextColor(...DARK);
  cy += 6;
  doc.setFont("helvetica", "bold");
  doc.text(d.client.nom, 120, cy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (d.client.adresse) {
    cy += 5.5;
    doc.text(d.client.adresse, 120, cy);
  }
  if (d.client.ville) {
    cy += 5.5;
    doc.text(d.client.ville, 120, cy);
  }
  if (d.client.pays) {
    cy += 5.5;
    doc.text(d.client.pays, 120, cy);
  }

  // Tableau de référence (encadré, gauche)
  const refRows: [string, string][] = [
    ["N° de devis", d.numero],
    ["Date", formatDateLong(d.date_creation)],
    ["Référence", d.objet?.trim() || "—"],
    ["Validité", "30 jours dès l’émission"],
    // N° TVA client : masqué (non présent dans les données passées).
  ];
  const refY = Math.max(cy + 14, 78);
  const rowH = 7;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  // Hauteur de ligne VARIABLE : une valeur qui déborde sur 2+ lignes (typiquement
  // une longue référence) pousse la ligne suivante au lieu de la chevaucher.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const valLineH = doc.getTextDimensions("A").h;
  let ry = refY;
  refRows.forEach((r) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const val = doc.splitTextToSize(r[1], w - 14 - 52) as string[];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(r[0].toUpperCase(), 14, ry);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(val, 52, ry);
    // Le filet reste à 4.5 mm au-dessus de la ligne suivante (comme en mono-ligne).
    const blockH = rowH + (val.length - 1) * valLineH;
    doc.line(14, ry + blockH - 4.5, w - 14, ry + blockH - 4.5);
    ry += blockH;
  });

  // Titre + texte d'accompagnement
  let ty = ry + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(cr, cg, cb);
  doc.text(`Devis ${d.numero}`, 14, ty);

  ty += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  const introLineH = doc.getTextDimensions("A").h;
  for (const bloc of INTRO_BLOCS) {
    const lines = doc.splitTextToSize(bloc.texte, w - 28) as string[];
    doc.text(lines, 14, ty);
    ty += lines.length * introLineH + bloc.gapApres;
  }
  // (Les CGV complètes figurent en fin de document.)

  // Zone de signature — ancrée en bas de la page de garde, au-dessus du pied de page.
  // Convention : libellé EN HAUT, zone d'écriture juste en dessous, filet qui la
  // ferme. Le nom et la date tiennent sur une ligne ; la signature a besoin de
  // hauteur, d'où deux gabarits distincts.
  const H_NOM = 10; // hauteur d'écriture pour « nom » et « date » (1 ligne)
  const H_SIGNATURE = 22; // hauteur d'écriture pour la signature
  const ECART_CHAMPS = 8; // entre le filet « nom / date » et le libellé « signature »
  const idColW = (w - 28 - 10) / 2;

  const sigRuleY = h - 26; // filet fermant la signature
  const sigLabelY = sigRuleY - H_SIGNATURE; // libellé « SIGNATURE »
  const idRuleY = sigLabelY - ECART_CHAMPS; // filets « nom » et « date »
  const idLabelY = idRuleY - H_NOM; // libellés « nom » et « date »

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Signature — acceptation du devis", 14, idLabelY - 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text("Bon pour accord, à retourner daté et signé.", 14, idLabelY - 8);

  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text("NOM ET PRÉNOM", 14, idLabelY);
  doc.text("DATE", 14 + idColW + 10, idLabelY);
  doc.text("SIGNATURE", 14, sigLabelY);

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(14, idRuleY, 14 + idColW, idRuleY);
  doc.line(14 + idColW + 10, idRuleY, w - 14, idRuleY);
  doc.line(14, sigRuleY, w - 14, sigRuleY);

  drawFooter(doc, w, h, code);

  // =================== PAGES 2+ — TABLEAU DES LIGNES ===================
  doc.addPage();

  // Colonne « Remise » affichée uniquement si au moins une ligne porte une remise.
  const hasRemise = d.lignes.some((l) => !l.est_titre && l.remise_pct > 0);
  const N = hasRemise ? 7 : 6;
  const head = [
    hasRemise
      ? ["Pos.", "Désignation", "Unité", "Quantité", "Prix unit. HT", "Remise", "Montant HT"]
      : ["Pos.", "Désignation", "Unité", "Quantité", "Prix unit. HT", "Montant HT"],
  ];
  const titreCount = d.lignes.filter((l) => l.est_titre).length;

  const body: RowInput[] = [];
  const rowCumul: number[] = []; // cumul HT après chaque ligne de body (pour le report)
  let acc = 0,
    secSum = 0,
    secOpen = false,
    pos = 0;

  const pushSubtotal = () => {
    body.push([
      {
        content: "Sous-total",
        colSpan: N - 1,
        styles: { halign: "right", fontStyle: "italic", textColor: GREY },
      },
      {
        content: formatMontant(secSum),
        styles: { halign: "right", fontStyle: "italic", textColor: GREY },
      },
    ]);
    rowCumul.push(Math.round(acc * 100) / 100);
  };

  for (const l of d.lignes) {
    if (l.est_titre) {
      if (secOpen && titreCount > 0) pushSubtotal();
      body.push([
        {
          content: l.libelle,
          colSpan: N,
          styles: { fontStyle: "bold", textColor: DARK, fillColor: [245, 245, 245] },
        },
      ]);
      rowCumul.push(Math.round(acc * 100) / 100);
      secOpen = false;
      secSum = 0;
      continue;
    }
    pos += 1;
    const isOpt = l.est_option;
    const lib =
      isOpt && !/option|totalis/i.test(l.libelle)
        ? `Option non totalisée — ${l.libelle}`
        : l.libelle;
    const st = isOpt ? { fontStyle: "italic" as const, textColor: GREY } : {};
    const cells: RowInput = [
      { content: String(pos), styles: { ...st, halign: "center" as const } },
      { content: lib, styles: st },
      { content: l.unite ?? "", styles: { ...st, halign: "center" as const } },
      { content: formatQte(l.quantite), styles: { ...st, halign: "right" as const } },
      { content: formatMontant(l.prix_unitaire_ht), styles: { ...st, halign: "right" as const } },
    ];
    if (hasRemise)
      cells.push({
        content: l.remise_pct > 0 ? formatPct(l.remise_pct) : "",
        styles: { ...st, halign: "right" as const },
      });
    cells.push({
      content: isOpt ? "—" : formatMontant(l.total_ht),
      styles: { ...st, halign: "right" as const },
    });
    body.push(cells);
    if (!isOpt) {
      acc += l.total_ht;
      secSum += l.total_ht;
    }
    rowCumul.push(Math.round(acc * 100) / 100);
    secOpen = true;
  }
  if (secOpen && titreCount > 0) pushSubtotal();

  const pageLastRow: Record<number, number> = {};
  autoTable(doc, {
    startY: 26,
    margin: { top: 24, left: 14, right: 14, bottom: 26 },
    theme: "plain",
    rowPageBreak: "avoid",
    head,
    body,
    headStyles: {
      fontStyle: "bold",
      fontSize: 8.5,
      textColor: [255, 255, 255],
      fillColor: [cr, cg, cb],
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
    },
    styles: {
      fontSize: 8.5,
      textColor: DARK,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      lineWidth: 0,
      overflow: "linebreak",
    },
    columnStyles: hasRemise
      ? {
          0: { cellWidth: 11, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 15, halign: "center" },
          3: { cellWidth: 18, halign: "right" },
          4: { cellWidth: 26, halign: "right" },
          5: { cellWidth: 16, halign: "right" },
          6: { cellWidth: 26, halign: "right" },
        }
      : {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: "auto" },
          2: { cellWidth: 16, halign: "center" },
          3: { cellWidth: 20, halign: "right" },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 28, halign: "right" },
        },
    didDrawCell: (data) => {
      if (data.section === "body") {
        pageLastRow[data.pageNumber] = Math.max(pageLastRow[data.pageNumber] ?? -1, data.row.index);
      }
    },
  });

  // =================== DERNIÈRE PAGE — RÉCAP FINANCIER ===================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 12;
  if (y > h - 60) {
    doc.addPage();
    y = 30;
  }

  const labelX = w - 78,
    valX = w - 14;
  const rec = (label: string, val: string, bold = false, color: RGB = DARK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    doc.text(label, labelX, y);
    doc.text(val, valX, y, { align: "right" });
    y += 6;
  };
  doc.setFontSize(10);
  rec("Total HT", formatMontant(d.total_ht));
  rec(`TVA ${d.taux_tva}%`, formatMontant(d.total_tva));
  if (Math.abs(d.arrondi) > 0.0001) rec("Arrondi", formatMontant(d.arrondi));
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(labelX, y - 3, valX, y - 3);
  doc.setFontSize(11.5);
  rec("Total TTC", formatMontant(d.total_ttc), true, [cr, cg, cb]);

  // Notes et remarques (optionnel)
  let bx = y + 6;
  if (d.notes && d.notes.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text("Notes et remarques", 14, bx);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(d.notes.trim(), w - 28) as string[];
    doc.text(lines, 14, bx + 5);
    bx += 5 + lines.length * 4.5 + 6;
  }
  if (d.conditions_paiement && d.conditions_paiement.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text("Conditions de paiement", 14, bx);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const lines = d.conditions_paiement.trim().split("\n");
    lines.forEach((ln, i) => doc.text(ln, 14, bx + 5 + i * 4.5));
  }

  // =================== CGV EN FIN DE DOCUMENT (par entité) ===================
  const contentPages = doc.getNumberOfPages(); // dernière page de contenu (avant CGV)
  renderCgv(doc, CGV_PAR_CODE[code], w, h, [cr, cg, cb]);

  // =================== CHROME DE PAGE (pied + Page X/Y ; en-tête suite + report sur le contenu) ===================
  const pageCount = doc.getNumberOfPages();
  const dateStr = formatDateLong(d.date_creation);
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, w, h, code);
    // Page X/Y en zone pied de page (centré, au-dessus du filet) — pas sous le logo.
    if (p >= 2) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(`Page ${p} / ${pageCount}`, w / 2, h - 19, { align: "center" });
    }
    // En-tête compact + report : uniquement sur les pages de contenu (tableau/récap).
    if (p >= 2 && p <= contentPages) {
      drawLogo(doc, logoDataUrl, w, 8, 30, 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.text(d.entite.nom.toUpperCase(), 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(`Devis Nº ${d.numero} — ${dateStr}`, 14, 17.5);
      if (p < contentPages && pageLastRow[p] != null) {
        const v = rowCumul[pageLastRow[p]] ?? 0;
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text("À reporter", w - 46, h - 20, { align: "right" });
        doc.text(formatMontant(v), w - 14, h - 20, { align: "right" });
      }
      if (p >= 3 && pageLastRow[p - 1] != null) {
        const v = rowCumul[pageLastRow[p - 1]] ?? 0;
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text("Report", w - 46, 24, { align: "right" });
        doc.text(formatMontant(v), w - 14, 24, { align: "right" });
      }
    }
  }

  return doc;
}

export function telechargerDevisPdf(d: PdfDevisData, logoDataUrl?: string): void {
  buildDevisPdf(d, logoDataUrl).save(`Devis ${d.numero}.pdf`);
}
