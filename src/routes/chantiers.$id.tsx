import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/Badges";
import { EntiteChip } from "@/components/ChantierBadges";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR, formatDate, formatHeures } from "@/lib/format";
import {
  usePointages,
  useTogglePointageComptabilise,
  useDeletePointage,
} from "@/lib/queries/pointages";
import { useParametres, paramNumber } from "@/lib/queries/parametres";
import { Badge } from "@/components/ui/badge";
import {
  useChantier,
  useUpdateChantierStatut,
  useArchiveChantier,
  useDeleteChantier,
  useChantierCoutsReels,
  evalMarge,
  type ChantierCouts,
} from "@/lib/queries/chantiers";
import { messageSuppression } from "./clients.$id";
import { useDevisList } from "@/lib/queries/devis";
import {
  useFacturesChantier,
  useToggleRepartitionComptabilisee,
  useDeleteRepartition,
  useFacturesAffectables,
  useCreateRepartition,
  useValiderFacture,
} from "@/lib/queries/factures";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Tables } from "@/lib/database.types";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Loader2,
  TrendingUp,
  Archive,
  RotateCcw,
  Receipt,
  CheckCircle2,
  Clock,
  Trash2,
  EyeOff,
  Eye,
  Plus,
} from "lucide-react";

const a05 = (n: number) => Math.round(n * 100) / 100;

export const Route = createFileRoute("/chantiers/$id")({ component: ChantierDetail });

const STATUTS: { value: Tables<"chantiers">["statut"]; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "actif", label: "Actif" },
  { value: "cloture", label: "Clôturé" },
];

function ChantierDetail() {
  const { id } = Route.useParams();
  const { data: c, isLoading } = useChantier(id);
  const { data: allDevis = [] } = useDevisList();
  const { profile } = useAuth();
  const isOuvrier = profile?.role === "ouvrier";
  const { data: couts = {} } = useChantierCoutsReels(!isOuvrier);
  const updateStatut = useUpdateChantierStatut();
  const archiveChantier = useArchiveChantier();
  const deleteChantier = useDeleteChantier();
  const nav = useNavigate();

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!c) return <div className="text-sm text-muted-foreground">Chantier introuvable.</div>;

  const archived = !!c.archive_at;
  const devis = allDevis.filter((d) => d.chantier_id === c.id);

  return (
    <div>
      <Link
        to="/chantiers"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="w-3 h-3" />
        Chantiers
      </Link>
      <PageHeader
        title={c.nom}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{c.reference}</span>
            <EntiteChip entite={c.entite} />
            {archived && (
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Archivé
              </span>
            )}
            <span className="text-xs">
              · {c.adresse}, {c.ville}
            </span>
            <span className="text-xs">
              · {formatDate(c.date_debut ?? "")} → {formatDate(c.date_fin_prevue ?? "")}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Statut</span>
            <Select
              value={c.statut}
              onValueChange={(v) =>
                updateStatut.mutate({ id: c.id, statut: v as Tables<"chantiers">["statut"] })
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
            {archived ? (
              <Button
                variant="outline"
                onClick={() =>
                  archiveChantier.mutate(
                    { id: c.id, restore: true },
                    { onSuccess: () => toast.success("Chantier restauré") },
                  )
                }
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Restaurer
              </Button>
            ) : (
              <>
                <ConfirmAction
                  trigger={
                    <Button variant="outline">
                      <Archive className="w-4 h-4 mr-1" />
                      Archiver
                    </Button>
                  }
                  title={`Archiver le chantier « ${c.nom} » ?`}
                  description="Le chantier sera masqué des listes mais conservé (restaurable à tout moment)."
                  confirmLabel="Archiver"
                  onConfirm={() =>
                    archiveChantier.mutate(
                      { id: c.id },
                      { onSuccess: () => toast.success("Chantier archivé") },
                    )
                  }
                />
                <ConfirmAction
                  trigger={
                    <Button variant="outline" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4 mr-1" />
                      Supprimer
                    </Button>
                  }
                  title={`Supprimer définitivement « ${c.nom} » ?`}
                  description="Action irréversible : le chantier sera effacé. Refusé automatiquement si des devis, pointages ou factures y sont liés — utilise l'archivage dans ce cas."
                  confirmLabel="Supprimer définitivement"
                  destructive
                  requireCheck
                  onConfirm={() =>
                    deleteChantier.mutate(c.id, {
                      onSuccess: () => {
                        toast.success("Chantier supprimé");
                        nav({ to: "/chantiers" });
                      },
                      onError: (e) =>
                        toast.error(
                          messageSuppression(
                            e as Error,
                            "chantier",
                            "des devis, pointages ou factures",
                          ),
                        ),
                    })
                  }
                />
              </>
            )}
          </div>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Client</div>
            <div className="font-medium">{c.client?.nom ?? "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Devis liés
            </div>
            {devis.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun devis lié.</div>
            ) : (
              <div className="space-y-2">
                {devis.map((d) => (
                  <Link
                    key={d.id}
                    to="/devis/$id"
                    params={{ id: d.id }}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/40 border"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-xs">{d.numero}</span>
                    </div>
                    <div className="text-sm num-tabular">{formatEUR(d.total_ttc)}</div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isOuvrier && <HeuresChantierBloc chantierId={c.id} />}

      {!isOuvrier && <FacturesChantierBloc chantierId={c.id} />}

      {!isOuvrier && <MargeReelleBloc couts={couts[c.id]} />}
    </div>
  );
}

// Heures pointées sur le chantier, agrégées par ouvrier. Le coût main-d'œuvre
// correspondant (Σ heures × taux horaire de chaque ouvrier) est calculé par la
// vue chantier_couts_reels et affiché dans le bloc « Marge réelle » ci-dessous ;
// il se met à jour automatiquement à chaque pointage.
function HeuresChantierBloc({ chantierId }: { chantierId: string }) {
  const { data: pointages = [] } = usePointages();
  const { data: params } = useParametres();
  const toggle = useTogglePointageComptabilise();
  const supprimer = useDeletePointage();
  // Même formule que la vue chantier_couts_reels : taux du profil, sinon le
  // paramètre taux_horaire_defaut — les totaux collent au bloc Marge.
  const tauxDefaut = paramNumber(params, "taux_horaire_defaut", 70);

  const lignes = useMemo(
    () =>
      pointages
        .filter((p) => p.chantier_id === chantierId)
        .map((p) => {
          const taux = p.ouvrier?.taux_horaire ?? null;
          const heures = Number(p.heures_travaillees ?? 0);
          return {
            id: p.id,
            date: p.date,
            nom: p.ouvrier
              ? `${p.ouvrier.prenom ?? ""} ${p.ouvrier.nom}`.trim()
              : "Ouvrier inconnu",
            heures,
            trajet: Number(p.heures_trajet ?? 0),
            taux,
            cout: heures * (taux ?? tauxDefaut),
            comptabilise: p.comptabilise !== false,
            note: p.note,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [pointages, chantierId, tauxDefaut],
  );

  const comptees = lignes.filter((l) => l.comptabilise);
  const totalHeures = comptees.reduce((s, l) => s + l.heures, 0);
  const totalCout = comptees.reduce((s, l) => s + l.cout, 0);
  const exclues = lignes.filter((l) => !l.comptabilise);

  return (
    <Card className="mt-4">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Heures pointées
          </span>
        </div>
        {lignes.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Aucun pointage sur ce chantier pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-2 py-2 w-24">Date</th>
                  <th className="text-left px-2 py-2">Ouvrier</th>
                  <th className="text-right px-2 py-2 w-20">Heures</th>
                  <th className="text-right px-2 py-2 w-20">Trajet</th>
                  <th className="text-right px-2 py-2 w-24">Taux</th>
                  <th className="text-right px-2 py-2 w-28">Coût</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b last:border-0 ${l.comptabilise ? "" : "opacity-50"}`}
                  >
                    <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(l.date)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{l.nom}</div>
                      {l.note && <div className="text-[11px] text-muted-foreground">{l.note}</div>}
                      {!l.comptabilise && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400">
                          exclu de la marge
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right num-tabular">{formatHeures(l.heures)}</td>
                    <td className="px-2 py-2 text-right num-tabular text-muted-foreground">
                      {formatHeures(l.trajet)}
                    </td>
                    <td className="px-2 py-2 text-right num-tabular text-muted-foreground text-xs whitespace-nowrap">
                      {formatEUR(l.taux ?? tauxDefaut)}/h
                      {l.taux == null && (
                        <span
                          title="Taux non renseigné sur le profil — taux par défaut appliqué"
                          className="ml-0.5"
                        >
                          *
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-2 py-2 text-right num-tabular ${l.comptabilise ? "font-medium" : "line-through"}`}
                    >
                      {formatEUR(l.cout)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() =>
                          toggle.mutate(
                            { id: l.id, comptabilise: !l.comptabilise },
                            {
                              onSuccess: () =>
                                toast.success(
                                  l.comptabilise
                                    ? "Heures exclues de la marge"
                                    : "Heures réintégrées",
                                ),
                              onError: (e) => toast.error("Échec : " + (e as Error).message),
                            },
                          )
                        }
                        title={
                          l.comptabilise
                            ? "Ne pas compter dans la marge"
                            : "Recompter dans la marge"
                        }
                        className="mr-2 text-muted-foreground hover:text-foreground"
                      >
                        {l.comptabilise ? (
                          <EyeOff className="w-4 h-4 inline" />
                        ) : (
                          <Eye className="w-4 h-4 inline" />
                        )}
                      </button>
                      <ConfirmAction
                        trigger={
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            title="Supprimer ce pointage"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        }
                        title={`Supprimer le pointage du ${formatDate(l.date)} ?`}
                        description={`${l.nom} — ${formatHeures(l.heures)}. Les heures seront définitivement effacées.`}
                        confirmLabel="Supprimer"
                        destructive
                        onConfirm={() =>
                          supprimer.mutate(l.id, {
                            onSuccess: () => toast.success("Pointage supprimé"),
                            onError: (e) => toast.error("Échec : " + (e as Error).message),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="px-2 py-2 font-semibold" colSpan={2}>
                    Compté dans la marge
                  </td>
                  <td className="px-2 py-2 text-right num-tabular font-semibold">
                    {formatHeures(totalHeures)}
                  </td>
                  <td colSpan={2}></td>
                  <td className="px-2 py-2 text-right num-tabular font-semibold">
                    {formatEUR(totalCout)}
                  </td>
                  <td></td>
                </tr>
                {exclues.length > 0 && (
                  <tr className="text-xs text-amber-600 dark:text-amber-400">
                    <td className="px-2 py-2" colSpan={2}>
                      Dont exclu ({exclues.length} pointage{exclues.length > 1 ? "s" : ""})
                    </td>
                    <td className="px-2 py-2 text-right num-tabular">
                      {formatHeures(exclues.reduce((s, l) => s + l.heures, 0))}
                    </td>
                    <td colSpan={2}></td>
                    <td className="px-2 py-2 text-right num-tabular">
                      {formatEUR(exclues.reduce((s, l) => s + l.cout, 0))}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Badge statut facture (même style que la page factures fournisseurs).
function StatutFactureBadge({ statut }: { statut: Tables<"factures_fournisseurs">["statut"] }) {
  return statut === "valide" ? (
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
  );
}

// Factures fournisseurs attribuées au chantier (via factures_repartition).
function FacturesChantierBloc({ chantierId }: { chantierId: string }) {
  const { data: factures = [], isLoading } = useFacturesChantier(chantierId);
  const [affecterOpen, setAffecterOpen] = useState(false);
  const valider = useValiderFacture();
  const toggle = useToggleRepartitionComptabilisee();
  const detacher = useDeleteRepartition();
  const total = factures.reduce((s, f) => s + Number(f.montant_ht_affecte), 0);
  // Une facture pèse sur la marge si elle est validée ET non exclue manuellement.
  const compte = (f: (typeof factures)[number]) => f.statut === "valide" && f.comptabilise;
  // Seules les factures VALIDÉES entrent dans le coût fournisseurs (vue
  // chantier_couts_reels). Sans distinction visible, un total incluant des
  // factures « à valider » ne collait pas au bloc Marge et passait pour un
  // problème de synchronisation (retour client).
  const totalValide = factures.filter(compte).reduce((s, f) => s + Number(f.montant_ht_affecte), 0);
  const enAttente = total - totalValide;

  return (
    <Card className="mt-4">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            Factures fournisseurs
          </div>
          <Button size="sm" variant="outline" onClick={() => setAffecterOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Affecter une facture
          </Button>
        </div>
        <AffecterFactureDialog
          open={affecterOpen}
          onOpenChange={setAffecterOpen}
          chantierId={chantierId}
        />

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : factures.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Aucune facture attribuée à ce chantier — utilise « Affecter une facture » ci-dessus.
          </div>
        ) : (
          <>
            {/* Cartes mobiles */}
            <div className="md:hidden divide-y">
              {factures.map((f) => (
                <div
                  key={f.repartition_id}
                  className={`py-3 first:pt-0 ${f.comptabilise ? "" : "opacity-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{f.fournisseur}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {f.numero_facture ?? "—"} · {f.date ? formatDate(f.date) : "—"}
                      </div>
                    </div>
                    <StatutFactureBadge statut={f.statut} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">Montant HT affecté</span>
                    <span className="num-tabular font-medium">
                      {formatEUR(Number(f.montant_ht_affecte))}
                    </span>
                  </div>
                </div>
              ))}
              <div className="pt-3 space-y-1 text-sm">
                <div className="flex items-center justify-between font-semibold">
                  <span>Compté dans la marge</span>
                  <span className="num-tabular">{formatEUR(totalValide)}</span>
                </div>
                {enAttente > 0 && (
                  <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                    <span>Dont à valider (non compté)</span>
                    <span className="num-tabular">{formatEUR(enAttente)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tableau desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Fournisseur</th>
                    <th className="text-left px-3 py-2 font-medium">N° facture</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Montant HT affecté</th>
                    <th className="text-left px-3 py-2 font-medium">Statut</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((f) => (
                    <tr
                      key={f.repartition_id}
                      className={`border-b last:border-0 hover:bg-muted/30 ${f.comptabilise ? "" : "opacity-50"}`}
                    >
                      <td className="px-3 py-2 font-medium">
                        {f.fournisseur}
                        {!f.comptabilise && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400">
                            exclu de la marge
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{f.numero_facture ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {f.date ? formatDate(f.date) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right num-tabular ${compte(f) ? "" : "line-through"}`}
                      >
                        {formatEUR(Number(f.montant_ht_affecte))}
                      </td>
                      <td className="px-3 py-2">
                        <StatutFactureBadge statut={f.statut} />
                        {f.statut !== "valide" && (
                          <button
                            onClick={() =>
                              valider.mutate(f.id, {
                                onSuccess: () =>
                                  toast.success(
                                    "Facture validée — elle compte désormais dans la marge",
                                  ),
                                onError: (e) =>
                                  toast.error(
                                    (e as Error).message.includes("Répartition incomplète")
                                      ? "Validation impossible : la facture doit être entièrement répartie entre les chantiers."
                                      : "Échec : " + (e as Error).message,
                                    { duration: 8000 },
                                  ),
                              })
                            }
                            disabled={valider.isPending}
                            className="ml-2 text-xs text-primary hover:underline"
                          >
                            Valider
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() =>
                            toggle.mutate(
                              { id: f.repartition_id, comptabilise: !f.comptabilise },
                              {
                                onSuccess: () =>
                                  toast.success(
                                    f.comptabilise
                                      ? "Montant exclu de la marge"
                                      : "Montant réintégré",
                                  ),
                                onError: (e) => toast.error("Échec : " + (e as Error).message),
                              },
                            )
                          }
                          title={
                            f.comptabilise
                              ? "Ne pas compter dans la marge"
                              : "Recompter dans la marge"
                          }
                          className="mr-2 text-muted-foreground hover:text-foreground"
                        >
                          {f.comptabilise ? (
                            <EyeOff className="w-4 h-4 inline" />
                          ) : (
                            <Eye className="w-4 h-4 inline" />
                          )}
                        </button>
                        <ConfirmAction
                          trigger={
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              title="Détacher du chantier"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          }
                          title={`Détacher la facture ${f.fournisseur} de ce chantier ?`}
                          description="La facture reste dans « Factures fournisseurs » : seule son affectation à ce chantier est retirée."
                          confirmLabel="Détacher"
                          destructive
                          onConfirm={() =>
                            detacher.mutate(f.repartition_id, {
                              onSuccess: () => toast.success("Facture détachée du chantier"),
                              onError: (e) => toast.error("Échec : " + (e as Error).message),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>
                      Compté dans la marge ({factures.filter(compte).length} facture
                      {factures.filter(compte).length > 1 ? "s" : ""})
                    </td>
                    <td className="px-3 py-2 text-right num-tabular">{formatEUR(totalValide)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  {enAttente > 0 && (
                    <tr className="text-xs text-amber-600 dark:text-amber-400">
                      <td className="px-3 py-2" colSpan={3}>
                        Dont non compté (facture à valider ou montant exclu)
                      </td>
                      <td className="px-3 py-2 text-right num-tabular">{formatEUR(enAttente)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Affectation directe d'une facture au chantier. Les factures déjà entièrement
// réparties n'apparaissent pas ; le montant proposé est le reste à affecter.
function AffecterFactureDialog({
  open,
  onOpenChange,
  chantierId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  chantierId: string;
}) {
  const { data: factures = [], isLoading } = useFacturesAffectables();
  const creer = useCreateRepartition();
  const [choisie, setChoisie] = useState<string | null>(null);
  const [montant, setMontant] = useState("");

  const facture = factures.find((f) => f.id === choisie);

  const selectionner = (id: string, reste: number) => {
    setChoisie(id);
    setMontant(String(reste));
  };

  const valider = () => {
    const m = Math.round((Number(montant.replace(",", ".")) || 0) * 100) / 100;
    if (!choisie) return toast.error("Choisis une facture");
    if (m <= 0) return toast.error("Montant invalide");
    if (facture && m > facture.reste + 0.001)
      return toast.error(
        `Il ne reste que ${formatEUR(facture.reste)} à affecter sur cette facture`,
      );
    creer.mutate(
      { facture_id: choisie, chantier_id: chantierId, montant_ht_affecte: m },
      {
        onSuccess: () => {
          toast.success("Facture affectée au chantier", {
            description:
              facture?.statut === "a_valider"
                ? "Elle ne comptera dans la marge qu'une fois la facture validée."
                : undefined,
          });
          setChoisie(null);
          setMontant("");
          onOpenChange(false);
        },
        onError: (e) => toast.error("Échec : " + (e as Error).message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setChoisie(null);
          setMontant("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Affecter une facture à ce chantier</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : factures.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            Aucune facture disponible : toutes sont déjà entièrement affectées. Crée-la d'abord
            depuis « Factures fourn. ».
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {factures.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => selectionner(f.id, f.reste)}
                  className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${choisie === f.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{f.fournisseur}</span>
                    <span className="num-tabular text-sm shrink-0">{formatEUR(f.reste)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {f.numero_facture ?? "—"} · {f.date ? formatDate(f.date) : "—"} · reste à
                    affecter sur {formatEUR(Number(f.montant_ht))}
                    {f.statut === "a_valider" && " · à valider"}
                  </div>
                </button>
              ))}
            </div>
            {choisie && (
              <div>
                <Label>Montant HT affecté à ce chantier</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className="mt-1 num-tabular"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Pré-rempli avec le reste à affecter. Réduis-le pour répartir la facture sur
                  plusieurs chantiers.
                </p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={valider} disabled={!choisie || creer.isPending}>
            {creer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Affecter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Bloc « Marge réelle » : référence (devis acceptés) − coût réel (MO + fournisseurs).
function MargeReelleBloc({ couts }: { couts?: ChantierCouts }) {
  const m = evalMarge(couts);
  const color =
    m.niveau === "negatif"
      ? "text-destructive"
      : m.niveau === "faible"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  const dot =
    m.niveau === "negatif"
      ? "bg-destructive"
      : m.niveau === "faible"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <Card className="mt-4">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Marge réelle
          </div>
          {m.calculable && (
            <span className={`inline-flex items-center gap-2 text-sm font-semibold ${color}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              {formatEUR(a05(m.margeChf!))}
              {m.margePct != null && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({m.margePct.toFixed(1)} %)
                </span>
              )}
            </span>
          )}
        </div>
        {!m.calculable ? (
          <div className="text-sm text-muted-foreground">
            <span className="text-lg font-semibold text-foreground mr-2">—</span>aucun devis accepté
            (marge non calculable)
          </div>
        ) : (
          <div className="grid sm:grid-cols-4 gap-4">
            <Stat
              label="Référence (devis acceptés)"
              value={formatEUR(Number(couts?.montant_reference ?? 0))}
            />
            <Stat label="Coût main-d'œuvre" value={formatEUR(Number(couts?.cout_mo_reel ?? 0))} />
            <Stat
              label="Coût fournisseurs"
              value={formatEUR(Number(couts?.cout_fournisseurs_reel ?? 0))}
            />
            <Stat
              label="Marge réelle"
              value={formatEUR(a05(m.margeChf!))}
              accent={color}
              sub={m.margePct != null ? `${m.margePct.toFixed(1)} %` : undefined}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold num-tabular mt-1 ${accent ?? ""}`}>
        {value}
        {sub && <span className="text-xs font-normal text-muted-foreground ml-1">{sub}</span>}
      </div>
    </div>
  );
}
