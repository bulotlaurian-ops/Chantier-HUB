// =====================================================================
// Edge Function `ocr-facture` — relais sécurisé app → webhook n8n (OCR factures).
// Le navigateur ne porte JAMAIS le secret n8n. Ici on :
//   1) vérifie le JWT Supabase du caller (401 si absent/invalide) ;
//   2) refuse le rôle `ouvrier` (403) ;
//   3) ajoute le header X-Webhook-Secret et relaie le body BRUT
//      ({ facture_id, fichier_path, bucket }) vers n8n (timeout 60s) ;
//   4) renvoie la réponse n8n telle quelle.
// Env Supabase requis : OCR_WEBHOOK_SECRET, OCR_WEBHOOK_URL.
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ ok: false, erreur: "non_authentifie" }, 401);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return json({ ok: false, erreur: "profil_introuvable" }, 403);
  if (profile.role === "ouvrier") return json({ ok: false, erreur: "role_non_autorise" }, 403);

  const webhookUrl = Deno.env.get("OCR_WEBHOOK_URL");
  const secret = Deno.env.get("OCR_WEBHOOK_SECRET");
  if (!webhookUrl || !secret) return json({ ok: false, erreur: "config_manquante" }, 500);

  const bodyText = await req.text(); // relais BRUT : { facture_id, fichier_path, bucket }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      // Le credential Header Auth du webhook OCR n8n attend ce nom de header précis
      // (différent du workflow devis qui utilise X-Webhook-Secret).
      headers: { "Content-Type": "application/json", "OCR_FACTURE_WEBHOOK_SECRET": secret },
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
