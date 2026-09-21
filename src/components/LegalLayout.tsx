import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGAL, estAcompleter } from "@/lib/legal-config";

const LIENS = [
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/confidentialite", label: "Confidentialité" },
  { to: "/cgu", label: "Conditions d'utilisation" },
  { to: "/cookies", label: "Cookies" },
] as const;

export function LegalLayout({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l'application
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{titre}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Dernière mise à jour : {LEGAL.misAJour}
        </p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/85">{children}</div>
      </main>

      <footer className="border-t">
        <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-xs text-muted-foreground">
          {LIENS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}

export function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">{titre}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Liste({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

// Valeur de configuration : surlignée en jaune tant qu'elle reste à compléter.
export function V({ v }: { v: string }) {
  if (estAcompleter(v)) {
    return <mark className="rounded bg-yellow-200 px-1 text-yellow-950">{v}</mark>;
  }
  return <>{v}</>;
}

export function Tableau({ entetes, lignes }: { entetes: string[]; lignes: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {entetes.map((e) => (
              <th key={e} className="px-3 py-2 font-medium">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t align-top">
              {l.map((c, j) => (
                <td key={j} className="px-3 py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
