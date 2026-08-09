import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useStore } from "./store";
import type { Role } from "./types";

export interface Profile {
  id: string;
  nom: string;
  prenom: string | null;
  role: Role;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Rôle admin strict (suppressions, validation biblio, paramètres). */
  isAdmin: boolean;
  /** Staff = admin OU conducteur (mêmes droits UI, hors actions admin-only). */
  isStaff: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Session : récupération initiale + abonnement aux changements (login/logout/refresh)
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Profil : chargé UNE FOIS par utilisateur. IMPORTANT (retour client) : au
  // retour sur l'onglet, Supabase émet TOKEN_REFRESHED avec un NOUVEL objet
  // session ; l'ancien effet (dépendant de l'objet session) repassait alors
  // loading=true → AuthGate remplaçait toute l'app par un spinner → démontage
  // complet et perte de toute saisie en cours. On ne bloque l'UI qu'au premier
  // chargement du profil ; un simple refresh de jeton ne touche plus au rendu.
  const profilChargePour = useRef<string | null>(null);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      profilChargePour.current = null;
      return;
    }
    if (profilChargePour.current === userId) return; // même utilisateur, jeton rafraîchi : rien à faire
    let active = true;
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, nom, prenom, role, actif")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const brut = data as (Profile & { actif?: boolean }) | null;
        // Compte désactivé par un admin : la session est fermée immédiatement.
        // Sans ce contrôle, « désactiver » n'empêcherait pas la connexion.
        if (brut && brut.actif === false) {
          supabase.auth.signOut();
          setProfile(null);
          setLoading(false);
          return;
        }
        const p = brut ? { id: brut.id, nom: brut.nom, prenom: brut.prenom, role: brut.role } : null;
        profilChargePour.current = p ? userId : null;
        setProfile(p);
        if (p) {
          const store = useStore.getState();
          store.setRole(p.role);
          if (p.role === "ouvrier") store.setOuvrier(p.id);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = profile?.role === "admin";
  const isStaff = profile?.role === "admin" || profile?.role === "conducteur";

  return (
    <AuthContext.Provider value={{ session, profile, loading, isAdmin, isStaff, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}
