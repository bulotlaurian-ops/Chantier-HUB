import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/lib/database.types";

export type ProfileRow = Tables<"profiles">;
export type ProfileTaux = Pick<ProfileRow, "id" | "nom" | "prenom" | "role" | "taux_horaire">;

const KEY = ["profiles"] as const;

// Liste des profils. La RLS borne le périmètre : admin = tous ; conducteur = les
// ouvriers ; ouvrier = lui-même. Utilisé pour les filtres et l'affichage des noms.
export function useProfiles() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from("profiles").select("*").order("nom");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Profils actifs ouvriers + conducteurs, pour la configuration des taux horaires
// (page Paramètres, admin-only via la RLS profiles_admin).
export function useProfilesActifs() {
  return useQuery({
    queryKey: [...KEY, "actifs"],
    queryFn: async (): Promise<ProfileTaux[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nom, prenom, role, taux_horaire")
        .eq("actif", true)
        .in("role", ["ouvrier", "conducteur"])
        .order("nom");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Change le rôle d'un utilisateur. Autorisé aux seuls admins par la RLS
// (policy profiles_admin) — un conducteur ou un ouvrier reçoit une erreur.
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: ProfileRow["role"] }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ---- Gestion des comptes via l'Edge Function `admin-utilisateurs` ----
// Créer un compte ou remettre un mot de passe demande la clé service_role :
// l'appel passe par la fonction, qui revérifie le rôle admin côté serveur.
const FN_ADMIN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-utilisateurs`;

async function appelerAdminUtilisateurs(payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expirée — reconnecte-toi.");
  const resp = await fetch(FN_ADMIN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const res = await resp.json().catch(() => ({}));
  if (!resp.ok || !res.ok) {
    const messages: Record<string, string> = {
      role_non_autorise: "Seul un administrateur peut gérer les comptes.",
      email_invalide: "Identifiant invalide (format attendu : nom@domaine).",
      mot_de_passe_trop_court: "Le mot de passe doit faire au moins 8 caractères.",
      nom_requis: "Le nom est obligatoire.",
      role_invalide: "Rôle invalide.",
      non_authentifie: "Session expirée — reconnecte-toi.",
    };
    const code = String(res.erreur ?? "");
    if (code === "donnees_liees") {
      throw new Error(
        `Ce compte a produit des données (${res.details}) — elles doivent rester rattachées à leur auteur. ` +
          `Désactive le compte plutôt que de le supprimer.`,
      );
    }
    if (code === "suppression_de_soi") throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
    throw new Error(
      messages[code] ??
        (/already|exists|registered/i.test(code) ? "Cet identifiant est déjà utilisé." : code || "Échec de l'opération"),
    );
  }
  return res;
}

export interface NouvelUtilisateur {
  email: string;
  mot_de_passe: string;
  nom: string;
  prenom?: string;
  role: ProfileRow["role"];
}

export function useCreerUtilisateur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (u: NouvelUtilisateur) => appelerAdminUtilisateurs({ action: "creer", ...u }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Supprime un compte. La fonction refuse (409) si l'utilisateur a produit des
// données : l'historique reste intact, l'app propose la désactivation à la place.
export function useSupprimerUtilisateur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => appelerAdminUtilisateurs({ action: "supprimer", id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Désactive/réactive un compte : la connexion est refusée tant que actif = false
// (contrôle à l'ouverture de session). Alternative à la suppression pour un
// employé qui part mais dont les pointages et devis doivent être conservés.
export function useUpdateActif() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      const { error } = await supabase.from("profiles").update({ actif }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Identifiants de connexion : l'email vit dans auth.users, hors de portée du
// navigateur — il passe donc par l'Edge Function (admin uniquement). Aucun mot
// de passe n'est renvoyé : ils sont hachés et irrécupérables, même côté serveur.
export interface IdentifiantUtilisateur {
  id: string;
  email: string | null;
  derniere_connexion: string | null;
}

export function useIdentifiants() {
  return useQuery({
    queryKey: [...KEY, "identifiants"],
    queryFn: async (): Promise<Record<string, IdentifiantUtilisateur>> => {
      const res = await appelerAdminUtilisateurs({ action: "lister" });
      const map: Record<string, IdentifiantUtilisateur> = {};
      for (const u of (res.utilisateurs ?? []) as IdentifiantUtilisateur[]) map[u.id] = u;
      return map;
    },
    retry: false, // un non-admin reçoit 403 : inutile d'insister
  });
}

export function useReinitialiserMotDePasse() {
  return useMutation({
    mutationFn: ({ id, mot_de_passe }: { id: string; mot_de_passe: string }) =>
      appelerAdminUtilisateurs({ action: "reinitialiser_mdp", id, mot_de_passe }),
  });
}

// Met à jour le taux horaire individuel d'un profil (null = retombe sur le défaut).
export function useUpdateTauxHoraire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taux_horaire }: { id: string; taux_horaire: number | null }) => {
      const { error } = await supabase.from("profiles").update({ taux_horaire }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }), // préfixe → couvre ["profiles","actifs"]
  });
}
