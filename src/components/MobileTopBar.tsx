import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarContent } from "@/components/AppSidebar";

const TITRES: { prefix: string; label: string }[] = [
  { prefix: "/devis", label: "Devis" },
  { prefix: "/chantiers", label: "Chantiers" },
  { prefix: "/clients", label: "Clients" },
  { prefix: "/heures", label: "Heures" },
  { prefix: "/factures", label: "Facture" },
  { prefix: "/factures-fournisseurs", label: "Suivi facturation" },
  { prefix: "/bibliotheque", label: "Bibliothèque" },
  { prefix: "/parametres", label: "Paramètres" },
];

function titrePage(path: string): string {
  const m = TITRES.find((t) => path === t.prefix || path.startsWith(t.prefix + "/"));
  return m ? m.label : "Accueil";
}

// Barre supérieure mobile (masquée ≥ md). Logo · titre de page · thème + hamburger → Sheet.
export function MobileTopBar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
      <div className="shrink-0 text-base font-light tracking-tight">
        Chantier <span className="text-sidebar-foreground/50">Hub</span>
      </div>
      <div className="flex-1 truncate text-center text-sm font-medium">{titrePage(path)}</div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle variant="sidebar" />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Ouvrir le menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 border-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
