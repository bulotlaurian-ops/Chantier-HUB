// =====================================================================
// Edge Function `admin-utilisateurs` — gestion des comptes par l'admin.
// Créer un compte ou réinitialiser un mot de passe demande la clé
// service_role, qui ne doit JAMAIS vivre dans le navigateur : elle reste
// ici, et l'appelant est vérifié à chaque requête.
//   1) JWT Supabase obligatoire (401 sinon) ;
//   2) rôle `admin` obligatoire, lu en base (403 sinon) ;
//   3) action `creer` → crée le compte auth (email auto-confirmé, l'ouvrier
//      se connecte immédiatement même avec un identifiant interne du type
//      j.martin@chantier.local) puis renseigne son profil ;
//      action `reinitialiser_mdp` → nouveau mot de passe donné par l'admin.
// Env requis : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLES = ["admin", "conducteur", "ouvrier"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erreur: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, erreur: "non_authentifie" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const appel = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await appel.auth.getUser();
  if (authErr || !user) return json({ ok: false, erreur: "non_authentifie" }, 401);

  const { data: profil } = await appel.from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "admin") return json({ ok: false, erreur: "role_non_autorise" }, 403);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, erreur: "payload_invalide" }, 400);
  }

  // Identifiants de connexion : l'email vit dans auth.users, hors de portée du
  // navigateur. On ne renvoie QUE id + email + dernière connexion (jamais de mot
  // de passe : ils sont hachés et irrécupérables, même ici).
  if (body.action === "lister") {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return json({ ok: false, erreur: error.message }, 400);
    return json({
      ok: true,
      utilisateurs: data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        derniere_connexion: u.last_sign_in_at ?? null,
      })),
    }, 200);
  }

  // ---------------------------------------------------------------- créer
  if (body.action === "creer") {
    const email = (body.email ?? "").trim().toLowerCase();
    const motDePasse = body.mot_de_passe ?? "";
    const nom = (body.nom ?? "").trim();
    const prenom = (body.prenom ?? "").trim();
    const role = body.role ?? "";

    if (!email.includes("@")) return json({ ok: false, erreur: "email_invalide" }, 400);
    if (motDePasse.length < 8) return json({ ok: false, erreur: "mot_de_passe_trop_court" }, 400);
    if (!nom) return json({ ok: false, erreur: "nom_requis" }, 400);
    if (!ROLES.includes(role)) return json({ ok: false, erreur: "role_invalide" }, 400);

    const { data: cree, error: e1 } = await admin.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true, // pas de mail de confirmation : identifiant interne possible
      user_metadata: { nom: prenom ? `${prenom} ${nom}` : nom },
    });
    if (e1 || !cree.user) return json({ ok: false, erreur: e1?.message ?? "creation_echouee" }, 400);

    // Le trigger on_auth_user_created a déjà inséré le profil (rôle ouvrier par
    // défaut) : on le complète avec le nom, le prénom et le rôle demandés.
    const { error: e2 } = await admin
      .from("profiles")
      .update({ nom, prenom: prenom || null, role })
      .eq("id", cree.user.id);
    if (e2) return json({ ok: false, erreur: `compte_cree_profil_incomplet: ${e2.message}` }, 500);

    // Accès à TOUTES les entités par défaut : un compte neuf voit l'ensemble des
    // devis et chantiers. L'admin restreint ensuite depuis « Entités accessibles ».
    const { data: entites } = await admin.from("entites").select("id");
    if (entites?.length) {
      await admin
        .from("user_entites")
        .upsert(entites.map((e) => ({ profile_id: cree.user!.id, entite_id: e.id })), { onConflict: "profile_id,entite_id" });
    }

    return json({ ok: true, id: cree.user.id, email }, 200);
  }

  // ------------------------------------------------- réinitialiser le mdp
  if (body.action === "reinitialiser_mdp") {
    const id = body.id ?? "";
    const motDePasse = body.mot_de_passe ?? "";
    if (!id) return json({ ok: false, erreur: "id_requis" }, 400);
    if (motDePasse.length < 8) return json({ ok: false, erreur: "mot_de_passe_trop_court" }, 400);

    const { error } = await admin.auth.admin.updateUserById(id, { password: motDePasse });
    if (error) return json({ ok: false, erreur: error.message }, 400);
    return json({ ok: true }, 200);
  }

  // Suppression DURE. Refusée si l'utilisateur a produit des données : les FK
  // (pointages.ouvrier_id, devis.created_by, prestations.created_by,
  // factures.cree_par, snapshots.created_by) sont en NO ACTION et protègent
  // l'historique. Dans ce cas l'app propose la désactivation à la place.
  if (body.action === "supprimer") {
    const id = body.id ?? "";
    if (!id) return json({ ok: false, erreur: "id_requis" }, 400);
    if (id === user.id) return json({ ok: false, erreur: "suppression_de_soi" }, 400);

    const compte = async (table: string, col: string) => {
      const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq(col, id);
      return count ?? 0;
    };
    const liens: string[] = [];
    const n1 = await compte("pointages", "ouvrier_id");
    if (n1) liens.push(`${n1} pointage${n1 > 1 ? "s" : ""}`);
    const n2 = await compte("devis", "created_by");
    if (n2) liens.push(`${n2} devis`);
    const n3 = await compte("prestations", "created_by");
    if (n3) liens.push(`${n3} prestation${n3 > 1 ? "s" : ""}`);
    const n4 = await compte("factures_fournisseurs", "cree_par");
    if (n4) liens.push(`${n4} facture${n4 > 1 ? "s" : ""}`);
    if (liens.length) return json({ ok: false, erreur: "donnees_liees", details: liens.join(", ") }, 409);

    // profiles.id -> auth.users est en CASCADE : le profil part avec le compte.
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ ok: false, erreur: error.message }, 400);
    return json({ ok: true }, 200);
  }

  return json({ ok: false, erreur: "action_inconnue" }, 400);
});
