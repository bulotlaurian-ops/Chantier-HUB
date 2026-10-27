import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useEntites, useUpdateTvaSurDebits } from "@/lib/queries/entites";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  User,
  Building2,
  Percent,
  Clock as ClockIcon,
  Users as UsersIcon,
  RotateCcw,
} from "lucide-react";
import { formatEUR } from "@/lib/format";
import { useParametres, paramNumber, useUpdateParametre } from "@/lib/queries/parametres";
import {
  useProfiles,
  useProfilesActifs,
  useUpdateTauxHoraire,
  useUpdateRole,
  useCreerUtilisateur,
  useReinitialiserMotDePasse,
  useSupprimerUtilisateur,
  useUpdateActif,
  useIdentifiants,
  type ProfileTaux,
  type ProfileRow,
} from "@/lib/queries/profiles";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, KeyRound, Trash2, Power } from "lucide-react";
import { ConfirmAction } from "@/components/ConfirmAction";

export const Route = createFileRoute("/parametres/")({ component: ParametresGate });

// Garde de route : Paramètres réservé aux admins. Le conducteur est redirigé vers l'accueil.
function ParametresGate() {
  const { profile, isAdmin } = useAuth();
  if (!profile)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!isAdmin) return <Navigate to="/" />;
  return <Parametres />;
}

const TVA_RATES = [
  { label: "Standard", value: 20, usage: "Prestations & matériaux courants" },
  { label: "Intermédiaire", value: 10, usage: "Travaux de rénovation (logement > 2 ans)" },
  { label: "Réduit", value: 5.5, usage: "Travaux d’amélioration énergétique" },
  { label: "Exonéré", value: 0, usage: "Export, prestations exclues" },
];

// Option fiscale de l'entreprise : si elle a opté pour la TVA d'après les débits,
// la mention devient obligatoire sur ses factures (réforme facture électronique).
function TvaSurDebitsSwitch({ entiteId, active }: { entiteId: string; active: boolean }) {
  const update = useUpdateTvaSurDebits();
  return (
    <label className="mt-4 flex items-start gap-3 rounded-md border p-3 cursor-pointer">
      <Switch
        checked={active}
        disabled={update.isPending}
        onCheckedChange={(v) =>
          update.mutate(
            { id: entiteId, tva_sur_debits: v },
            {
              onSuccess: () => toast.success(v ? "TVA sur les débits activée" : "Option retirée"),
              onError: (e) => toast.error("Enregistrement impossible : " + e.message),
            },
          )
        }
      />
      <span>
        <span className="text-sm font-medium block">Option TVA sur les débits</span>
        <span className="text-xs text-muted-foreground">
          À activer seulement si l'entreprise a opté pour ce régime auprès des impôts (à vérifier
          avec le comptable). La mention sera imprimée sur les nouvelles factures.
        </span>
      </span>
    </label>
  );
}

function Parametres() {
  const { data: entites = [] } = useEntites();
  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Paramètres" subtitle="Configuration des entités, TVA et accès" />

      <Tabs defaultValue="identite">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="identite" className="gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Identité
          </TabsTrigger>
          <TabsTrigger value="tva" className="gap-1.5">
            <Percent className="w-3.5 h-3.5" />
            TVA
          </TabsTrigger>
          <TabsTrigger value="ouvriers" className="gap-1.5">
            <UsersIcon className="w-3.5 h-3.5" />
            Ouvriers
          </TabsTrigger>
          <TabsTrigger value="heures" className="gap-1.5">
            <ClockIcon className="w-3.5 h-3.5" />
            Heures
          </TabsTrigger>
          <TabsTrigger value="acces" className="gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Accès
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identite" className="space-y-4">
          {entites.map((e) => (
            <Card key={e.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: e.couleur ?? "#999" }}
                  />
                  {e.nom}
                  <Badge variant="outline" className="font-mono ml-auto">
                    {e.code}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Raison sociale, adresse, IBAN et contacts sont définis dans{" "}
                  <code>src/lib/pdf.ts</code> (imprimés sur les devis PDF). Leur édition depuis cet
                  écran n'est pas encore disponible.
                </p>
                <TvaSurDebitsSwitch entiteId={e.id} active={e.tva_sur_debits} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="tva" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Taux de TVA France 2026</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {TVA_RATES.map((t) => (
                <div key={t.value} className="flex items-center gap-3 p-3 rounded-md border">
                  <Badge variant="outline" className="w-24 justify-center">
                    {t.label}
                  </Badge>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.value.toFixed(1)} %</div>
                    <div className="text-xs text-muted-foreground">{t.usage}</div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground italic mt-2">
                Taux applicables dès le 01.01.2024 — modifiables si l'administration fiscale publie
                de nouveaux taux. Référence uniquement : la valeur réellement utilisée par les devis
                est celle de la table <code>tva_taux</code>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ouvriers" className="space-y-3">
          <TauxHoraireDefautCard />
          <TauxParEmployeCard />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Devis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground italic">
                Validité par défaut des devis et conditions par défaut : configuration à construire
                dans un prochain chantier (non câblée à Supabase actuellement).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heures" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Journée de référence</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground italic">
                Durée de journée de référence : configuration à construire dans un prochain chantier
                (non câblée à Supabase actuellement).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acces" className="space-y-3">
          <ComptesUtilisateurs />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rôles & permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2 p-3 border rounded">
                <ShieldCheck className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <strong>Admin</strong> — accès complet : devis, chantiers, bibliothèque,
                  paramètres et gestion des comptes.
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 border rounded">
                <UsersIcon className="w-4 h-4 text-primary mt-0.5" />
                <div>
                  <strong>Conducteur</strong> — devis, chantiers et bibliothèque de ses entités.
                  N'accède pas aux paramètres ni aux comptes.
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 border rounded">
                <User className="w-4 h-4 text-accent mt-0.5" />
                <div>
                  <strong>Ouvrier</strong> — pointage de ses heures uniquement (mobile-first). Ne
                  voit ni les prix, ni les marges, ni les devis.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  ouvrier: "Ouvrier",
  conducteur: "Conducteur",
  admin: "Admin",
};

// Taux horaire par défaut (table parametres) — appliqué à défaut de taux individuel.
function TauxHoraireDefautCard() {
  const { data: params, isLoading } = useParametres();
  const update = useUpdateParametre();
  const defaut = paramNumber(params, "taux_horaire_defaut", 70);
  const [touched, setTouched] = useState(false);
  const [val, setVal] = useState("");
  const current = touched ? val : String(defaut);

  const save = () => {
    const n = Number(current);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Taux invalide");
      return;
    }
    update.mutate(
      { cle: "taux_horaire_defaut", valeur: String(n) },
      {
        onSuccess: () => {
          setTouched(false);
          toast.success("Taux par défaut enregistré");
        },
        onError: (e) => toast.error("Échec : " + (e as Error).message),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taux horaire par défaut</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="0"
                value={current}
                onChange={(e) => {
                  setTouched(true);
                  setVal(e.target.value);
                }}
                className="w-32 text-right num-tabular"
              />
              <span className="text-xs text-muted-foreground">€/h</span>
              <Button onClick={save} disabled={update.isPending}>
                {update.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Enregistrer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Appliqué à tout employé sans taux individuel. Coût chargé indicatif ≈{" "}
              {formatEUR(defaut * 1.25)}/h (FG ×1.25).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Comptes utilisateurs : liste complète, changement de rôle, création de compte
// et réinitialisation de mot de passe (Artisan Pro gère ses employés lui-même).
const ROLES_OPTIONS: { value: ProfileRow["role"]; label: string; aide: string }[] = [
  {
    value: "ouvrier",
    label: "Ouvrier",
    aide: "Pointe ses heures. Ne voit ni les prix, ni les marges, ni les devis.",
  },
  {
    value: "conducteur",
    label: "Conducteur",
    aide: "Devis, chantiers et bibliothèque de son entité. Pas les paramètres.",
  },
  {
    value: "admin",
    label: "Admin",
    aide: "Accès complet, y compris paramètres et gestion des comptes.",
  },
];

// Identifiant proposé à partir du nom : j.martin@chantier.local. L'admin le
// remplace par le vrai email pro quand l'employé en a un.
function identifiantSuggere(prenom: string, nom: string): string {
  const clean = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const n = clean(nom);
  if (!n) return "";
  const p = clean(prenom);
  return `${p ? p[0] + "." : ""}${n}@chantier.local`;
}

function ComptesUtilisateurs() {
  const { data: profils = [], isLoading } = useProfiles();
  const { data: identifiants = {} } = useIdentifiants();
  const [creerOpen, setCreerOpen] = useState(false);
  const [mdpPour, setMdpPour] = useState<ProfileRow | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Comptes utilisateurs</CardTitle>
        <Button size="sm" onClick={() => setCreerOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1" />
          Nouveau compte
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2">Nom</th>
                  <th className="text-left px-3 py-2">Prénom</th>
                  <th className="text-left px-3 py-2">Identifiant de connexion</th>
                  <th className="text-left px-3 py-2 w-44">Rôle</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {profils.map((p) => (
                  <CompteRow
                    key={p.id}
                    p={p}
                    identifiant={identifiants[p.id]}
                    onMdp={() => setMdpPour(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground italic px-3 py-3">
          Clique un identifiant pour le copier et le transmettre à l'employé — c'est avec lui qu'il
          se connecte. Le rôle est appliqué immédiatement ; l'utilisateur le voit à sa prochaine
          connexion. Un employé sans adresse e-mail reçoit un identifiant interne (ex.
          j.martin@chantier.local) : il sert uniquement à se connecter, aucun message n'y est
          envoyé.
        </p>
      </CardContent>
      <CreerCompteDialog open={creerOpen} onOpenChange={setCreerOpen} />
      <MotDePasseDialog profil={mdpPour} onClose={() => setMdpPour(null)} />
    </Card>
  );
}

function CompteRow({
  p,
  identifiant,
  onMdp,
}: {
  p: ProfileRow;
  identifiant?: { email: string | null; derniere_connexion: string | null };
  onMdp: () => void;
}) {
  const update = useUpdateRole();
  const supprimer = useSupprimerUtilisateur();
  const setActif = useUpdateActif();
  const { profile } = useAuth();
  const estMoi = profile?.id === p.id;
  const inactif = p.actif === false;
  return (
    <tr className={`border-b last:border-0 hover:bg-muted/20 ${inactif ? "opacity-50" : ""}`}>
      <td className="px-3 py-2 font-medium">
        {p.nom}
        {estMoi && <span className="ml-2 text-xs text-muted-foreground">(vous)</span>}
        {inactif && (
          <span className="ml-2 text-[10px] uppercase text-muted-foreground">désactivé</span>
        )}
      </td>
      <td className="px-3 py-2">{p.prenom ?? "—"}</td>
      <td className="px-3 py-2">
        {identifiant?.email ? (
          <button
            type="button"
            title="Copier l'identifiant"
            onClick={() => {
              navigator.clipboard?.writeText(identifiant.email!);
              toast.success("Identifiant copié");
            }}
            className="font-mono text-xs hover:underline text-left"
          >
            {identifiant.email}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        <div className="text-[10px] text-muted-foreground">
          {identifiant?.derniere_connexion
            ? `dernière connexion ${new Date(identifiant.derniere_connexion).toLocaleDateString("fr-CH")}`
            : "jamais connecté"}
        </div>
      </td>
      <td className="px-3 py-2">
        <Select
          value={p.role}
          disabled={estMoi || update.isPending}
          onValueChange={(v) =>
            update.mutate(
              { id: p.id, role: v as ProfileRow["role"] },
              {
                onSuccess: () =>
                  toast.success(
                    `${p.nom} est maintenant ${ROLES_OPTIONS.find((r) => r.value === v)?.label.toLowerCase()}`,
                  ),
                onError: (e) => toast.error("Changement impossible : " + (e as Error).message),
              },
            )
          }
        >
          <SelectTrigger
            className="h-9"
            title={estMoi ? "Vous ne pouvez pas changer votre propre rôle" : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onMdp} title="Définir un nouveau mot de passe">
            <KeyRound className="w-4 h-4" />
          </Button>
          {!estMoi && (
            <Button
              size="sm"
              variant="ghost"
              disabled={setActif.isPending}
              title={
                inactif
                  ? "Réactiver le compte"
                  : "Désactiver : la connexion est refusée, les données sont conservées"
              }
              onClick={() =>
                setActif.mutate(
                  { id: p.id, actif: inactif },
                  {
                    onSuccess: () =>
                      toast.success(
                        inactif
                          ? `${p.nom} réactivé`
                          : `${p.nom} désactivé — il ne peut plus se connecter`,
                      ),
                    onError: (e) => toast.error("Échec : " + (e as Error).message),
                  },
                )
              }
            >
              <Power className={`w-4 h-4 ${inactif ? "text-emerald-600" : ""}`} />
            </Button>
          )}
          {!estMoi && (
            <ConfirmAction
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  title="Supprimer définitivement"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              }
              title={`Supprimer le compte de ${p.prenom ?? ""} ${p.nom} ?`}
              description="Action irréversible. Refusée si l'utilisateur a déjà saisi des pointages, devis ou prestations — dans ce cas, désactive le compte pour conserver l'historique."
              confirmLabel="Supprimer définitivement"
              destructive
              requireCheck
              onConfirm={() =>
                supprimer.mutate(
                  { id: p.id },
                  {
                    onSuccess: () => toast.success("Compte supprimé"),
                    onError: (e) => toast.error((e as Error).message, { duration: 8000 }),
                  },
                )
              }
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function CreerCompteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const creer = useCreerUtilisateur();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouche, setEmailTouche] = useState(false);
  const [mdp, setMdp] = useState("");
  const [role, setRole] = useState<ProfileRow["role"]>("ouvrier");

  const suggere = identifiantSuggere(prenom, nom);
  const identifiant = emailTouche ? email : suggere;

  const reset = () => {
    setNom("");
    setPrenom("");
    setEmail("");
    setEmailTouche(false);
    setMdp("");
    setRole("ouvrier");
  };

  const submit = () => {
    if (!nom.trim()) return toast.error("Le nom est obligatoire");
    if (!identifiant.includes("@")) return toast.error("Identifiant invalide");
    if (mdp.length < 8) return toast.error("Mot de passe : 8 caractères minimum");
    creer.mutate(
      { email: identifiant, mot_de_passe: mdp, nom: nom.trim(), prenom: prenom.trim(), role },
      {
        onSuccess: () => {
          toast.success(`Compte créé pour ${prenom} ${nom}`.trim(), {
            description: `Identifiant : ${identifiant} — transmets-lui ce mot de passe.`,
            duration: 10000,
          });
          reset();
          onOpenChange(false);
        },
        onError: (e) => toast.error("Création impossible : " + (e as Error).message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Nouveau compte
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prénom</Label>
              <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Nom</Label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
          </div>
          <div>
            <Label>Identifiant de connexion</Label>
            <Input
              value={identifiant}
              onChange={(e) => {
                setEmailTouche(true);
                setEmail(e.target.value);
              }}
              placeholder="prenom.nom@chantier.local"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Proposé automatiquement. Remplace-le par l'e-mail professionnel si l'employé en a un.
            </p>
          </div>
          <div>
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as ProfileRow["role"])}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {ROLES_OPTIONS.find((r) => r.value === role)?.aide}
            </p>
          </div>
          <div>
            <Label>Mot de passe</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
                placeholder="8 caractères minimum"
              />
              <Button type="button" variant="outline" onClick={() => setMdp(motDePasseAleatoire())}>
                Générer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              À transmettre à l'employé — il pourra le garder tel quel.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={creer.isPending}>
            {creer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Créer le compte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MotDePasseDialog({ profil, onClose }: { profil: ProfileRow | null; onClose: () => void }) {
  const reinit = useReinitialiserMotDePasse();
  const [mdp, setMdp] = useState("");
  if (!profil) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          setMdp("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Mot de passe de {profil.prenom} {profil.nom}
          </DialogTitle>
        </DialogHeader>
        <div>
          <Label>Nouveau mot de passe</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={mdp}
              onChange={(e) => setMdp(e.target.value)}
              placeholder="8 caractères minimum"
              autoFocus
            />
            <Button type="button" variant="outline" onClick={() => setMdp(motDePasseAleatoire())}>
              Générer
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            L'ancien mot de passe cesse immédiatement de fonctionner. Transmets le nouveau à
            l'employé.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setMdp("");
              onClose();
            }}
          >
            Annuler
          </Button>
          <Button
            disabled={reinit.isPending}
            onClick={() => {
              if (mdp.length < 8) return toast.error("8 caractères minimum");
              reinit.mutate(
                { id: profil.id, mot_de_passe: mdp },
                {
                  onSuccess: () => {
                    toast.success("Mot de passe modifié", {
                      description: `Nouveau mot de passe : ${mdp}`,
                      duration: 10000,
                    });
                    setMdp("");
                    onClose();
                  },
                  onError: (e) => toast.error("Échec : " + (e as Error).message),
                },
              );
            }}
          >
            {reinit.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Mot de passe lisible et solide (sans caractères ambigus type l/1/O/0).
function motDePasseAleatoire(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz";
  const num = "23456789";
  const pool = abc + abc.toUpperCase() + num;
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => pool[n % pool.length]).join("");
}

// Taux horaires individuels par employé (ouvriers + conducteurs actifs).
function TauxParEmployeCard() {
  const { data: profils = [], isLoading } = useProfilesActifs();
  const { data: params } = useParametres();
  const defaut = paramNumber(params, "taux_horaire_defaut", 70);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taux horaires par employé</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : profils.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Aucun employé actif.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2">Nom</th>
                  <th className="text-left px-3 py-2">Prénom</th>
                  <th className="text-left px-3 py-2 w-28">Rôle</th>
                  <th className="text-right px-3 py-2 w-44">Taux horaire</th>
                  <th className="px-3 py-2 w-48"></th>
                </tr>
              </thead>
              <tbody>
                {profils.map((p) => (
                  <TauxEmployeRow key={p.id} p={p} defaut={defaut} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground italic px-3 py-3">
          Sans taux individuel, le taux par défaut ({formatEUR(defaut)}/h) s'applique
          automatiquement au calcul de marge.
        </p>
      </CardContent>
    </Card>
  );
}

function TauxEmployeRow({ p, defaut }: { p: ProfileTaux; defaut: number }) {
  const update = useUpdateTauxHoraire();
  const [val, setVal] = useState(p.taux_horaire != null ? String(p.taux_horaire) : "");
  const vide = val.trim() === "";

  const save = () => {
    const taux = vide ? null : Number(val);
    if (taux != null && (!Number.isFinite(taux) || taux < 0)) {
      toast.error("Taux invalide");
      return;
    }
    update.mutate(
      { id: p.id, taux_horaire: taux },
      {
        onSuccess: () => toast.success(`Taux de ${`${p.prenom ?? ""} ${p.nom}`.trim()} enregistré`),
        onError: (e) => toast.error("Échec : " + (e as Error).message),
      },
    );
  };
  const reinitialiser = () => {
    update.mutate(
      { id: p.id, taux_horaire: null },
      {
        onSuccess: () => {
          setVal("");
          toast.success(`Taux de ${p.nom} réinitialisé au défaut`);
        },
        onError: (e) => toast.error("Échec : " + (e as Error).message),
      },
    );
  };

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-3 py-2 font-medium">{p.nom}</td>
      <td className="px-3 py-2">{p.prenom ?? "—"}</td>
      <td className="px-3 py-2">
        <Badge variant="outline">{ROLE_LABEL[p.role] ?? p.role}</Badge>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            step="0.5"
            min="0"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={`${defaut} (taux par défaut)`}
            className="w-36 text-right num-tabular h-9"
          />
          <span className="text-xs text-muted-foreground">€/h</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Enregistrer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={reinitialiser}
            disabled={update.isPending || (p.taux_horaire == null && vide)}
            title="Réinitialiser au taux par défaut"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
