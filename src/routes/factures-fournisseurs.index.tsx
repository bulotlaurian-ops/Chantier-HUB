import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/ConfirmAction";
import {
  Upload,
  Search,
  FileText,
  CheckCircle2,
  Clock,
  Eye,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Lock,
} from "lucide-react";
import { formatEUR, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  useFactures,
  useCreateFacture,
  useUpdateFacture,
  useValiderFacture,
  useDeleteFacture,
  useSetFichierFacture,
  getSignedUrlFacture,
  ocrFacture,
  type FactureEnrichie,
} from "@/lib/queries/factures";
import { useChantiersList, type ChantierEnrichi } from "@/lib/queries/chantiers";

export const Route = createFileRoute("/factures-fournisseurs/")({ component: FacturesGate });

const TVA_OPTS = ["20", "10", "5.5", "0"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const sommeRepartie = (f: FactureEnrichie) =>
  r2(f.repartitions.reduce((s, r) => s + Number(r.montant_ht_affecte), 0));

function FacturesGate() {
  const { profile } = useAuth();
  if (!profile)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (profile.role === "ouvrier") {
    return (
      <Card className="mt-8 max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <Lock className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Les factures fournisseurs ne sont pas accessibles aux ouvriers.
          </p>
        </CardContent>
      </Card>
    );
  }
  return <FacturesPage isAdmin={profile.role === "admin"} />;
}

function EntiteChip({ entite }: { entite: ChantierEnrichi["entite"] }) {
  if (!entite) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="w-2 h-2 rounded-full" style={{ background: entite.couleur ?? "#999" }} />
      {entite.nom}
    </span>
  );
}

function FacturesPage({ isAdmin }: { isAdmin: boolean }) {
  const { data: factures = [], isLoading } = useFactures();
  const { data: chantiers = [] } = useChantiersList();
  const valider = useValiderFacture();
  const del = useDeleteFacture();

  const chMap = useMemo(() => Object.fromEntries(chantiers.map((c) => [c.id, c])), [chantiers]);
  const entites = useMemo(() => {
    const m = new Map<string, ChantierEnrichi["entite"]>();
    for (const c of chantiers) if (c.entite) m.set(c.entite.id, c.entite);
    return Array.from(m.values());
  }, [chantiers]);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState<"all" | "a_valider" | "valide">("all");
  const [fChantier, setFChantier] = useState("all");
  const [fEntite, setFEntite] = useState("all");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FactureEnrichie | null>(null);

  const entiteDeFacture = (f: FactureEnrichie) =>
    f.repartitions.map((r) => chMap[r.chantier_id]?.entite?.id).filter(Boolean);

  const filtered = useMemo(
    () =>
      factures.filter((f) => {
        if (fStatut !== "all" && f.statut !== fStatut) return false;
        if (fChantier !== "all" && !f.repartitions.some((r) => r.chantier_id === fChantier))
          return false;
        if (fEntite !== "all" && !entiteDeFacture(f).includes(fEntite)) return false;
        if (
          search &&
          !`${f.fournisseur} ${f.numero_facture ?? ""}`.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (du && (!f.date || f.date < du)) return false;
        if (au && (!f.date || f.date > au)) return false;
        return true;
      }),
    [factures, fStatut, fChantier, fEntite, search, du, au, chMap],
  );

  const kpis = useMemo(
    () => ({
      total: filtered.length,
      aValider: filtered.filter((f) => f.statut === "a_valider").length,
      ttc: filtered.reduce((s, f) => s + Number(f.montant_ttc), 0),
    }),
    [filtered],
  );

  const apercu = async (f: FactureEnrichie) => {
    if (!f.fichier_url) {
      toast.info("Aucun fichier joint à cette facture");
      return;
    }
    const url = await getSignedUrlFacture(f.fichier_url);
    if (!url) {
      toast.error("Lien indisponible (droits ou fichier manquant)");
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  const onValider = (f: FactureEnrichie) => {
    // Validation finale = champs complets (la création/brouillon les laisse optionnels).
    if (!f.fournisseur.trim() || Number(f.montant_ht) <= 0) {
      toast.error("Validation impossible", {
        description: "Renseigne le fournisseur et un montant HT avant de valider.",
      });
      return;
    }
    const ecart = r2(Number(f.montant_ht) - sommeRepartie(f));
    if (Math.abs(ecart) > 0.001) {
      toast.error("Validation impossible", {
        description: `La répartition (${formatEUR(sommeRepartie(f))}) doit égaler le montant HT (${formatEUR(Number(f.montant_ht))}). Écart : ${formatEUR(ecart)}.`,
      });
      return;
    }
    valider.mutate(f.id, {
      onSuccess: () => toast.success("Facture validée — intégrée aux coûts réels"),
      onError: (e) => toast.error("Validation refusée : " + (e as Error).message),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factures fournisseurs"
        subtitle={
          isAdmin
            ? "Saisie, répartition et validation"
            : "Saisie et répartition (validation par l'administration)"
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="w-full md:w-auto gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle facture
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Factures</div>
            <div className="text-2xl font-semibold mt-1">{kpis.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">À valider</div>
            <div className="text-2xl font-semibold mt-1 text-amber-600 dark:text-amber-400">
              {kpis.aValider}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Montant cumulé TTC
            </div>
            <div className="text-2xl font-semibold mt-1">{formatEUR(kpis.ttc)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Fournisseur ou n° facture…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={fStatut} onValueChange={(v) => setFStatut(v as typeof fStatut)}>
          <SelectTrigger className="w-full lg:w-40 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="a_valider">À valider</SelectItem>
            <SelectItem value="valide">Validées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fEntite} onValueChange={setFEntite}>
          <SelectTrigger className="w-full lg:w-40 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes entités</SelectItem>
            {entites.map(
              (e) =>
                e && (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom}
                  </SelectItem>
                ),
            )}
          </SelectContent>
        </Select>
        <Select value={fChantier} onValueChange={setFChantier}>
          <SelectTrigger className="w-full lg:w-48 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les chantiers</SelectItem>
            {chantiers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={du}
            onChange={(e) => setDu(e.target.value)}
            className="w-36"
            title="Du"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            type="date"
            value={au}
            onChange={(e) => setAu(e.target.value)}
            className="w-36"
            title="Au"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 md:overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Cartes mobiles */}
              <div className="md:hidden divide-y">
                {filtered.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    Aucune facture sur ce périmètre.
                  </div>
                ) : (
                  filtered.map((f) => {
                    const repTotal = sommeRepartie(f);
                    const ecart = r2(Number(f.montant_ht) - repTotal);
                    const equilibre = Math.abs(ecart) < 0.001;
                    const nbCh = f.repartitions.length;
                    const premierCh = nbCh ? chMap[f.repartitions[0].chantier_id] : null;
                    return (
                      <div key={f.id} className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <FileText
                              className={`w-4 h-4 ${f.nom_fichier ? "text-accent" : "text-muted-foreground"}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{f.fournisseur}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {f.numero_facture ?? "—"} · {f.date ? formatDate(f.date) : "—"}
                            </div>
                          </div>
                          {f.statut === "valide" ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 gap-1 shrink-0"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Validée
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40 gap-1 shrink-0"
                            >
                              <Clock className="w-3 h-3" />À valider
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-xs">
                          <span className="text-muted-foreground truncate">
                            {nbCh === 0
                              ? "non réparti"
                              : nbCh === 1
                                ? (premierCh?.reference ?? "—")
                                : `${nbCh} chantiers`}
                            {!equilibre && nbCh > 0 ? " · écart" : ""}
                          </span>
                          <span className="num-tabular font-medium">
                            {formatEUR(Number(f.montant_ttc))}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Aperçu du fichier"
                            onClick={() => apercu(f)}
                            disabled={!f.fichier_url}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {f.statut === "a_valider" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Modifier"
                              onClick={() => {
                                setEditing(f);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {isAdmin && f.statut === "a_valider" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!equilibre || valider.isPending}
                              onClick={() => onValider(f)}
                            >
                              Valider
                            </Button>
                          )}
                          {isAdmin && (
                            <ConfirmAction
                              trigger={
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Supprimer"
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              }
                              title={`Supprimer la facture « ${f.fournisseur} » ?`}
                              description="La facture et ses répartitions seront supprimées définitivement."
                              confirmLabel="Supprimer"
                              onConfirm={() =>
                                del.mutate(f.id, {
                                  onSuccess: () => toast.success("Facture supprimée"),
                                })
                              }
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {/* Tableau desktop */}
              <table className="hidden md:table w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Fournisseur</th>
                    <th className="text-left px-4 py-3 font-medium">N° / Date</th>
                    <th className="text-left px-4 py-3 font-medium">Affectation</th>
                    <th className="text-right px-4 py-3 font-medium">Réparti / HT</th>
                    <th className="text-right px-4 py-3 font-medium">TTC</th>
                    <th className="text-left px-4 py-3 font-medium">Statut</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => {
                    const repTotal = sommeRepartie(f);
                    const ecart = r2(Number(f.montant_ht) - repTotal);
                    const equilibre = Math.abs(ecart) < 0.001;
                    const nbCh = f.repartitions.length;
                    const premierCh = nbCh ? chMap[f.repartitions[0].chantier_id] : null;
                    return (
                      <tr
                        key={f.id}
                        className="border-t border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <FileText
                                className={`w-4 h-4 ${f.nom_fichier ? "text-accent" : "text-muted-foreground"}`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{f.fournisseur}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {f.nom_fichier ?? "sans fichier"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs">{f.numero_facture ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {f.date ? formatDate(f.date) : "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {nbCh === 0 ? (
                            <span className="text-xs text-muted-foreground italic">
                              non réparti
                            </span>
                          ) : nbCh === 1 ? (
                            <div className="flex items-center gap-2">
                              <EntiteChip entite={premierCh?.entite ?? null} />
                              <span className="text-xs font-mono">
                                {premierCh?.reference ?? "—"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs">{nbCh} chantiers</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div
                            className={`tabular-nums ${equilibre ? "" : "text-amber-600 dark:text-amber-400 font-medium"}`}
                          >
                            {formatEUR(repTotal)}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            / {formatEUR(Number(f.montant_ht))}
                            {!equilibre && ` · écart ${formatEUR(ecart)}`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatEUR(Number(f.montant_ttc))}
                        </td>
                        <td className="px-4 py-3">
                          {f.statut === "valide" ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40 gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Validée
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40 gap-1"
                            >
                              <Clock className="w-3 h-3" />À valider
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex gap-1 items-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Aperçu du fichier"
                              onClick={() => apercu(f)}
                              disabled={!f.fichier_url}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {f.statut === "a_valider" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Modifier"
                                onClick={() => {
                                  setEditing(f);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {isAdmin && f.statut === "a_valider" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!equilibre || valider.isPending}
                                onClick={() => onValider(f)}
                              >
                                Valider
                              </Button>
                            )}
                            {isAdmin && (
                              <ConfirmAction
                                trigger={
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Supprimer"
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                }
                                title={`Supprimer la facture « ${f.fournisseur} » ?`}
                                description="La facture et ses répartitions seront supprimées définitivement."
                                confirmLabel="Supprimer"
                                onConfirm={() =>
                                  del.mutate(f.id, {
                                    onSuccess: () => toast.success("Facture supprimée"),
                                  })
                                }
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                        Aucune facture sur ce périmètre.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      <FactureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        facture={editing}
        chantiers={chantiers}
      />
    </div>
  );
}

// ============================================================
// Formulaire création / édition + répartition + fichier
// ============================================================
interface LigneRep {
  chantier_id: string;
  montant: string;
}

// Champ avec overlay « Extraction en cours… » + highlight vert bref quand l'OCR le remplit.
function ChampOCR({
  label,
  loading,
  flash,
  children,
}: {
  label: string;
  loading: boolean;
  flash?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div
        className={`relative mt-1 rounded-md transition-all duration-500 ${flash ? "ring-2 ring-emerald-400" : "ring-0"}`}
      >
        {children}
        {loading && (
          <div className="absolute inset-0 flex items-center gap-1.5 px-2 rounded-md bg-muted/85 backdrop-blur-[1px] text-xs text-muted-foreground pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Extraction en cours…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FactureDialog({
  open,
  onOpenChange,
  facture,
  chantiers,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  facture: FactureEnrichie | null;
  chantiers: ChantierEnrichi[];
}) {
  const create = useCreateFacture();
  const update = useUpdateFacture();
  const setFichier = useSetFichierFacture();
  const isEdit = !!facture;

  const [factureId, setFactureId] = useState<string | null>(null); // id de travail (créé à l'attache si besoin)
  const [fournisseur, setFournisseur] = useState("");
  const [numero, setNumero] = useState("");
  const [date, setDate] = useState("");
  const [montantHT, setMontantHT] = useState("0");
  const [tva, setTva] = useState("20");
  const [lignes, setLignes] = useState<LigneRep[]>([{ chantier_id: "", montant: "" }]);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const fichierUploade = useRef(false); // évite un double upload au submit
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fichierUploade.current = false;
    setOcrLoading(false);
    setFlash(new Set());
    setFactureId(facture?.id ?? null);
    if (facture) {
      setFournisseur(facture.fournisseur);
      setNumero(facture.numero_facture ?? "");
      setDate(facture.date ?? "");
      setMontantHT(String(facture.montant_ht));
      setTva(String(facture.taux_tva));
      setLignes(
        facture.repartitions.length
          ? facture.repartitions.map((r) => ({
              chantier_id: r.chantier_id,
              montant: String(r.montant_ht_affecte),
            }))
          : [{ chantier_id: "", montant: "" }],
      );
      setFile(null);
    } else {
      setFournisseur("");
      setNumero("");
      setDate("");
      setMontantHT("0");
      setTva("20");
      setLignes([{ chantier_id: "", montant: "" }]);
      setFile(null);
    }
  }, [open, facture]);

  const ht = Number(montantHT.replace(",", ".")) || 0;
  const ttc = r2(ht * (1 + Number(tva) / 100));
  const totalReparti = r2(
    lignes.reduce((s, l) => s + (Number(l.montant.replace(",", ".")) || 0), 0),
  );
  const ecart = r2(ht - totalReparti);
  const equilibre = Math.abs(ecart) < 0.001;
  const pending = create.isPending || update.isPending || setFichier.isPending || ocrLoading;

  const setLigne = (i: number, patch: Partial<LigneRep>) =>
    setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const addLigne = () => setLignes((ls) => [...ls, { chantier_id: "", montant: "" }]);
  const removeLigne = (i: number) =>
    setLignes((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls));
  const toutAffecter = (i: number) =>
    setLignes((ls) =>
      ls.map((l, k) => (k === i ? { ...l, montant: String(ht) } : { ...l, montant: "0" })),
    );

  // Dépôt fichier → (brouillon si pas d'id) → upload → OCR → pré-remplissage.
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    // 1) Garantir un id : crée un brouillon minimal a_valider si besoin (l'OCR a besoin de l'id + path).
    let id = factureId;
    if (!id) {
      try {
        const created = await create.mutateAsync({
          facture: {
            fournisseur: fournisseur.trim(),
            numero_facture: numero.trim() || null,
            date: date || null,
            montant_ht: r2(ht),
            taux_tva: Number(tva),
          },
          repartitions: [],
        });
        id = created.id;
        setFactureId(id);
      } catch (e) {
        toast.error("Création du brouillon impossible : " + (e as Error).message);
        return;
      }
    }
    // 2) Upload (renvoie le path réellement stocké, slug sûr).
    let path: string;
    try {
      path = await setFichier.mutateAsync({ id, file: f });
      fichierUploade.current = true;
    } catch (e) {
      toast.error("Upload du fichier impossible : " + (e as Error).message);
      return;
    }
    // 3) OCR → remplissage des champs non-null + highlight.
    setOcrLoading(true);
    try {
      const ext = await ocrFacture(id, path);
      const flashed = new Set<string>();
      if (ext.fournisseur) {
        setFournisseur(ext.fournisseur);
        flashed.add("fournisseur");
      }
      if (ext.numero_facture) {
        setNumero(ext.numero_facture);
        flashed.add("numero");
      }
      if (ext.date_facture) {
        setDate(ext.date_facture);
        flashed.add("date");
      }
      if (ext.montant_ht != null) {
        setMontantHT(String(ext.montant_ht));
        flashed.add("montant");
      }
      if (ext.taux_tva != null) {
        setTva(String(ext.taux_tva));
        flashed.add("tva");
      }
      if (flashed.size) {
        setFlash(flashed);
        setTimeout(() => setFlash(new Set()), 1600);
        toast.success("Données extraites — vérifie et complète.");
      } else {
        toast.message("Aucune donnée détectée — saisis les champs manuellement.");
      }
    } catch {
      toast.error("Extraction automatique indisponible", {
        description: "Saisie manuelle — les champs restent éditables.",
      });
    } finally {
      setOcrLoading(false);
    }
  };

  // Validation ALLÉGÉE en brouillon : fournisseur/montant non obligatoires (l'OCR/la saisie viendront).
  // La validation finale (bouton « Valider » de la liste) exige les champs complets + Σ = montant.
  const submit = async () => {
    const reparts = lignes
      .filter((l) => l.chantier_id && (Number(l.montant.replace(",", ".")) || 0) > 0)
      .map((l) => ({
        chantier_id: l.chantier_id,
        montant_ht_affecte: r2(Number(l.montant.replace(",", "."))),
      }));
    const payload = {
      fournisseur: fournisseur.trim(),
      numero_facture: numero.trim() || null,
      date: date || null,
      montant_ht: r2(ht),
      taux_tva: Number(tva),
    };
    try {
      let id = factureId;
      if (id) {
        await update.mutateAsync({ id, facture: payload, repartitions: reparts });
      } else {
        const created = await create.mutateAsync({ facture: payload, repartitions: reparts });
        id = created.id;
      }
      if (file && id && !fichierUploade.current) await setFichier.mutateAsync({ id, file });
      toast.success("Facture enregistrée (brouillon)", {
        description: equilibre
          ? undefined
          : "Répartition partielle — à compléter avant validation.",
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Échec : " + (e as Error).message);
    }
  };

  const nomFichierActuel = file?.name ?? facture?.nom_fichier ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier la facture" : "Nouvelle facture fournisseur"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1) Zone de dépôt — point d'entrée, grande et en premier */}
          <div
            onClick={() => !ocrLoading && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!ocrLoading) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!ocrLoading) void onFile(e.dataTransfer.files?.[0]);
            }}
            className={`border-2 border-dashed rounded-xl py-10 px-4 text-center transition-colors ${ocrLoading ? "opacity-80 cursor-wait" : "cursor-pointer"} ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent hover:bg-accent/5"}`}
          >
            {ocrLoading ? (
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                Extraction en cours…
              </div>
            ) : nomFichierActuel ? (
              <>
                <FileText className="w-8 h-8 mx-auto text-accent" />
                <div className="text-sm font-medium mt-1 truncate">{nomFichierActuel}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Déposez un autre fichier pour le remplacer
                </div>
              </>
            ) : (
              <>
                <Upload className="w-9 h-9 mx-auto text-muted-foreground" />
                <div className="text-base font-medium mt-2">
                  Déposez votre facture PDF ou photo ici
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ou cliquez pour parcourir · les champs seront extraits automatiquement
                </div>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {/* 2) Champs (pré-remplis par OCR si fichier déposé, sinon vides) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <ChampOCR label="Fournisseur" loading={ocrLoading} flash={flash.has("fournisseur")}>
                <Input
                  value={fournisseur}
                  onChange={(e) => setFournisseur(e.target.value)}
                  disabled={ocrLoading}
                  placeholder="ex : Sanitas Troesch SA"
                />
              </ChampOCR>
            </div>
            <ChampOCR label="N° facture" loading={ocrLoading} flash={flash.has("numero")}>
              <Input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                disabled={ocrLoading}
              />
            </ChampOCR>
            <ChampOCR label="Date facture" loading={ocrLoading} flash={flash.has("date")}>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={ocrLoading}
              />
            </ChampOCR>
            <ChampOCR label="Montant HT" loading={ocrLoading} flash={flash.has("montant")}>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={montantHT}
                onChange={(e) => setMontantHT(e.target.value)}
                disabled={ocrLoading}
                className="tabular-nums"
              />
            </ChampOCR>
            <ChampOCR label="TVA %" loading={ocrLoading} flash={flash.has("tva")}>
              <Select value={tva} onValueChange={setTva} disabled={ocrLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TVA_OPTS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t} %
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ChampOCR>
          </div>

          {/* 3) Total TTC */}
          <div className="rounded-md bg-muted/40 p-3 flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Total TTC</span>
            <span className="text-lg font-semibold tabular-nums">{formatEUR(ttc)}</span>
          </div>

          {/* 4) Répartition */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Répartition par chantier
              </Label>
              <Button size="sm" variant="ghost" onClick={addLigne}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Ajouter
              </Button>
            </div>
            <div className="space-y-2">
              {/* Ligne empilée sur écran étroit : la référence de chantier est longue
                  et le SelectTrigger est en whitespace-nowrap — sur une seule rangée,
                  elle élargissait le dialog au-delà de l'écran et rendait le bouton
                  « Enregistrer » inatteignable. */}
              {lignes.map((l, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <Select
                    value={l.chantier_id}
                    onValueChange={(v) => setLigne(i, { chantier_id: v })}
                  >
                    <SelectTrigger className="w-full sm:flex-1 min-w-0">
                      <SelectValue placeholder="Chantier" />
                    </SelectTrigger>
                    <SelectContent>
                      {chantiers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-mono text-xs mr-2 text-muted-foreground">
                            {c.reference}
                          </span>
                          {c.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.montant}
                      onChange={(e) => setLigne(i, { montant: e.target.value })}
                      placeholder="Montant HT"
                      className="flex-1 sm:w-28 tabular-nums"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      title="Tout affecter à ce chantier"
                      onClick={() => toutAffecter(i)}
                    >
                      = total
                    </Button>
                    <button
                      onClick={() => removeLigne(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      disabled={lignes.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div
              className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 justify-between items-center text-sm rounded-md p-2 ${equilibre ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}
            >
              <span>
                Réparti :{" "}
                <span className="tabular-nums font-medium">{formatEUR(totalReparti)}</span> /{" "}
                {formatEUR(r2(ht))}
              </span>
              <span className="tabular-nums">
                {equilibre ? "Équilibré ✓" : `Écart : ${formatEUR(ecart)}`}
              </span>
            </div>
            {!equilibre && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Enregistrement possible en brouillon. La validation exigera une répartition égale au
                montant HT.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
