import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Badges";
import { EntiteChip } from "@/components/ChantierBadges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR, formatEURShort, formatDate, formatHeures } from "@/lib/format";
import {
  FileText,
  Hammer,
  Clock,
  TrendingUp,
  Receipt,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useDashboardKpis, periodeBornes, type Periode } from "@/lib/queries/dashboard";
import {
  useChantiersList,
  useChantierCoutsReels,
  evalMarge,
  type MargeEval,
} from "@/lib/queries/chantiers";
import { usePointages } from "@/lib/queries/pointages";
import { useEntites } from "@/lib/queries/entites";

export const Route = createFileRoute("/")({ component: DashboardGate });

const a05 = (n: number) => Math.round(n * 100) / 100;
const margeColor = (n: MargeEval["niveau"]) =>
  n === "negatif"
    ? "text-destructive"
    : n === "faible"
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
const margeDot = (n: MargeEval["niveau"]) =>
  n === "negatif" ? "bg-destructive" : n === "faible" ? "bg-amber-500" : "bg-emerald-500";

const PERIODES: { value: Periode; label: string }[] = [
  { value: "semaine", label: "Cette semaine" },
  { value: "mois", label: "Ce mois" },
  { value: "trimestre", label: "Ce trimestre" },
];
const STATUT_DEVIS: { key: string; label: string }[] = [
  { key: "brouillon", label: "Brouillon" },
  { key: "envoye", label: "Envoyés" },
  { key: "accepte", label: "Acceptés" },
  { key: "refuse", label: "Refusés" },
  { key: "expire", label: "Expirés" },
];

function DashboardGate() {
  const { profile, isStaff } = useAuth();
  if (!profile)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (profile.role === "ouvrier")
    return <VueOuvrier nom={`${profile.prenom ?? ""} ${profile.nom}`.trim()} />;
  return <VueStaff isStaff={isStaff} />;
}

// ============================================================
// VUE STAFF (admin / conducteur)
// ============================================================
function VueStaff({ isStaff }: { isStaff: boolean }) {
  const [periode, setPeriode] = useState<Periode>("mois");
  const [entiteId, setEntiteId] = useState<string | null>(null);
  const { from, to } = useMemo(() => periodeBornes(periode), [periode]);
  const { data: kpis, isLoading } = useDashboardKpis(from, to, entiteId);
  const { data: entites = [] } = useEntites();
  const { data: chantiers = [] } = useChantiersList();
  const { data: couts = {} } = useChantierCoutsReels();

  const actifs = useMemo(() => {
    const code = entiteId ? entites.find((e) => e.id === entiteId)?.code : null;
    return chantiers.filter((c) => c.statut === "actif" && (!code || c.entite?.code === code));
  }, [chantiers, entiteId, entites]);

  const m = kpis?.marge;
  const d = kpis?.devis;
  const h = kpis?.heures;
  const at = kpis?.a_traiter;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          <span className="text-xs text-muted-foreground">
            Du {formatDate(from)} au {formatDate(to)}
          </span>
        }
        actions={
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            {isStaff && (
              <Select
                value={entiteId ?? "all"}
                onValueChange={(v) => setEntiteId(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full sm:w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les entités</SelectItem>
                  {entites.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
              <SelectTrigger className="w-full sm:w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Ligne KPI principale */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Kpi
              icon={<TrendingUp className="w-4 h-4" />}
              label="CA HT accepté (période)"
              value={formatEURShort(d?.ca_ht_accepte ?? 0)}
              accent="blue"
            />
            <Kpi
              icon={<FileText className="w-4 h-4" />}
              label="Taux d'acceptation"
              value={d?.taux_acceptation == null ? "—" : `${d.taux_acceptation.toFixed(1)} %`}
              delta="acceptés / (acc.+ref.+exp.)"
              accent="blue"
            />
            <Kpi
              icon={<TrendingUp className="w-4 h-4" />}
              label="Marge réelle (€)"
              value={formatEURShort(a05(m?.marge_chf ?? 0))}
              delta={
                m
                  ? `${m.pct_global == null ? "—" : m.pct_global.toFixed(1) + " %"} · ${m.nb_non_calculables} non calculable${m.nb_non_calculables > 1 ? "s" : ""}`
                  : undefined
              }
              accent="emerald"
            />
            <Kpi
              icon={<Hammer className="w-4 h-4" />}
              label="Chantiers actifs"
              value={String(kpis?.chantiers.actifs ?? 0)}
              delta={`${kpis?.chantiers.termines_periode ?? 0} terminé(s) sur la période`}
              accent="violet"
            />
          </div>

          {/* Ligne KPI secondaire */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi
              icon={<Clock className="w-4 h-4" />}
              label="Heures saisies (période)"
              value={formatHeures(h?.travaillees ?? 0)}
              delta={`+ ${formatHeures(h?.trajet ?? 0)} trajet`}
              accent="amber"
            />
            <Kpi
              icon={<Receipt className="w-4 h-4" />}
              label="Factures à valider"
              value={String(at?.factures_a_valider_nb ?? 0)}
              delta={formatEUR(at?.factures_a_valider_montant ?? 0) + " HT"}
              accent="amber"
            />
            <Kpi
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Devis envoyés > 30 j"
              value={String(at?.devis_envoyes_30j ?? 0)}
              delta="sans réponse"
              accent="amber"
            />
            <Card className="shadow-sm border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-2">Devis par statut (période)</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {STATUT_DEVIS.map((s) => (
                    <span key={s.key} className="text-xs">
                      <span className="font-semibold num-tabular">
                        {d?.par_statut?.[s.key] ?? 0}
                      </span>{" "}
                      <span className="text-muted-foreground">{s.label}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chantiers actifs avec pastille marge */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hammer className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                Chantiers actifs
              </CardTitle>
              <Link
                to="/chantiers"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Tout voir <ArrowRight className="w-3 h-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {actifs.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Aucun chantier actif sur ce périmètre.
                </div>
              )}
              {actifs.map((c) => {
                const ev = evalMarge(couts[c.id]);
                return (
                  <Link
                    key={c.id}
                    to="/chantiers/$id"
                    params={{ id: c.id }}
                    className="flex items-center justify-between gap-2 p-3 rounded-md border hover:bg-muted/40 hover:border-accent/40 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {c.reference}
                      </div>
                      <div className="text-sm font-medium truncate group-hover:text-accent transition-colors">
                        {c.nom}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.client?.nom} · {c.ville}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <EntiteChip entite={c.entite} />
                      {ev.calculable ? (
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm font-semibold num-tabular ${margeColor(ev.niveau)}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${margeDot(ev.niveau)}`} />
                          {formatEUR(a05(ev.margeChf!))}
                          {ev.margePct != null && (
                            <span className="text-[11px] font-normal text-muted-foreground">
                              ({ev.margePct.toFixed(1)} %)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground" title="Aucun devis accepté">
                          marge —
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Couleur d'accent par type de KPI (bordure gauche + fond très léger + icône), dark-aware.
const KPI_ACCENT = {
  blue: {
    bar: "border-l-blue-500",
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
    icon: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    bar: "border-l-emerald-500",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    bar: "border-l-amber-500",
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    icon: "text-amber-600 dark:text-amber-400",
  },
  violet: {
    bar: "border-l-violet-500",
    bg: "bg-violet-50/60 dark:bg-violet-950/20",
    icon: "text-violet-600 dark:text-violet-400",
  },
} as const;
type KpiAccent = keyof typeof KPI_ACCENT;

function Kpi({
  icon,
  label,
  value,
  delta,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: string;
  accent: KpiAccent;
}) {
  const a = KPI_ACCENT[accent];
  return (
    <Card className={`shadow-sm border-l-4 ${a.bar} ${a.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className={a.icon}>{icon}</span>
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold mt-2 num-tabular">{value}</div>
        {delta && <div className="text-[11px] text-muted-foreground mt-1">{delta}</div>}
      </CardContent>
    </Card>
  );
}

// ============================================================
// VUE OUVRIER — minimale, aucune donnée financière
// ============================================================
function VueOuvrier({ nom }: { nom: string }) {
  const { data: pointages = [], isLoading } = usePointages();
  const { data: chantiers = [] } = useChantiersList();
  const { from, to } = useMemo(() => periodeBornes("semaine"), []);

  const semaine = useMemo(
    () => pointages.filter((p) => p.date >= from && p.date <= to),
    [pointages, from, to],
  );
  const total = semaine.reduce((s, p) => s + Number(p.heures_travaillees), 0);
  const trajet = semaine.reduce((s, p) => s + Number(p.heures_trajet), 0);
  const parJour = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of semaine) m.set(p.date, (m.get(p.date) ?? 0) + Number(p.heures_travaillees));
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [semaine]);
  const actifs = chantiers.filter((c) => c.statut === "actif");

  return (
    <div>
      <PageHeader
        title="Mon tableau de bord"
        subtitle={
          <span className="text-xs text-muted-foreground">
            {nom} · semaine du {formatDate(from)}
          </span>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Mes heures cette semaine
                </span>{" "}
                <span className="num-tabular">{formatHeures(total)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trajet > 0 && (
                <div className="text-xs text-muted-foreground mb-2">
                  + {formatHeures(trajet)} de trajet
                </div>
              )}
              {parJour.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucune heure saisie cette semaine.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {parJour.map(([jour, h]) => (
                    <div
                      key={jour}
                      className="flex items-center justify-between p-2 rounded bg-muted/40"
                    >
                      <span className="text-sm capitalize">{formatDate(jour)}</span>
                      <span className="text-sm num-tabular font-medium">{formatHeures(h)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link
                to="/heures"
                className="text-xs text-accent inline-flex items-center gap-1 mt-3"
              >
                Pointer / voir le détail <ArrowRight className="w-3 h-3" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hammer className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                Chantiers actifs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {actifs.length === 0 && (
                <div className="text-sm text-muted-foreground">Aucun chantier actif.</div>
              )}
              {actifs.map((c) => (
                <div key={c.id} className="p-3 rounded-md border">
                  <div className="font-mono text-[11px] text-muted-foreground">{c.reference}</div>
                  <div className="text-sm font-medium">{c.nom}</div>
                  <div className="text-xs text-muted-foreground">{c.ville}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
