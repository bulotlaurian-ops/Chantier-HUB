import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";
import { useTheme } from "@/lib/theme";
import { couleurLisible } from "@/lib/couleur";

type StatutChantierDB = Tables<"chantiers">["statut"];

const STATUT_LABELS: Record<StatutChantierDB, { label: string; cls: string }> = {
  prospect: { label: "Prospect", cls: "bg-muted text-muted-foreground border-border" },
  actif: { label: "Actif", cls: "bg-info/10 text-info border-info/30" },
  cloture: { label: "Clôturé", cls: "bg-success/10 text-success border-success/40" },
};

export function StatutChantierChip({ statut }: { statut: StatutChantierDB }) {
  const c = STATUT_LABELS[statut];
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

type StatutDevisDB = Tables<"devis">["statut"];

const STATUT_DEVIS_LABELS: Record<StatutDevisDB, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-muted text-muted-foreground border-border" },
  envoye: { label: "Envoyé", cls: "bg-info/10 text-info border-info/30" },
  accepte: { label: "Accepté", cls: "bg-success/10 text-success border-success/40" },
  refuse: { label: "Refusé", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  expire: { label: "Expiré", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
};

export function StatutDevisChip({ statut }: { statut: StatutDevisDB }) {
  const c = STATUT_DEVIS_LABELS[statut];
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

// Chip catégorie tarifaire (configurable, libellé issu de categories_tarifaires).
export function CategorieChip({ libelle }: { libelle: string | null | undefined }) {
  if (!libelle) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {libelle}
    </span>
  );
}

// Badge entité résolu depuis les données DB (jointure), pas depuis le store seed.
export function EntiteChip({
  entite,
  size = "sm",
}: {
  entite: { nom: string; couleur: string | null } | null;
  size?: "sm" | "md";
}) {
  const { theme } = useTheme();
  if (!entite) return null;
  const couleur = couleurLisible(entite.couleur, theme === "dark"); // lisible en clair ET sombre
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
