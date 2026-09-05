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
      { title: "Chantier Hub — Gestion de chantier" },
      { name: "description", content: "Gestion des devis et suivi de chantier en temps réel" },
      { property: "og:title", content: "Chantier Hub — Gestion de chantier" },
      { name: "twitter:title", content: "Chantier Hub — Gestion de chantier" },
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
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
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
        <AppContent />
        <Toaster richColors position="bottom-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Routes publiques (sans authentification ni layout applicatif).
const PUBLIC_ROUTES = ["/reset-password"];

function AppContent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // /reset-password : page publique plein écran, hors AuthGate et hors sidebar.
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
