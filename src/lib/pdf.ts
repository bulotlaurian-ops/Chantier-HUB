import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import { formatMontant, formatDateLong } from "./format";
import { CGV_PAR_CODE } from "./cgv";
import { ENTREPRISE as SOCIETE, CONTACT_PAR_ENTITE as ENTITE_CONTACT } from "../config/entreprise";
import {
  MENTION_AUTOLIQUIDATION,
  MENTION_TVA_DEBITS,
  formatSiren,
} from "./facturation-electronique";

// =====================================================================
// Génération PDF d'un devis — template unique paramétré par entité.
// Une seule page de contenu (en-tête, client/date/objet, tableau, totaux,
// paiement, visa), qui déborde sur des pages suivantes si le tableau est
// trop long ; les CGV de l'entité sont ajoutées en dernier.
// Le PDF MET EN FORME uniquement : aucun total n'est recalculé (données 005).
// =====================================================================

// Coordonnées de l'entreprise (SOCIETE) et contacts par entité (ENTITE_CONTACT) :
// définis dans src/config/entreprise.ts, seul fichier à modifier pour un nouveau client.
// Le pied de page n'affiche que l'adresse (le papier à en-tête ne la répète pas en haut).

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
  telephone?: string | null;
  email?: string | null;
  // Client professionnel (038) : mention SIREN obligatoire sur ses factures.
  siren?: string | null;
  raisonSociale?: string | null;
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
  // Champs facture uniquement (undefined pour un devis → aucun effet) :
  documentLabel?: string; // "Devis" par défaut, "Facture" pour une facture
  dateEcheance?: string | null; // ajoute une ligne "Échéance" dans l'encart Date/Objet
  devisReference?: string | null; // numéro du devis d'origine, ligne dédiée dans l'encart
  mentionsFacture?: boolean; // ajoute les mentions légales pénalités de retard / 40 €
  // Mentions de la réforme facture électronique (038), figées sur la facture :
  categorieOperation?: string | null; // libellé : « Prestation de services »…
  adresseChantier?: string | null; // seulement si différente de l'adresse client
  autoliquidation?: boolean; // TVA 0, due par le preneur (sous-traitance BTP)
  tvaSurDebits?: boolean;
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

// Dessine un logo (data URL) dans une boîte maxW×maxH, centré dans cette boîte (x, topY
// fixes). Retourne maxH (et non la hauteur réelle de l'image) pour que l'espace réservé
// sous le logo reste constant quel que soit le ratio de l'image fournie.
function drawLogo(
  doc: jsPDF,
  logo: string | undefined,
  x: number,
  topY: number,
  maxW: number,
  maxH: number,
): number {
  if (!logo) return 0;
  try {
    const format =
      logo.startsWith("data:image/jpeg") || logo.startsWith("data:image/jpg") ? "JPEG" : "PNG";
    const p = doc.getImageProperties(logo);
    const scale = Math.min(maxW / p.width, maxH / p.height);
    const lw = p.width * scale,
      lh = p.height * scale;
    const dx = x + (maxW - lw) / 2;
    const dy = topY + (maxH - lh) / 2;
    doc.addImage(logo, format, dx, dy, lw, lh);
    return maxH;
  } catch (e) {
    console.warn("[pdf] logo non rendu :", e);
    return 0;
  }
}

// Pied de page (toutes les pages) : filet + adresse/contact, puis mention légale + SIRET, centré, 8 pt.
function drawFooter(doc: jsPDF, w: number, h: number, code: string): void {
  const c = ENTITE_CONTACT[code];
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(14, h - 16, w - 14, h - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  const l1 = [SOCIETE.adressePied, c && `T. ${c.tel}`, c?.email, c?.site]
    .filter(Boolean)
    .join("   ·   ");
  const l2 = `${SOCIETE.formeJuridique}   ·   SIRET ${SOCIETE.siret}`;
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
  const c = ENTITE_CONTACT[code];
  const label = d.documentLabel ?? "Devis";

  // =================== EN-TÊTE (page 1) ===================
  // Le logo réel (public/logos/logo-pro.png) inclut déjà le slogan et le tél/mail
  // (letterhead scanné) : pas de doublon texte quand il est présent, seulement
  // en repli si le logo n'a pas pu être chargé.
  const logoH = drawLogo(doc, logoDataUrl, 14, 10, 83, 39);

  let hy = 10 + logoH + (logoH > 0 ? 5 : 0);
  if (!logoDataUrl) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(cr, cg, cb);
    doc.text(d.entite.nom, 14, hy);
    hy += 7;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    if (c?.tagline) {
      doc.text(c.tagline, 14, hy);
      hy += 5;
    }
    if (c?.tel || c?.email) {
      doc.text(
        [c?.tel && `tél : ${c.tel}`, c?.email && `mail : ${c.email}`].filter(Boolean).join("   "),
        14,
        hy,
      );
      hy += 5;
    }
  }

  // Bloc « Devis nº… » (haut-droite)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(cr, cg, cb);
  doc.text(`${label} ${d.numero}`, w - 14, 22, { align: "right" });

  // =================== CLIENT (gauche) / DATE + OBJET (droite) ===================
  const infoY = Math.max(hy + 8, 46);

  // Bloc CLIENT : encadré gris clair (même esprit qu'un papier à en-tête classique),
  // hauteur ajustée au contenu réellement présent (adresse/ville/tél/email optionnels).
  const boxPadX = 5,
    boxPadY = 5,
    clientBoxW = 76,
    clientLineH = 5;
  const clientLines: { text: string; bold?: boolean }[] = [{ text: d.client.nom, bold: true }];
  const raisonSociale = d.client.raisonSociale?.trim();
  if (raisonSociale && raisonSociale !== d.client.nom) clientLines.push({ text: raisonSociale });
  if (d.client.siren) clientLines.push({ text: `SIREN : ${formatSiren(d.client.siren)}` });
  const adresseComplete = [d.client.adresse, d.client.ville].filter(Boolean).join(", ");
  if (adresseComplete) clientLines.push({ text: `Adresse : ${adresseComplete}` });
  if (d.client.telephone) clientLines.push({ text: `Tél : ${d.client.telephone}` });
  if (d.client.email) clientLines.push({ text: `Email : ${d.client.email}` });
  const clientBoxH = boxPadY * 2 + clientLines.length * clientLineH;
  doc.setFillColor(235, 235, 235);
  doc.rect(14, infoY, clientBoxW, clientBoxH, "F");
  let cy = infoY + boxPadY + 3.6;
  doc.setTextColor(...DARK);
  clientLines.forEach((l) => {
    if (l.text) {
      doc.setFont("helvetica", l.bold ? "bold" : "normal");
      doc.setFontSize(l.bold ? 10.5 : 9);
      doc.text(l.text, 14 + boxPadX, cy);
    }
    cy += clientLineH;
  });
  const clientBottom = infoY + clientBoxH + 4;

  // Bloc Date / Objet — encadré, à droite (même technique de rendu que l'ancien
  // tableau de référence : hauteur de ligne variable si le texte déborde).
  const boxX = 128;
  const refRows: [string, string][] = [["Date", formatDateLong(d.date_creation)]];
  if (d.dateEcheance) refRows.push(["Échéance", formatDateLong(d.dateEcheance)]);
  if (d.devisReference) refRows.push(["Devis d'origine", d.devisReference]);
  if (d.objet?.trim()) refRows.push(["Objet", d.objet.trim()]);
  if (d.categorieOperation) refRows.push(["Opération", d.categorieOperation]);
  if (d.adresseChantier) refRows.push(["Lieu des travaux", d.adresseChantier]);
  const rowH = 7;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const valLineH = doc.getTextDimensions("A").h;
  // Largeur de la colonne libellé calculée sur le texte le plus long (ex. "DEVIS
  // D'ORIGINE" déborde sur la valeur avec une largeur fixe de 20mm prévue pour "DATE").
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const labelColW = Math.max(...refRows.map((r) => doc.getTextWidth(r[0].toUpperCase()))) + 4;
  const refValX = boxX + labelColW;
  let ry = infoY;
  refRows.forEach((r) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const val = doc.splitTextToSize(r[1], w - 14 - refValX) as string[];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(r[0].toUpperCase(), boxX, ry);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(val, refValX, ry);
    const blockH = rowH + (val.length - 1) * valLineH;
    doc.line(boxX, ry + blockH - 4.5, w - 14, ry + blockH - 4.5);
    ry += blockH;
  });

  const tableStartY = Math.max(clientBottom, ry) + 8;

  // =================== TABLEAU DES LIGNES (démarre page 1, déborde si besoin) ===================
  // Colonne « Remise » affichée uniquement si au moins une ligne porte une remise.
  const hasRemise = d.lignes.some((l) => !l.est_titre && l.remise_pct > 0);
  const N = hasRemise ? 6 : 5;
  const head = [
    hasRemise
      ? ["Désignation", "Unité", "Quantité", "Prix unit. HT", "Remise", "Montant HT"]
      : ["Désignation", "Unité", "Quantité", "Prix unit. HT", "Montant HT"],
  ];
  const titreCount = d.lignes.filter((l) => l.est_titre).length;

  const body: RowInput[] = [];
  const rowCumul: number[] = []; // cumul HT après chaque ligne de body (pour le report)
  let acc = 0,
    secSum = 0,
    secOpen = false;

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
    const isOpt = l.est_option;
    const lib =
      isOpt && !/option|totalis/i.test(l.libelle)
        ? `Option non totalisée — ${l.libelle}`
        : l.libelle;
    const st = isOpt ? { fontStyle: "italic" as const, textColor: GREY } : {};
    const cells: RowInput = [
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
    startY: tableStartY,
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
          0: { cellWidth: "auto" },
          1: { cellWidth: 16, halign: "center" },
          2: { cellWidth: 20, halign: "right" },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 18, halign: "right" },
          5: { cellWidth: 28, halign: "right" },
        }
      : {
          0: { cellWidth: "auto" },
          1: { cellWidth: 18, halign: "center" },
          2: { cellWidth: 22, halign: "right" },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 30, halign: "right" },
        },
    didDrawCell: (data) => {
      if (data.section === "body") {
        pageLastRow[data.pageNumber] = Math.max(pageLastRow[data.pageNumber] ?? -1, data.row.index);
      }
    },
  });

  // =================== TOTAUX ===================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 12;
  if (y > h - 70) {
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
  if (d.autoliquidation) rec("TVA autoliquidée", formatMontant(0));
  else rec(`Taux de TVA (${d.taux_tva}%)`, formatMontant(d.total_tva));
  if (Math.abs(d.arrondi) > 0.0001) rec("Arrondi", formatMontant(d.arrondi));
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(labelX, y - 3, valX, y - 3);
  y += 4;
  doc.setFontSize(11.5);
  // Autoliquidation : pas de TVA facturée, parler de « TTC » serait trompeur.
  const libelleTotal = d.autoliquidation ? "Total net à payer" : "Total TTC net à payer";
  rec(libelleTotal, formatMontant(d.total_ttc), true, [cr, cg, cb]);

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

  // =================== PAIEMENT + VISA ===================
  const boxGap = 8;
  const boxW3 = (w - 28 - boxGap) / 2;
  const boxH3 = 30;
  if (bx + boxH3 > h - 24) {
    doc.addPage();
    bx = 30;
  }

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);

  // Paiement (gauche)
  doc.rect(14, bx, boxW3, boxH3, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.text("Paiement", 17, bx + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const condLines = (
    d.conditions_paiement?.trim()
      ? (doc.splitTextToSize(d.conditions_paiement.trim(), boxW3 - 6) as string[])
      : ["Conditions de paiement à préciser."]
  ).slice(0, 5);
  doc.text(condLines, 17, bx + 13);

  // Visa (droite, 2 colonnes)
  const visaX = 14 + boxW3 + boxGap;
  doc.rect(visaX, bx, boxW3, boxH3, "S");
  doc.line(visaX + boxW3 / 2, bx, visaX + boxW3 / 2, bx + boxH3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text("Visa du client", visaX + 3, bx + 6);
  doc.text("Visa de l'entreprise", visaX + boxW3 / 2 + 3, bx + 6);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  const mention = doc.splitTextToSize(
    "« Bon pour accord, accepte les conditions générales »",
    boxW3 / 2 - 6,
  ) as string[];
  doc.text(mention, visaX + 3, bx + 12);

  // Mentions légales obligatoires sur une facture française (art. L441-10 du Code de
  // commerce) — n'ont pas lieu d'être sur un devis, donc conditionnées à mentionsFacture.
  if (d.mentionsFacture) {
    let my = bx + boxH3 + 10;
    if (my > h - 30) {
      doc.addPage();
      my = 30;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    const mentionsFiscales = [
      d.autoliquidation && MENTION_AUTOLIQUIDATION,
      d.tvaSurDebits && MENTION_TVA_DEBITS,
    ].filter(Boolean) as string[];
    if (mentionsFiscales.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
      const lignesFiscales = doc.splitTextToSize(mentionsFiscales.join(" "), w - 28) as string[];
      doc.text(lignesFiscales, 14, my);
      my += lignesFiscales.length * 3.6 + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
    }
    const mentionsLegales = doc.splitTextToSize(
      "En cas de retard de paiement, une pénalité égale à trois fois le taux d'intérêt " +
        "légal sera exigible, ainsi qu'une indemnité forfaitaire pour frais de " +
        "recouvrement de 40 €, conformément à l'article L441-10 du Code de commerce.",
      w - 28,
    ) as string[];
    doc.text(mentionsLegales, 14, my);
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
    if (pageCount > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(`Page ${p} / ${pageCount}`, w / 2, h - 19, { align: "center" });
    }
    // En-tête compact de suite : uniquement sur les pages 2+ du contenu (le
    // tableau a débordé de la page 1). La page 1 porte déjà son propre en-tête complet.
    if (p >= 2 && p <= contentPages) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.text(d.entite.nom.toUpperCase(), 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(`${label} Nº ${d.numero} — ${dateStr}`, 14, 17.5);
    }
    if (p <= contentPages) {
      // À reporter en bas de page si le tableau continue sur la page suivante
      // (vaut aussi pour la page 1, qui porte désormais le début du tableau).
      if (p < contentPages && pageLastRow[p] != null) {
        const v = rowCumul[pageLastRow[p]] ?? 0;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text("À reporter", w - 46, h - 20, { align: "right" });
        doc.text(formatMontant(v), w - 14, h - 20, { align: "right" });
      }
      // Report du cumul de la page précédente (dès la 2e page, la 1re n'a rien à reporter).
      if (p >= 2 && pageLastRow[p - 1] != null) {
        const v = rowCumul[pageLastRow[p - 1]] ?? 0;
        doc.setFont("helvetica", "normal");
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

// Une facture réutilise entièrement le gabarit devis (même en-tête, même tableau, même
// pied de page) : le type le confirme (PdfFactureData = PdfDevisData avec les 2 champs
// facture-only rendus obligatoires), documentLabel/mentionsFacture sont forcés ici plutôt
// que laissés à la charge de l'appelant.
export type PdfFactureData = PdfDevisData & {
  dateEcheance: string;
  devisReference: string;
};

export function buildFacturePdf(f: PdfFactureData, logoDataUrl?: string): jsPDF {
  return buildDevisPdf({ ...f, documentLabel: "Facture", mentionsFacture: true }, logoDataUrl);
}

export function telechargerFacturePdf(f: PdfFactureData, logoDataUrl?: string): void {
  buildFacturePdf(f, logoDataUrl).save(`Facture ${f.numero}.pdf`);
}
