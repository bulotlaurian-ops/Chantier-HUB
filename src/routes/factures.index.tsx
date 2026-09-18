import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useEntites } from "@/lib/queries/entites";
import { useEntiteFilter } from "@/lib/entite-filter";
import { PageHeader } from "@/components/Badges";
import { EntiteChip, StatutFactureChip } from "@/components/ChantierBadges";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatEURShort } from "@/lib/format";
import { Search, Loader2, FileDown, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useFacturesList,
  useUpdateFactureStatut,
  useUpdateFactureEcheance,
  fetchFactureDetail,
  type FactureEnrichieClient,
} from "@/lib/queries/factures";
import { telechargerFacturePdf, type PdfFactureData } from "@/lib/pdf";

export const Route = createFileRoute("/factures/")({ component: FacturesListe });

// Même dance fetch + fetch logo + conversion JPEG que sur la fiche devis (src/routes/
// devis.$id.tsx) : le logo n'est jamais bundlé, toujours re-fetché en JPEG pour
// contourner un décodeur PNG fragile pour jsPDF, cf. urlToDataUrl dans devis.$id.tsx.
// Dupliqué ici car la liste n'a pas d'état de devis en mémoire pour appeler la même
// fonction — même logique, fichier différent.
const LOGOS: Record<string, string> = { PRO: "/logos/logo-pro.png" };

async function urlToDataUrl(url: string): Promise<string> {
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

function FacturesListe() {
  const { currentEntiteId } = useEntiteFilter();
  const { data: storeEntites = [] } = useEntites();
  const { data: facturesData = [], isLoading, isError, error } = useFacturesList();
  const updateStatut = useUpdateFactureStatut();
  const updateEcheance = useUpdateFactureEcheance();
  const [q, setQ] = useState("");
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const selectedCode =
    currentEntiteId === "all"
      ? "all"
      : (storeEntites.find((e) => e.id === currentEntiteId)?.code ?? "all");

  const factures = useMemo(() => {
    return facturesData
      .filter((f) => selectedCode === "all" || f.entite?.code === selectedCode)
      .filter((f) => {
        if (!q) return true;
        const t = q.toLowerCase();
        return (
          f.numero.toLowerCase().includes(t) || (f.client?.nom ?? "").toLowerCase().includes(t)
        );
      });
  }, [facturesData, selectedCode, q]);

  const telecharger = async (f: FactureEnrichieClient) => {
    setPdfLoadingId(f.id);
    try {
      const detail = await fetchFactureDetail(f.id);
      const code = detail.entite?.code ?? "";
      const logoUrl = LOGOS[code];
      const logo = logoUrl
        ? await urlToDataUrl(logoUrl).catch((e) => {
            console.error("[pdf] logo non converti :", e);
            return undefined;
          })
        : undefined;
      const tauxAffiche =
        detail.total_ht > 0
          ? Math.round((detail.total_tva / detail.total_ht) * 1000) / 10
          : (detail.lignes[0]?.taux_tva ?? 20);
      const data: PdfFactureData = {
        numero: detail.numero,
        date_creation: detail.date_emission,
        dateEcheance: detail.date_echeance,
        devisReference: detail.devis?.numero ?? "",
        objet: null,
        entite: {
          nom: detail.entite?.nom ?? "",
          code,
          couleur: detail.entite?.couleur ?? "#1F2937",
        },
        client: {
          nom: detail.client?.nom ?? "",
          adresse: detail.client?.adresse,
          ville: detail.client?.ville,
          telephone: detail.client?.telephone,
          email: detail.client?.email,
        },
        lignes: detail.lignes.map((l) => ({
          libelle: l.libelle,
          unite: l.unite,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          remise_pct: l.remise_pct,
          total_ht: l.total_ht,
          est_titre: l.est_titre,
          est_option: l.est_option,
        })),
        total_ht: detail.total_ht,
        total_tva: detail.total_tva,
        total_ttc: detail.total_ttc,
        arrondi: detail.arrondi,
        taux_tva: tauxAffiche,
        conditions_paiement: null,
        notes: null,
      };
      telechargerFacturePdf(data, logo);
    } catch (e) {
      toast.error("Téléchargement impossible : " + (e as Error).message);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const basculerPayee = (f: FactureEnrichieClient) => {
    const next = f.statut === "payee" ? "emise" : "payee";
    updateStatut.mutate(
      { id: f.id, statut: next },
      {
        onSuccess: () =>
          toast.success(next === "payee" ? "Facture marquée payée" : "Facture repassée en émise"),
      },
    );
  };

  // Échéance éditable directement dans la liste (cf. spec : 30 jours par défaut à la
  // création, mais modifiable au cas par cas puisque conditions_paiement est un texte
  // libre non exploitable automatiquement).
  const changerEcheance = (f: FactureEnrichieClient, dateEcheance: string) => {
    if (!dateEcheance || dateEcheance === f.date_echeance) return;
    updateEcheance.mutate(
      { id: f.id, date_echeance: dateEcheance },
      { onSuccess: () => toast.success("Échéance mise à jour") },
    );
  };

  return (
    <div>
      <PageHeader title="Facture" subtitle={`${factures.length} facture(s)`} />

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher numéro ou client"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 md:overflow-x-auto">
          {/* Cartes mobiles */}
          <div className="md:hidden divide-y">
            {isLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </div>
            ) : isError ? (
              <div className="py-10 text-center text-destructive text-sm">
                Erreur de chargement.
              </div>
            ) : factures.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Aucune facture.</div>
            ) : (
              factures.map((f) => (
                <div key={f.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-primary">{f.numero}</span>
                    <StatutFactureChip statut={f.statut} date_echeance={f.date_echeance} />
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">{f.client?.nom}</div>
                  <div className="flex items-center justify-between mt-1.5">
                    <EntiteChip entite={f.entite} />
                    <span className="num-tabular font-semibold">{formatEURShort(f.total_ttc)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      Échéance
                      <input
                        type="date"
                        value={f.date_echeance}
                        onChange={(e) => changerEcheance(f, e.target.value)}
                        className="bg-transparent border-b border-dashed border-muted-foreground/40 text-xs text-foreground"
                      />
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => basculerPayee(f)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        title={f.statut === "payee" ? "Repasser en émise" : "Marquer payée"}
                      >
                        <CircleCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => telecharger(f)}
                        disabled={pdfLoadingId === f.id}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        title="Télécharger le PDF"
                      >
                        {pdfLoadingId === f.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Tableau desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Numéro</th>
                <th className="text-left px-4 py-3 font-medium">Entité</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-right px-4 py-3 font-medium">TTC</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Échéance</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
                  </td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-destructive">
                    Erreur de chargement : {(error as Error)?.message}
                  </td>
                </tr>
              )}
              {!isLoading && !isError && factures.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">
                    Aucune facture.
                  </td>
                </tr>
              )}
              {factures.map((f) => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-primary">{f.numero}</td>
                  <td className="px-4 py-3">
                    <EntiteChip entite={f.entite} />
                  </td>
                  <td className="px-4 py-3">{f.client?.nom}</td>
                  <td className="px-4 py-3 text-right num-tabular">
                    {formatEURShort(f.total_ttc)}
                  </td>
                  <td className="px-4 py-3">
                    <StatutFactureChip statut={f.statut} date_echeance={f.date_echeance} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    <input
                      type="date"
                      value={f.date_echeance}
                      onChange={(e) => changerEcheance(f, e.target.value)}
                      className="bg-transparent border-b border-dashed border-muted-foreground/40 text-xs text-foreground"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => basculerPayee(f)}>
                        {f.statut === "payee" ? "Repasser en émise" : "Marquer payée"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => telecharger(f)}
                        disabled={pdfLoadingId === f.id}
                      >
                        {pdfLoadingId === f.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
