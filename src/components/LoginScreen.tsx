import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForceLightTheme } from "@/lib/theme";

type Mode = "login" | "forgot" | "sent";

export function LoginScreen() {
  useForceLightTheme(); // la page de connexion s'affiche toujours en mode clair
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Réinitialisation : e-mail saisi + état d'envoi (logique de connexion inchangée).
  const [resetEmail, setResetEmail] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      setError(error === "Invalid login credentials" ? "Identifiants incorrects." : error);
      setSubmitting(false);
    }
    // En cas de succès, la session change et <AuthGate> bascule sur l'app.
  };

  const onSendReset = async (e: FormEvent) => {
    e.preventDefault();
    setResetSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSubmitting(false);
    if (error) {
      toast.error("Envoi impossible : " + error.message);
      return;
    }
    setMode("sent");
  };

  const backToLogin = () => {
    setMode("login");
    setError(null);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panneau gauche — anthracite, marque (masqué en mobile) */}
      <div className="relative hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
        <div className="text-2xl font-light tracking-tight">
          Artisan Pro <span className="text-white/60">Group</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-light leading-snug tracking-tight">
            La gestion de vos devis et chantiers, du premier prix à la marge réelle.
          </p>
          <p className="mt-4 text-sm font-light text-white/50">
            Rénovation · construction · extérieurs — Suisse romande.
          </p>
        </div>
        <div className="text-xs font-light text-white/40">© Chantier Hub</div>
      </div>

      {/* Panneau droit — formulaire */}
      <div className="relative flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Marque mobile (le panneau gauche est masqué) */}
          <div className="mb-10 lg:hidden">
            <div className="text-xl font-light tracking-tight text-foreground">
              Artisan Pro <span className="text-muted-foreground">Group</span>
            </div>
          </div>

          {mode === "login" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-light tracking-tight text-foreground">Connexion</h1>
                <p className="mt-2 text-sm text-muted-foreground">Accédez à votre espace de gestion.</p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="prenom@entreprise.ch"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">{error}</p>
                )}

                <Button type="submit" className="h-11 w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Se connecter
                </Button>
              </form>

              <p className="mt-8 text-xs text-muted-foreground">
                Accès réservé. Les comptes sont créés par l'administrateur.
              </p>
            </>
          )}

          {mode === "forgot" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-light tracking-tight text-foreground">Mot de passe oublié</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Saisissez votre e-mail : nous vous enverrons un lien de réinitialisation.
                </p>
              </div>

              <form onSubmit={onSendReset} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="prenom@entreprise.ch"
                    className="h-11"
                  />
                </div>

                <Button type="submit" className="h-11 w-full" disabled={resetSubmitting}>
                  {resetSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Envoyer le lien de réinitialisation
                </Button>
              </form>

              <button
                type="button"
                onClick={backToLogin}
                className="mt-8 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Retour à la connexion
              </button>
            </>
          )}

          {mode === "sent" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-light tracking-tight text-foreground">E-mail envoyé</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Un lien de réinitialisation a été envoyé à <span className="font-medium text-foreground">{resetEmail}</span>.
                  Vérifiez votre boîte mail.
                </p>
              </div>

              <button
                type="button"
                onClick={backToLogin}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
