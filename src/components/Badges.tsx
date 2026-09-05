import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatutChantier, StatutDevis, CategoriePrix } from "@/lib/types";
import { useEntites } from "@/lib/queries/entites";
import { useTheme } from "@/lib/theme";
import { couleurLisible } from "@/lib/couleur";

export function EntiteBadge({ entiteId, size = "sm" }: { entiteId: string; size?: "sm" | "md" }) {
  const { theme } = useTheme();
  const { data: entites } = useEntites();
  const entite = entites?.find((e) => e.id === entiteId);
  if (!entite) return null;
  const couleur = couleurLisible(entite.couleur, theme === "dark");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium border",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      )}
      style={{ backgroundColor: `${couleur}1f`, color: couleur, borderColor: `${couleur}66` }}
    >
      {entite.nom}
    </span>
  );
}

export function EntiteDot({ entiteId, className }: { entiteId: string; className?: string }) {
  const { theme } = useTheme();
  const { data: entites } = useEntites();
  const entite = entites?.find((e) => e.id === entiteId);
  if (!entite) return null;
  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full", className)}
      style={{ backgroundColor: couleurLisible(entite.couleur, theme === "dark") }}
    />
  );
}

const statutChantierLabels: Record<StatutChantier, { label: string; cls: string }> = {
  prospect: { label: "Prospect", cls: "bg-muted text-muted-foreground border-border" },
  signe: { label: "Signé", cls: "bg-info/10 text-info border-info/30" },
  en_cours: { label: "En cours", cls: "bg-accent/10 text-accent border-accent/40" },
  termine: { label: "Terminé", cls: "bg-success/10 text-success border-success/40" },
};

export function StatutChantierBadge({ statut }: { statut: StatutChantier }) {
  const c = statutChantierLabels[statut];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}

const statutDevisLabels: Record<StatutDevis, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-muted text-muted-foreground border-border" },
  envoye: { label: "Envoyé", cls: "bg-info/10 text-info border-info/30" },
  accepte: { label: "Accepté", cls: "bg-success/10 text-success border-success/40" },
  refuse: { label: "Refusé", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function StatutDevisBadge({ statut }: { statut: StatutDevis }) {
  const c = statutDevisLabels[statut];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}

const categoriePrixLabels: Record<CategoriePrix, { label: string; cls: string }> = {
  B2B: { label: "B2B", cls: "bg-primary/10 text-primary border-primary/30" },
  prive: { label: "Privé", cls: "bg-info/10 text-info border-info/30" },
  luxe: { label: "Luxe", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
};
export function CategoriePrixBadge({ cat }: { cat: CategoriePrix }) {
  const c = categoriePrixLabels[cat];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border uppercase tracking-wide",
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
