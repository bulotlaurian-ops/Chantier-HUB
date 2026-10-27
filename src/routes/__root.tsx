import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileTopBar } from "@/components/MobileTopBar";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "@/components/AuthGate";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { APP } from "@/config/entreprise";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP.nom} — Gestion de chantier` },
      { name: "description", content: "Gestion des devis et suivi de chantier en temps réel" },
      { property: "og:title", content: `${APP.nom} — Gestion de chantier` },
      { name: "twitter:title", content: `${APP.nom} — Gestion de chantier` },
      {
        property: "og:description",
        content: "Gestion des devis et suivi de chantier en temps réel",
      },
      {
        name: "twitter:description",
        content: "Gestion des devis et suivi de chantier en temps réel",
      },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Applique le thème (clair/sombre) avant le paint pour éviter le flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  // Un QueryClient par arbre de rendu (évite le partage d'état entre requêtes en SSR)
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* `npm run dev:essai` (.env.essai.local) : rappel permanent qu'on n'est pas en prod. */}
        {import.meta.env.MODE === "essai" && (
          <div className="fixed top-0 inset-x-0 z-[100] bg-orange-500 text-white text-xs font-semibold text-center py-0.5 pointer-events-none">
            BASE DE TEST, aucune donnée réelle
          </div>
        )}
        <AppContent />
        <Toaster richColors position="bottom-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Routes publiques (sans authentification ni layout applicatif).
const PUBLIC_ROUTES = [
  "/reset-password",
  "/mentions-legales",
  "/confidentialite",
  "/cgu",
  "/cookies",
];

function AppContent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Pages publiques plein écran (réinitialisation, pages légales), hors AuthGate et sidebar.
  if (PUBLIC_ROUTES.includes(pathname)) {
    return <Outlet />;
  }

  return (
    <AuthGate>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 min-w-0 flex-col">
          <MobileTopBar />
          <main className="flex-1 min-w-0 overflow-x-hidden">
            <div className="max-w-[1400px] mx-auto px-3 py-4 md:px-6 md:py-8 animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
