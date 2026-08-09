import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

// Config Vite explicite. Déploiement Vercel via Nitro.
// La cible Nitro se pilote par NITRO_PRESET : "vercel" par défaut ici
// (overridable, ex. NITRO_PRESET=node-server pour un build local générique).
// Sur Vercel, Nitro détecte de toute façon l'environnement automatiquement.
process.env.NITRO_PRESET ||= "vercel";

export default defineConfig({
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
});
