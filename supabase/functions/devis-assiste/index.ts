// =====================================================================
// Edge Function `devis-assiste` — relais sécurisé app → webhook n8n.
// Le navigateur ne porte JAMAIS le secret n8n. Ici on :
//   1) vérifie le JWT Supabase du caller (401 si absent/invalide) ;
//   2) refuse le rôle `ouvrier` (403) — seuls admin/conducteur créent des devis ;
//   3) ajoute le header X-Webhook-Secret et relaie le body BRUT vers n8n (timeout 60s) ;
//   4) renvoie la réponse n8n telle quelle.
// Env Supabase requis : DEVIS_WEBHOOK_SECRET, N8N_WEBHOOK_URL.
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erreur: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, erreur: "non_authentifie" }, 401);

  // Client natif avec le JWT du caller → getUser() valide le token, la RLS s'applique.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ ok: false, erreur: "non_authentifie" }, 401);

  // Rôle : seuls admin/conducteur créent des devis. (profiles_self autorise la lecture de soi.)
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return json({ ok: false, erreur: "profil_introuvable" }, 403);
  if (profile.role === "ouvrier") return json({ ok: false, erreur: "role_non_autorise" }, 403);

  const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  const secret = Deno.env.get("DEVIS_WEBHOOK_SECRET");
  if (!webhookUrl || !secret) return json({ ok: false, erreur: "config_manquante" }, 500);

  // Relais BRUT du body (aucune transformation : l'app construit le JSON complet).
  const bodyText = await req.text();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: bodyText,
      signal: controller.signal,
    });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return json({ ok: false, erreur: aborted ? "timeout" : "relais_echoue" }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
});
