import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client Supabase typé sur le schéma de la base (cf. database.types.ts).
// Les clés viennent des variables d'environnement (jamais en dur, CLAUDE.md §10).
// VITE_SUPABASE_ANON_KEY = clé publishable/anon (publique, protégée par la RLS).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Configuration Supabase manquante : renseigne VITE_SUPABASE_URL et " +
      "VITE_SUPABASE_ANON_KEY dans .env.local (voir .env.example).",
  );
}

export const supabase = createClient<Database>(url, anonKey);
