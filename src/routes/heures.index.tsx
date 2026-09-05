import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmAction } from "@/components/ConfirmAction";
import {
  formatEURShort,
  formatDate,
  formatHeures,
  isoDate,
  startOfWeek,
  addDays,
} from "@/lib/format";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
} from "lucide-react";
import {
  usePointages,
  useCreatePointage,
  useUpdatePointage,
  useDeletePointage,
  type PointageEnrichi,
} from "@/lib/queries/pointages";
import {
  useChantiersList,
  useChantierCoutsReels,
  type ChantierEnrichi,
} from "@/lib/queries/chantiers";
import { useProfiles } from "@/lib/queries/profiles";

export const Route = createFileRoute("/heures/")({ component: HeuresRouter });

const REPERE_SEMAINE = 42; // h/sem indicatif (§5) — purement informatif, jamais bloquant.

const num = (v: number | string | null) => Number(v ?? 0);

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
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

function HeuresRouter() {
  const { profile } = useAuth();
  if (!profile) return <Spinner />;
  if (profile.role === "ouvrier") {
    return (
      <VueOuvrier
        ouvrierId={profile.id}
        ouvrierNom={`${profile.prenom ?? ""} ${profile.nom}`.trim()}
      />
    );
  }
  return <VueStaff readOnly={profile.role === "conducteur"} />;
}

// ============================================================
// Formulaire de pointage (création + édition) — partagé ouvrier / admin
// ============================================================
function PointageDialog({
  open,
  onOpenChange,
  chantiers,
  pointage,
  ouvrierId,
  ouvriersPickList,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  chantiers: ChantierEnrichi[]; // chantiers visibles
  pointage?: PointageEnrichi | null; // présent => édition
  ouvrierId?: string; // ouvrier courant (création ouvrier)
  ouvriersPickList?: { id: string; label: string }[]; // si fourni => sélecteur ouvrier (admin)
}) {
  const create = useCreatePointage();
  const update = useUpdatePointage();
  const isEdit = !!pointage;

  const [chantierId, setChantierId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [heures, setHeures] = useState("");
  const [trajet, setTrajet] = useState("0");
  const [note, setNote] = useState("");
  const [ouvSel, setOuvSel] = useState("");

  useEffect(() => {
    if (!open) return;
    if (pointage) {
      setChantierId(pointage.chantier_id);
      setDate(pointage.date);
      setHeures(String(num(pointage.heures_travaillees)));
      setTrajet(String(num(pointage.heures_trajet)));
      setNote(pointage.note ?? "");
      setOuvSel(pointage.ouvrier_id);
    } else {
      setChantierId("");
      setDate(isoDate(new Date()));
      setHeures("");
      setTrajet("0");
      setNote("");
      setOuvSel(ouvriersPickList?.[0]?.id ?? "");
    }
  }, [open, pointage, ouvriersPickList]);

  // Self-assignation : on pointe sur tout chantier OUVERT (prospect ou actif) —
  // les chantiers naissent en « prospect » et le pointage doit être possible dès
  // le premier jour (retour client). Seuls les clôturés sont exclus ; en édition,
  // on garde aussi le chantier courant même s'il est passé en clôturé.
  const options = useMemo(
    () => chantiers.filter((c) => c.statut !== "cloture" || c.id === chantierId),
    [chantiers, chantierId],
  );
  const duree = Math.round((Number(heures.replace(",", ".")) || 0) * 100) / 100;
  const pending = create.isPending || update.isPending;

  const submit = async () => {
    if (!chantierId) return toast.error("Sélectionnez un chantier");
    if (ouvriersPickList && !ouvSel) return toast.error("Sélectionnez un ouvrier");
    if (duree <= 0) return toast.error("Renseigne le nombre d’heures travaillées");
    if (duree > 24) return toast.error("24 h maximum par pointage");
    const trajetNum = Math.max(0, Number(trajet.replace(",", ".")) || 0);
    try {
      if (isEdit && pointage) {
        await update.mutateAsync({
          id: pointage.id,
          patch: {
            chantier_id: chantierId,
            date,
            heures_travaillees: duree,
            heure_debut: null,
            heure_fin: null,
            heures_trajet: trajetNum,
            note: note.trim() || null,
          },
        });
        toast.success("Pointage modifié");
      } else {
        await create.mutateAsync({
          chantier_id: chantierId,
          ouvrier_id: ouvriersPickList ? ouvSel : (ouvrierId as string),
          date,
          heures_travaillees: duree,
          heures_trajet: trajetNum,
          note: note.trim() || null,
        });
        toast.success(`${formatHeures(duree)} ajoutées`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Échec : " + (e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {isEdit ? "Modifier le pointage" : "Nouveau pointage"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {ouvriersPickList && (
            <div>
              <Label>Ouvrier</Label>
              <Select value={ouvSel} onValueChange={setOuvSel}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {ouvriersPickList.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Chantier</Label>
            <Select value={chantierId} onValueChange={setChantierId}>
              <SelectTrigger className="mt-1 min-w-0">
                <SelectValue placeholder="Sélectionner un chantier" />
              </SelectTrigger>
              <SelectContent>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono text-xs mr-2">{c.reference}</span>
                    {c.nom}
                  </SelectItem>
                ))}
                {options.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Aucun chantier ouvert.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-11 sm:h-9"
              />
            </div>
            <div>
              <Label>Heures travaillées</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={heures}
                onChange={(e) => setHeures(e.target.value)}
                placeholder="Ex. 4"
                className="mt-1 num-tabular h-11 sm:h-9"
                autoFocus
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Trajet (h)</Label>
              <Input
                type="number"
                step="0.25"
                min="0"
                value={trajet}
                onChange={(e) => setTrajet(e.target.value)}
                className="mt-1 num-tabular"
              />
            </div>
          </div>
          <div>
            <Label>Note (optionnel)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex : pose carrelage SDB"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={pending}
            className="w-full sm:w-auto min-h-[48px] sm:min-h-0"
          >
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Navigation par semaine (lundi → dimanche), partagée.
function useSemaine() {
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const start = isoDate(monday);
  const end = addDays(start, 6);
  const label = `Semaine du ${formatDate(start)}`;
  const prev = () =>
    setMonday((m) => {
      const d = new Date(m);
      d.setDate(d.getDate() - 7);
      return d;
    });
  const next = () =>
    setMonday((m) => {
      const d = new Date(m);
      d.setDate(d.getDate() + 7);
      return d;
    });
  return { start, end, label, prev, next };
}

function WeekNav({ label, prev, next }: { label: string; prev: () => void; next: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={prev} className="p-1.5 rounded hover:bg-muted">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium min-w-[160px] text-center">{label}</span>
      <button onClick={next} className="p-1.5 rounded hover:bg-muted">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ============================================================
// VUE OUVRIER — saisie + historique de SES pointages
// ============================================================
function VueOuvrier({ ouvrierId, ouvrierNom }: { ouvrierId: string; ouvrierNom: string }) {
  const { data: pointages = [], isLoading } = usePointages();
  const { data: chantiers = [] } = useChantiersList();
  const { start, end, label, prev, next } = useSemaine();
  const [chFilter, setChFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PointageEnrichi | null>(null);
  const del = useDeletePointage();

  const chMap = useMemo(() => Object.fromEntries(chantiers.map((c) => [c.id, c])), [chantiers]);
  const today = isoDate(new Date());

  // Chantiers présents dans l'historique (pour le filtre).
  const chantiersHistorique = useMemo(() => {
    const ids = new Set(pointages.map((p) => p.chantier_id));
    return chantiers.filter((c) => ids.has(c.id));
  }, [pointages, chantiers]);

  const semaine = useMemo(
    () =>
      pointages.filter(
        (p) =>
          p.date >= start && p.date <= end && (chFilter === "all" || p.chantier_id === chFilter),
      ),
    [pointages, start, end, chFilter],
  );
  const totalSemaine = semaine.reduce((s, p) => s + num(p.heures_travaillees), 0);
  const totalJour = pointages
    .filter((p) => p.date === today)
    .reduce((s, p) => s + num(p.heures_travaillees), 0);

  // Regroupement par jour (desc).
  const jours = useMemo(() => {
    const m = new Map<string, PointageEnrichi[]>();
    for (const p of semaine) {
      if (!m.has(p.date)) m.set(p.date, []);
      m.get(p.date)!.push(p);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [semaine]);

  const ouvrir = (p: PointageEnrichi | null) => {
    setEditing(p);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Mes heures"
        subtitle={ouvrierNom}
        actions={
          <Button onClick={() => ouvrir(null)}>
            <Plus className="w-4 h-4 mr-1" />
            Pointer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Aujourd'hui</div>
            <div className="text-2xl font-semibold num-tabular mt-1">{formatHeures(totalJour)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">
              Cette semaine <span className="opacity-60">/ repère {REPERE_SEMAINE}h</span>
            </div>
            <div className="text-2xl font-semibold num-tabular mt-1">
              {formatHeures(totalSemaine)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
        <WeekNav label={label} prev={prev} next={next} />
        <Select value={chFilter} onValueChange={setChFilter}>
          <SelectTrigger className="w-full sm:w-56 min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les chantiers</SelectItem>
            {chantiersHistorique.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : jours.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Aucun pointage cette semaine.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jours.map(([jour, pts]) => {
            const tj = pts.reduce((s, p) => s + num(p.heures_travaillees), 0);
            return (
              <Card key={jour}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-sm font-medium capitalize">{formatDate(jour)}</span>
                    <span className="text-sm num-tabular font-semibold">{formatHeures(tj)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {pts.map((p) => {
                      const ch = chMap[p.chantier_id];
                      return (
                        <div
                          key={p.id}
                          className="flex items-start justify-between p-2.5 rounded bg-muted/40"
                        >
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground truncate">
                              <span className="font-mono">
                                {ch?.reference ?? p.chantier?.reference}
                              </span>{" "}
                              · {ch?.nom ?? p.chantier?.nom}
                            </div>
                            {num(p.heures_trajet) > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                Trajet : {formatHeures(num(p.heures_trajet))}
                              </div>
                            )}
                            {p.note && (
                              <div className="text-[11px] italic text-muted-foreground truncate">
                                « {p.note} »
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="num-tabular text-sm font-medium">
                              {formatHeures(num(p.heures_travaillees))}
                            </span>
                            <button
                              onClick={() => ouvrir(p)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <ConfirmAction
                              trigger={
                                <button className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              }
                              title="Supprimer ce pointage ?"
                              description={`${formatHeures(num(p.heures_travaillees))} · ${ch?.nom ?? ""}`}
                              confirmLabel="Supprimer"
                              onConfirm={() =>
                                del.mutate(p.id, {
                                  onSuccess: () => toast.success("Pointage supprimé"),
                                })
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PointageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        chantiers={chantiers}
        pointage={editing}
        ouvrierId={ouvrierId}
      />
    </div>
  );
}

// ============================================================
// VUE STAFF — admin (édition) / conducteur (lecture seule)
// ============================================================
function VueStaff({ readOnly }: { readOnly: boolean }) {
  const { data: pointages = [], isLoading } = usePointages();
  const { data: chantiers = [] } = useChantiersList();
  const { data: profiles = [] } = useProfiles();
  const { data: couts = {} } = useChantierCoutsReels();
  const { start, end, label, prev, next } = useSemaine();

  const [fOuvrier, setFOuvrier] = useState("all");
  const [fChantier, setFChantier] = useState("all");
  const [fEntite, setFEntite] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PointageEnrichi | null>(null);
  const [selectedChantier, setSelectedChantier] = useState<ChantierEnrichi | null>(null); // détail heures (drawer)
  const del = useDeletePointage();

  const chMap = useMemo(() => Object.fromEntries(chantiers.map((c) => [c.id, c])), [chantiers]);
  const ouvriers = useMemo(() => profiles.filter((p) => p.role === "ouvrier"), [profiles]);
  const entites = useMemo(() => {
    const m = new Map<string, ChantierEnrichi["entite"]>();
    for (const c of chantiers) if (c.entite) m.set(c.entite.id, c.entite);
    return Array.from(m.values());
  }, [chantiers]);

  const filtres = useMemo(
    () =>
      pointages.filter((p) => {
        if (p.date < start || p.date > end) return false;
        if (fOuvrier !== "all" && p.ouvrier_id !== fOuvrier) return false;
        if (fChantier !== "all" && p.chantier_id !== fChantier) return false;
        if (fEntite !== "all" && chMap[p.chantier_id]?.entite?.id !== fEntite) return false;
        return true;
      }),
    [pointages, start, end, fOuvrier, fChantier, fEntite, chMap],
  );

  // Synthèse par chantier (sur le périmètre filtré) — coût MO via la vue.
  const synthese = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filtres)
      m.set(p.chantier_id, (m.get(p.chantier_id) ?? 0) + num(p.heures_travaillees));
    return Array.from(m.entries())
      .map(([cid, h]) => ({ ch: chMap[cid], heures: h, cout: num(couts[cid]?.cout_mo_reel) }))
      .filter((x) => x.ch)
      .sort((a, b) => b.heures - a.heures);
  }, [filtres, chMap, couts]);

  const totalHeures = filtres.reduce((s, p) => s + num(p.heures_travaillees), 0);
  const nomOuvrier = (p: PointageEnrichi) =>
    p.ouvrier ? `${p.ouvrier.prenom ?? ""} ${p.ouvrier.nom}`.trim() : "—";

  return (
    <div>
      <PageHeader
        title="Suivi des heures"
        subtitle={readOnly ? "Lecture seule — chantiers de vos entités" : undefined}
        actions={
          !readOnly ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Pointage
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-3">
        <WeekNav label={label} prev={prev} next={next} />
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <Select value={fOuvrier} onValueChange={setFOuvrier}>
            <SelectTrigger className="w-full sm:w-44 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les ouvriers</SelectItem>
              {ouvriers.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {`${o.prenom ?? ""} ${o.nom}`.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fEntite} onValueChange={setFEntite}>
            <SelectTrigger className="w-full sm:w-40 min-w-0">
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
            <SelectTrigger className="w-full sm:w-48 min-w-0">
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
        </div>
      </div>

      <Tabs defaultValue="pointages">
        <TabsList>
          <TabsTrigger value="pointages">Pointages</TabsTrigger>
          {!readOnly && <TabsTrigger value="synthese">Synthèse par chantier</TabsTrigger>}
        </TabsList>

        <TabsContent value="pointages">
          <Card>
            <CardContent className="p-0 md:overflow-x-auto">
              {isLoading ? (
                <Spinner />
              ) : (
                <>
                  {/* Cartes mobiles */}
                  <div className="md:hidden divide-y">
                    {filtres.length === 0 ? (
                      <div className="px-3 py-8 text-center text-muted-foreground text-sm">
                        Aucun pointage sur ce périmètre.
                      </div>
                    ) : (
                      filtres.map((p) => {
                        const ch = chMap[p.chantier_id];
                        return (
                          <div key={p.id} className="p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{formatDate(p.date)}</span>
                              <span className="num-tabular font-semibold">
                                {formatHeures(num(p.heures_travaillees))}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span className="font-mono">
                                {ch?.reference ?? p.chantier?.reference}
                              </span>{" "}
                              {ch?.nom ?? p.chantier?.nom}
                            </div>
                            <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                              <span className="num-tabular">
                                {num(p.heures_trajet) > 0
                                  ? `trajet ${formatHeures(num(p.heures_trajet))}`
                                  : ""}
                              </span>
                              <span className="truncate ml-2">{nomOuvrier(p)}</span>
                            </div>
                            {!readOnly && (
                              <div className="flex justify-end gap-4 mt-2">
                                <button
                                  onClick={() => {
                                    setEditing(p);
                                    setDialogOpen(true);
                                  }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <ConfirmAction
                                  trigger={
                                    <button className="text-muted-foreground hover:text-destructive">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  }
                                  title="Supprimer ce pointage ?"
                                  description={`${formatDate(p.date)} · ${nomOuvrier(p)} · ${ch?.nom ?? ""}`}
                                  confirmLabel="Supprimer"
                                  onConfirm={() =>
                                    del.mutate(p.id, {
                                      onSuccess: () => toast.success("Pointage supprimé"),
                                    })
                                  }
                                />
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {filtres.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-muted/30 font-semibold text-sm">
                        <span>Total ({filtres.length})</span>
                        <span className="num-tabular">{formatHeures(totalHeures)}</span>
                      </div>
                    )}
                  </div>
                  {/* Tableau desktop */}
                  <table className="hidden md:table w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Ouvrier</th>
                        <th className="text-left px-3 py-2">Chantier</th>
                        <th className="text-left px-3 py-2">Entité</th>
                        <th className="text-left px-3 py-2">Note</th>
                        <th className="text-right px-3 py-2">Trajet</th>
                        <th className="text-right px-3 py-2">Heures</th>
                        {!readOnly && <th className="px-3 py-2 w-20"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtres.map((p) => {
                        const ch = chMap[p.chantier_id];
                        return (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(p.date)}</td>
                            <td className="px-3 py-2">{nomOuvrier(p)}</td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs">
                                {ch?.reference ?? p.chantier?.reference}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                {ch?.nom ?? p.chantier?.nom}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <EntiteChip entite={ch?.entite ?? null} />
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {p.note ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right num-tabular text-muted-foreground">
                              {num(p.heures_trajet) > 0 ? formatHeures(num(p.heures_trajet)) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right num-tabular font-medium">
                              {formatHeures(num(p.heures_travaillees))}
                            </td>
                            {!readOnly && (
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setEditing(p);
                                    setDialogOpen(true);
                                  }}
                                  className="text-muted-foreground hover:text-foreground mr-2"
                                >
                                  <Pencil className="w-3.5 h-3.5 inline" />
                                </button>
                                <ConfirmAction
                                  trigger={
                                    <button className="text-muted-foreground hover:text-destructive">
                                      <Trash2 className="w-3.5 h-3.5 inline" />
                                    </button>
                                  }
                                  title="Supprimer ce pointage ?"
                                  description={`${formatDate(p.date)} · ${nomOuvrier(p)} · ${ch?.nom ?? ""}`}
                                  confirmLabel="Supprimer"
                                  onConfirm={() =>
                                    del.mutate(p.id, {
                                      onSuccess: () => toast.success("Pointage supprimé"),
                                    })
                                  }
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {filtres.length === 0 && (
                        <tr>
                          <td
                            colSpan={readOnly ? 7 : 8}
                            className="px-3 py-8 text-center text-muted-foreground"
                          >
                            Aucun pointage sur ce périmètre.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {filtres.length > 0 && (
                      <tfoot>
                        <tr className="border-t bg-muted/30 font-semibold">
                          <td className="px-3 py-2" colSpan={6}>
                            Total ({filtres.length} pointage{filtres.length > 1 ? "s" : ""})
                          </td>
                          <td className="px-3 py-2 text-right num-tabular">
                            {formatHeures(totalHeures)}
                          </td>
                          {!readOnly && <td></td>}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {!readOnly && (
          <TabsContent value="synthese">
            <Card>
              <CardContent className="p-0 md:overflow-x-auto">
                {synthese.length === 0 ? (
                  <div className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Aucune heure sur ce périmètre.
                  </div>
                ) : (
                  <>
                    {/* Cartes mobiles cliquables */}
                    <div className="md:hidden divide-y">
                      {synthese.map(
                        ({ ch, heures, cout }) =>
                          ch && (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() => setSelectedChantier(ch)}
                              className="w-full text-left p-3 active:bg-muted/40"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {ch.reference}
                                </span>
                                <EntiteChip entite={ch.entite} />
                              </div>
                              <div className="text-sm font-medium mt-0.5 truncate">{ch.nom}</div>
                              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground num-tabular">
                                <span>{formatHeures(heures)} (semaine)</span>
                                <span>{formatEURShort(cout)} MO</span>
                              </div>
                            </button>
                          ),
                      )}
                    </div>
                    {/* Tableau desktop cliquable */}
                    <table className="hidden md:table w-full text-sm">
                      <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                        <tr>
                          <th className="text-left px-3 py-2">Référence</th>
                          <th className="text-left px-3 py-2">Nom</th>
                          <th className="text-left px-3 py-2">Entité</th>
                          <th className="text-right px-3 py-2">Heures (semaine)</th>
                          <th className="text-right px-3 py-2">Coût MO réel (total chantier)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {synthese.map(
                          ({ ch, heures, cout }) =>
                            ch && (
                              <tr
                                key={ch.id}
                                onClick={() => setSelectedChantier(ch)}
                                className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                              >
                                <td className="px-3 py-2 font-mono text-xs">{ch.reference}</td>
                                <td className="px-3 py-2">{ch.nom}</td>
                                <td className="px-3 py-2">
                                  <EntiteChip entite={ch.entite} />
                                </td>
                                <td className="px-3 py-2 text-right num-tabular">
                                  {formatHeures(heures)}
                                </td>
                                <td className="px-3 py-2 text-right num-tabular">
                                  {formatEURShort(cout)}
                                </td>
                              </tr>
                            ),
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground mt-2">
              Cliquez un chantier pour le détail des heures par ouvrier. Coût MO = heures × taux
              horaire (70 €/h par défaut), cumul de tout le chantier (la colonne heures est filtrée
              sur la semaine).
            </p>
          </TabsContent>
        )}
      </Tabs>

      {!readOnly && (
        <PointageDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          chantiers={chantiers}
          pointage={editing}
          ouvriersPickList={
            editing
              ? undefined
              : ouvriers.map((o) => ({ id: o.id, label: `${o.prenom ?? ""} ${o.nom}`.trim() }))
          }
        />
      )}

      {selectedChantier && (
        <ChantierHeuresSheet
          chantier={selectedChantier}
          pts={pointages.filter(
            (p) => p.chantier_id === selectedChantier.id && p.date >= start && p.date <= end,
          )}
          semaine={label}
          onClose={() => setSelectedChantier(null)}
        />
      )}
    </div>
  );
}

// Drawer : détail des heures d'un chantier (semaine courante), regroupé par ouvrier.
function ChantierHeuresSheet({
  chantier,
  pts,
  semaine,
  onClose,
}: {
  chantier: ChantierEnrichi;
  pts: PointageEnrichi[];
  semaine: string;
  onClose: () => void;
}) {
  const parOuvrier = useMemo(() => {
    const m = new Map<
      string,
      { nom: string; travail: number; trajet: number; pts: PointageEnrichi[] }
    >();
    for (const p of pts) {
      const nom = p.ouvrier ? `${p.ouvrier.prenom ?? ""} ${p.ouvrier.nom}`.trim() : "—";
      if (!m.has(p.ouvrier_id)) m.set(p.ouvrier_id, { nom, travail: 0, trajet: 0, pts: [] });
      const o = m.get(p.ouvrier_id)!;
      o.travail += num(p.heures_travaillees);
      o.trajet += num(p.heures_trajet);
      o.pts.push(p);
    }
    return Array.from(m.values()).sort((a, b) => b.travail - a.travail);
  }, [pts]);
  const total = pts.reduce((s, p) => s + num(p.heures_travaillees), 0);

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {chantier.nom}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-1 mb-4 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
          <span className="font-mono">{chantier.reference}</span>
          <EntiteChip entite={chantier.entite} />
          <span>· {semaine}</span>
        </div>

        {parOuvrier.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Aucune heure sur ce chantier cette semaine.
          </div>
        ) : (
          <div className="space-y-4">
            {parOuvrier.map((o, i) => (
              <div key={i} className="rounded-md border">
                <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
                  <div className="font-medium text-sm">{o.nom}</div>
                  <div className="text-xs text-muted-foreground num-tabular">
                    {formatHeures(o.travail)}
                    {o.trajet > 0 ? ` · +${formatHeures(o.trajet)} trajet` : ""}
                  </div>
                </div>
                {/* Tableau desktop */}
                <table className="hidden md:table w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left px-3 py-1.5">Date</th>
                      <th className="text-left px-3 py-1.5">Note</th>
                      <th className="text-right px-3 py-1.5">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.pts.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{formatDate(p.date)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{p.note ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right num-tabular">
                          {formatHeures(num(p.heures_travaillees))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Cartes mobiles */}
                <div className="md:hidden divide-y">
                  {o.pts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <div>{formatDate(p.date)}</div>
                        {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                      </div>
                      <span className="num-tabular font-medium">
                        {formatHeures(num(p.heures_travaillees))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md border p-3 font-semibold text-sm">
              <span>Total chantier (semaine)</span>
              <span className="num-tabular">{formatHeures(total)}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
