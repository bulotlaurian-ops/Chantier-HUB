import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  Hammer,
  Library,
  Settings,
  Clock,
  Users,
  Receipt,
  FileCheck2,
  LogOut,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntites } from "@/lib/queries/entites";
import { useEntiteFilter } from "@/lib/entite-filter";
import { useAuth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP } from "@/config/entreprise";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  conducteur: "Conducteur de travaux",
  ouvrier: "Ouvrier",
};

const ADMIN_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/devis", label: "Devis", icon: FileText },
  { to: "/chantiers", label: "Chantiers", icon: Hammer },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/heures", label: "Suivi des heures", icon: Clock },
  { to: "/factures", label: "Facture", icon: FileCheck2 },
  { to: "/factures-fournisseurs", label: "Suivi facturation", icon: Receipt },
  { to: "/bibliotheque", label: "Bibliothèque", icon: Library },
  { to: "/parametres", label: "Paramètres", icon: Settings },
];

const OUVRIER_ITEMS = [{ to: "/heures", label: "Mes heures", icon: Clock, exact: true }];

// Corps de la sidebar — partagé entre l'aside desktop et le Sheet mobile.
// `onNavigate` ferme le drawer mobile à la sélection d'un lien.
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { profile, signOut } = useAuth();
  const role = profile?.role ?? "ouvrier";
  const { currentEntiteId: entiteId, setEntite } = useEntiteFilter();
  const { data: entites = [] } = useEntites();

  // Paramètres = admin-only ; le conducteur garde tout le reste du menu staff.
  const items =
    role === "ouvrier"
      ? OUVRIER_ITEMS
      : ADMIN_ITEMS.filter((it) => it.to !== "/parametres" || role === "admin");
  const nomAffiche = [profile?.prenom, profile?.nom].filter(Boolean).join(" ") || "Utilisateur";
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5 flex items-center border-b border-sidebar-border">
        <div className="text-lg font-light tracking-tight">
          {APP.prefixe} <span className="text-sidebar-foreground/50">{APP.suffixe}</span>
        </div>
      </div>

      {/* Profil connecté */}
      <div className="px-3 pt-3 space-y-2">
        <div className="rounded-md bg-sidebar-accent/40 border border-sidebar-border px-3 py-2">
          <div className="text-sm font-medium leading-tight truncate">{nomAffiche}</div>
          <div className="text-[11px] text-sidebar-foreground/60">{ROLE_LABELS[role] ?? role}</div>
        </div>
        {role !== "ouvrier" && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-sidebar-foreground/50 px-1">
              Entité
            </label>
            <Select value={entiteId} onValueChange={(v) => setEntite(v)}>
              <SelectTrigger className="bg-sidebar-accent/40 border-sidebar-border text-sidebar-foreground h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les entités</SelectItem>
                {entites.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: e.couleur ?? "#999" }}
                      />
                      {e.nom}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-4 space-y-1 mt-2">
        {items.map((it) => {
          const active = isActive(it.to, it.exact);
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <it.icon className="w-4 h-4" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <a
          href="/manuel_chantier_hub.html"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <BookOpen className="w-4 h-4" />
          <span>Documentation</span>
        </a>
        <div className="flex items-center gap-1">
          <button
            onClick={() => signOut()}
            className="flex flex-1 items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
          <ThemeToggle variant="sidebar" />
        </div>
        <nav className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-1 text-[11px] text-sidebar-foreground/50">
          <Link
            to="/mentions-legales"
            onClick={onNavigate}
            className="hover:text-sidebar-foreground"
          >
            Mentions légales
          </Link>
          <Link
            to="/confidentialite"
            onClick={onNavigate}
            className="hover:text-sidebar-foreground"
          >
            Confidentialité
          </Link>
          <Link to="/cgu" onClick={onNavigate} className="hover:text-sidebar-foreground">
            CGU
          </Link>
          <Link to="/cookies" onClick={onNavigate} className="hover:text-sidebar-foreground">
            Cookies
          </Link>
        </nav>
      </div>
    </div>
  );
}

// Sidebar desktop uniquement (masquée sur mobile → remplacée par la top bar + Sheet).
export function AppSidebar() {
  return (
    <aside className="hidden md:flex md:sticky md:top-0 md:h-screen w-64 shrink-0">
      <SidebarContent />
    </aside>
  );
}
