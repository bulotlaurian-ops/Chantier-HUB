import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/Badges";
import { EntiteChip, CategorieChip } from "@/components/ChantierBadges";
import { ConditionsTemplates } from "@/components/ConditionsTemplates";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR, formatDate, pct } from "@/lib/format";
import {
  useDevis,
  useUpdateDevis,
  useUpdateDevisStatut,
  useDeleteDevis,
  useArchiveDevis,
  useDuplicateDevis,
  useCreateVersionDevis,
  useVersionsDevis,
  numeroVersion,
  type DevisRow,
  type DevisDetail,
} from "@/lib/queries/devis";
import { useConditionsPaiement } from "@/lib/queries/conditions";
import { telechargerDevisPdf, telechargerFacturePdf, type PdfFactureData } from "@/lib/pdf";
import { useCreateFactureClient, useFactureParDevis } from "@/lib/queries/factures";
import {
  ArrowLeft,
  Loader2,
  FileDown,
  Trash2,
  Archive,
  RotateCcw,
  Pencil,
  Copy,
  Layers,
  Receipt,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/devis/$id")({ component: DevisDetail });

const STATUTS: { value: DevisRow["statut"]; label: string }[] = [
  { value: "brouillon", label: "Brouillon" },
  { value: "envoye", label: "Envoyé" },
  { value: "accepte", label: "Accepté" },
  { value: "refuse", label: "Refusé" },
  { value: "expire", label: "Expiré" },
];

// Logos servis depuis public/logos/ (chargés par fetch → dataURL). Les coordonnées
// tél/email/site par entité sont centralisées dans src/lib/pdf.ts.
const LOGOS: Record<string, string> = {
  PRO: "/logos/logo-pro.png",
};

// Repasse par un <canvas> pour ré-encoder en JPEG plutôt que de renvoyer le PNG
// tel quel : le décodeur PNG interne de jsPDF est fragile (échoue sur des PNG
// pourtant valides — plusieurs chunks IDAT, CRC recalculés, etc.). Décodage via
// <img> (pas createImageBitmap, qui a refusé ce PNG pourtant valide - CRC et
// flux zlib vérifiés octet par octet côté serveur) : la voie <img> est la plus
// ancienne et la plus tolérante des deux. Fond blanc peint avant dessin : le
// JPEG n'a pas de canal alpha.
async function urlToDataUrl(url: string): Promise<string> {
  // cache: "no-store" — le fichier logo a été corrigé plusieurs fois côté disque
  // pendant le développement ; on évite qu'une réponse mise en cache par le
  // navigateur (potentiellement une ancienne version) soit réutilisée.
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image invalide (décodage <img> échoué)"));
      el.src = objectUrl;
    });
    // Redimensionne à une largeur raisonnable pour un logo imprimé (~700px, largement
    // suffisant à l'échelle où il est utilisé) : fichier plus léger, moins de risque
    // de heurter une limite de taille du côté de l'intégration d'image de jsPDF.
    const targetW = Math.min(700, img.naturalWidth);
    const targetH = Math.round((img.naturalHeight / img.naturalWidth) * targetW);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponible");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function DevisDetail() {
  const { id } = Route.useParams();
  const { data: d, isLoading } = useDevis(id);
  const updateStatut = useUpdateDevisStatut();
  const deleteDevis = useDeleteDevis();
  const archiveDevis = useArchiveDevis();
  const dup = useDuplicateDevis();
  const version = useCreateVersionDevis();
  const { data: versions = [] } = useVersionsDevis(d?.numero);
  const nav = useNavigate();
  const [pdfLoading, setPdfLoading] = useState(false);
  const facturer = useCreateFactureClient();
  const { data: factureExistante } = useFactureParDevis(d?.id);

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!d) return <div className="text-sm text-muted-foreground">Devis introuvable.</div>;

  const archived = !!d.archive_at;

  // Mapping DevisDetail → champs communs devis/facture (numéro, date, échéance,
  // référence devis d'origine EXCLUS : propres à chaque appelant). Partagé par
  // genererPdf et facturerDevis pour ne pas dupliquer la résolution du logo.
  const donneesPdfCommunes = async () => {
    const code = d.entite?.code ?? "";
    const logoUrl = LOGOS[code];
    const logo = logoUrl
      ? await urlToDataUrl(logoUrl).catch((e) => {
          console.error("[pdf] logo non converti :", e);
          return undefined;
        })
      : undefined;
    const tauxAffiche =
      d.total_ht > 0
        ? Math.round((d.total_tva / d.total_ht) * 1000) / 10
        : (d.lignes[0]?.taux_tva ?? 20);
    return {
      logo,
      entite: { nom: d.entite?.nom ?? "", code, couleur: d.entite?.couleur ?? "#1F2937" },
      client: {
        nom: d.client?.nom ?? "",
        adresse: d.client?.adresse,
        ville: d.client?.ville,
        telephone: d.client?.telephone,
        email: d.client?.email,
      },
      lignes: d.lignes.map((l) => ({
        libelle: l.libelle,
        unite: l.unite,
        quantite: l.quantite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        remise_pct: l.remise_pct,
        total_ht: l.total_ht,
        est_titre: l.est_titre,
        est_option: l.est_option,
      })),
      total_ht: d.total_ht,
      total_tva: d.total_tva,
      total_ttc: d.total_ttc,
      arrondi: d.arrondi,
      taux_tva: tauxAffiche,
    };
  };

  const genererPdf = async () => {
    setPdfLoading(true);
    try {
      const { logo, ...commun } = await donneesPdfCommunes();
      telechargerDevisPdf(
        {
          ...commun,
          numero: d.numero,
          date_creation: d.date_creation,
          objet: d.objet,
          conditions_paiement: d.conditions_paiement,
          notes: d.notes,
        },
        logo,
      );
    } catch (e) {
      toast.error("Génération PDF impossible : " + (e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  const facturerDevis = async () => {
    setPdfLoading(true);
    try {
      const f = await facturer.mutateAsync(d);
      const { logo, ...commun } = await donneesPdfCommunes();
      const data: PdfFactureData = {
        ...commun,
        numero: f.numero,
        date_creation: f.date_emission,
        objet: d.objet,
        conditions_paiement: d.conditions_paiement,
        notes: d.notes,
        dateEcheance: f.date_echeance,
        devisReference: d.numero,
      };
      telechargerFacturePdf(data, logo);
      toast.success(`Facture ${f.numero} créée`);
    } catch (e) {
      toast.error("Facturation impossible : " + (e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      <Link
        to="/devis"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="w-3 h-3" />
        Devis
      </Link>
      <PageHeader
        title={d.numero}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <EntiteChip entite={d.entite} />
            <CategorieChip libelle={d.client?.categorie?.libelle} />
            {archived && (
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Archivé
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={d.statut}
              onValueChange={(v) =>
                updateStatut.mutate({ id: d.id, statut: v as DevisRow["statut"] })
              }
            >
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={genererPdf} disabled={pdfLoading}>
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-1" />
              )}
              Télécharger le PDF
            </Button>
            {!archived && d.statut === "accepte" && !factureExistante && (
              <Button
                variant="outline"
                onClick={facturerDevis}
                disabled={pdfLoading || facturer.isPending}
              >
                {facturer.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Receipt className="w-4 h-4 mr-1" />
                )}
                Facturer
              </Button>
            )}
            {factureExistante && (
              <Link
                to="/factures"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline self-center"
              >
                Facture {factureExistante.numero} déjà émise
              </Link>
            )}
            {!archived && d.statut === "brouillon" && (
              <Link to="/devis/nouveau" search={{ edit: d.id }}>
                <Button variant="outline">
                  <Pencil className="w-4 h-4 mr-1" />
                  Modifier
                </Button>
              </Link>
            )}
            {!archived && d.statut !== "brouillon" && (
              <Button
                variant="outline"
                disabled={version.isPending}
                onClick={async () => {
                  try {
                    const nd = await version.mutateAsync(d);
                    toast.success(`Nouvelle version créée : ${nd.numero}`);
                    nav({ to: "/devis/nouveau", search: { edit: nd.id } });
                  } catch (e) {
                    toast.error("Création de version impossible : " + (e as Error).message);
                  }
                }}
              >
                {version.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Layers className="w-4 h-4 mr-1" />
                )}
                Nouvelle version
              </Button>
            )}
            {d.statut !== "brouillon" && (
              <Button
                variant="outline"
                disabled={dup.isPending}
                onClick={async () => {
                  try {
                    const nd = await dup.mutateAsync(d);
                    toast.success(`Devis dupliqué en brouillon : ${nd.numero}`);
                    nav({ to: "/devis/nouveau", search: { edit: nd.id } });
                  } catch (e) {
                    toast.error("Duplication impossible : " + (e as Error).message);
                  }
                }}
              >
                {dup.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4 mr-1" />
                )}
                Dupliquer
              </Button>
            )}
            {archived ? (
              <Button
                variant="outline"
                onClick={() =>
                  archiveDevis.mutate(
                    { id: d.id, restore: true },
                    { onSuccess: () => toast.success("Devis restauré") },
                  )
                }
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Restaurer
              </Button>
            ) : d.statut === "brouillon" ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Supprimer
                  </Button>
                }
                title={`Supprimer définitivement ${d.numero} ?`}
                description="Cette action est irréversible : le devis et ses lignes seront effacés."
                confirmLabel="Supprimer définitivement"
                destructive
                requireCheck
                onConfirm={() =>
                  deleteDevis.mutate(d.id, {
                    onSuccess: () => {
                      toast.success("Devis supprimé");
                      nav({ to: "/devis" });
                    },
                    onError: (e) => toast.error("Suppression impossible : " + (e as Error).message),
                  })
                }
              />
            ) : (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Archive className="w-4 h-4 mr-1" />
                    Archiver
                  </Button>
                }
                title={`Archiver ${d.numero} ?`}
                description="Le devis sera masqué des listes mais conservé (restaurable à tout moment)."
                confirmLabel="Archiver"
                onConfirm={() =>
                  archiveDevis.mutate(
                    { id: d.id },
                    { onSuccess: () => toast.success("Devis archivé") },
                  )
                }
              />
            )}
          </div>
        }
      />

      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-xs text-muted-foreground mr-1">Versions :</span>
          {versions.map((v) =>
            v.id === d.id ? (
              <span
                key={v.id}
                title={`${v.numero} — ${v.statut}`}
                className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-xs font-mono"
              >
                v{numeroVersion(v.numero)}
              </span>
            ) : (
              <Link
                key={v.id}
                to="/devis/$id"
                params={{ id: v.id }}
                title={`${v.numero} — ${v.statut}${v.archive_at ? " (archivé)" : ""}`}
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 ${v.archive_at ? "opacity-50" : ""}`}
              >
                v{numeroVersion(v.numero)}
              </Link>
            ),
          )}
        </div>
      )}

      <EditionDevis devis={d} readOnly={d.statut !== "brouillon"} />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">CFC</th>
                  <th className="text-left px-3 py-2">Libellé</th>
                  <th className="text-right px-3 py-2">Qté</th>
                  <th className="text-left px-3 py-2">Unité</th>
                  <th className="text-right px-3 py-2">PU HT</th>
                  <th className="text-right px-3 py-2">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {d.lignes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucune ligne.
                    </td>
                  </tr>
                )}
                {d.lignes.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {l.code ?? ""}
                    </td>
                    <td className="px-3 py-2">
                      <span className={l.est_titre ? "font-semibold" : ""}>
                        {l.libelle}
                        {l.est_option ? " (option)" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right num-tabular">{l.quantite}</td>
                    <td className="px-3 py-2">{l.unite}</td>
                    <td className="px-3 py-2 text-right num-tabular">
                      {formatEUR(l.prix_unitaire_ht)}
                    </td>
                    <td className="px-3 py-2 text-right num-tabular">{formatEUR(l.total_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Client
              </div>
              <div>{d.client?.nom}</div>
              <div className="text-muted-foreground">
                {d.client?.adresse}, {d.client?.ville}
              </div>
              {d.chantier && (
                <div className="pt-2 border-t mt-2 text-xs">
                  <span className="font-mono">{d.chantier.reference}</span> — {d.chantier.nom}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Créé le {formatDate(d.date_creation)}
                {d.date_validite ? ` · Validité ${formatDate(d.date_validite)}` : ""}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-1 text-sm">
              <Row label="Total HT" value={formatEUR(d.total_ht)} />
              <Row label="TVA" value={formatEUR(d.total_tva)} />
              <Row label="Total TTC" value={formatEUR(d.total_ttc)} bold />
            </CardContent>
          </Card>
          {/* Marge dérivée (affichée, jamais validée en amont — §5) */}
          <Card>
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Marge (dérivée)
              </div>
              <Row label="Coût de revient" value={formatEUR(d.cout_revient_total)} />
              <Row label="Marge estimée" value={formatEUR(d.marge)} bold />
              <Row
                label="Taux de marge"
                value={d.total_ht > 0 && d.taux_marge != null ? pct(d.taux_marge, 1) : "—"}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`num-tabular ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function EditionDevis({ devis, readOnly }: { devis: DevisDetail; readOnly?: boolean }) {
  const update = useUpdateDevis();
  const { data: options = [] } = useConditionsPaiement(devis.entite_id ?? undefined);
  const [objet, setObjet] = useState(devis.objet ?? "");
  const [conditions, setConditions] = useState(devis.conditions_paiement ?? "");
  const [notes, setNotes] = useState(devis.notes ?? "");

  const dirty =
    objet !== (devis.objet ?? "") ||
    conditions !== (devis.conditions_paiement ?? "") ||
    notes !== (devis.notes ?? "");
  const save = () =>
    update.mutate(
      {
        id: devis.id,
        patch: {
          objet: objet.trim() || null,
          conditions_paiement: conditions.trim() || null,
          notes: notes.trim() || null,
        },
      },
      { onSuccess: () => toast.success("Devis mis à jour") },
    );

  // Devis émis = lecture seule (l'édition se fait par duplication en brouillon).
  if (readOnly) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4 grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Objet du devis</div>
            <div className="whitespace-pre-line">
              {devis.objet || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">
              Conditions de paiement
            </div>
            <div className="whitespace-pre-line">
              {devis.conditions_paiement || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-muted-foreground mb-1">Notes et remarques</div>
            <div className="whitespace-pre-line">
              {devis.notes || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">
              Objet du devis (intro PDF)
            </Label>
            <Textarea
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              rows={3}
              className="mt-1"
              placeholder="Ex : Veuillez trouver ci-joint notre offre de prix pour le remplacement de votre garde-corps…"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Conditions de paiement
              </Label>
              {options.length > 0 && (
                <Select onValueChange={(v) => setConditions(v.replace(/ \/ /g, "\n"))}>
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue placeholder="Modèle…" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.libelle}>
                        {o.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <ConditionsTemplates value={conditions} onSelect={setConditions} />
            <Textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={3}
              className="mt-1"
              placeholder={"Ex :\n50% acompte\n30% à la livraison\nsolde à réception"}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase text-muted-foreground">Notes et remarques</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className="mt-1"
            placeholder="Planning, inclus/exclus, remarques particulières..."
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
