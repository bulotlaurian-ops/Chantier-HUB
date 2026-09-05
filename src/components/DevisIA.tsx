import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Mic, Square, Loader2, Trash2, Sparkles, Keyboard, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatEUR } from "@/lib/format";
import type { Tables } from "@/lib/database.types";
import {
  startRecording,
  callDevisIA,
  messageErreurIA,
  DevisIAError,
  type Recorder,
  type DevisIAContexte,
  type LigneProposee,
  type OperationPatch,
  type Confiance,
  type Candidat,
} from "@/lib/devis-ia";
import {
  ligneDepuisPrestation,
  ligneLibre,
  prixVentePourCategorie,
  useAjouterPrestationBiblio,
  type Prestation,
  type LigneDevisChamps,
} from "@/lib/queries/prestations";

const MAX_SECONDS = 300; // cap d'enregistrement 5 min
type Unite = Tables<"prestations">["unite"];
const UNITES: Unite[] = ["m2", "ml", "pce", "u", "fft", "h"];

// Opération résolue (après levée d'ambiguïté) remontée au parent qui mute ses lignes.
export type OpResolue =
  | { kind: "add"; champs: LigneDevisChamps }
  | {
      kind: "modify";
      id: string;
      champs: {
        quantite?: number;
        unite?: string | null;
        designation?: string;
        est_option?: boolean;
      };
    }
  | { kind: "delete"; id: string };

interface DevisIAProps {
  mode: "creation" | "edition";
  contexte: DevisIAContexte;
  prestations: Prestation[];
  categorieId: string | null;
  tvaCourants: Record<string, number> | undefined;
  tauxStandard: number;
  pret: boolean; // entité + client choisis
  onInserer: (champs: LigneDevisChamps[]) => void; // création
  onAppliquer: (ops: OpResolue[]) => void; // édition
}

interface PreviewLigne {
  uid: number;
  type: "titre" | "prestation";
  designation: string;
  prestation_id: string | null;
  candidats: Candidat[];
  unite: string | null;
  quantite: number;
  est_option: boolean;
  confiance?: Confiance;
  prixManuel: number;
}

function BadgeConfiance({ c }: { c?: Confiance }) {
  if (!c) return null;
  const cls =
    c === "haute"
      ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40"
      : c === "moyenne"
        ? "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40"
        : "border-border text-muted-foreground bg-muted/50";
  return (
    <Badge variant="outline" className={`${cls} text-[10px]`}>
      {c}
    </Badge>
  );
}

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function DevisIA(props: DevisIAProps) {
  const {
    mode,
    contexte,
    prestations,
    categorieId,
    tvaCourants,
    tauxStandard,
    pret,
    onInserer,
    onAppliquer,
  } = props;
  const [phase, setPhase] = useState<"idle" | "recording" | "loading">("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<Recorder | null>(null);
  const [showText, setShowText] = useState(false);
  const [texte, setTexte] = useState("");

  const [creation, setCreation] = useState<{
    transcription: string | null;
    avert: string[];
    lignes: PreviewLigne[];
  } | null>(null);
  const [edition, setEdition] = useState<{
    transcription: string | null;
    avert: string[];
    ops: OperationPatch[];
    resolved: Record<number, string>;
  } | null>(null);

  // Ajout direct en bibliothèque (valide+actif) des lignes hors biblio.
  const ajouter = useAjouterPrestationBiblio();
  const [proposees, setProposees] = useState<Set<number>>(new Set());
  const [proposeForm, setProposeForm] = useState<{
    uid: number;
    designation: string;
    unite: Unite;
    prix: number;
  } | null>(null);
  const submitPropose = async () => {
    if (!proposeForm) return;
    if (!proposeForm.designation.trim()) {
      toast.error("Désignation requise");
      return;
    }
    try {
      await ajouter.mutateAsync({
        libelle: proposeForm.designation.trim(),
        unite: proposeForm.unite,
        prix_vente_reference: proposeForm.prix || 0,
        entite_code: contexte.entite_code,
      });
      setProposees((s) => new Set(s).add(proposeForm.uid));
      setProposeForm(null);
      toast.success("Prestation ajoutée à la bibliothèque");
    } catch (e) {
      toast.error("Ajout impossible : " + (e as Error).message);
    }
  };

  // Timer + cap 300 s.
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === "recording" && seconds >= MAX_SECONDS) void stopAndCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, phase]);

  const start = async () => {
    try {
      recRef.current = await startRecording();
      setSeconds(0);
      setPhase("recording");
    } catch {
      toast.error("Micro inaccessible. Autorise l'accès ou saisis en texte.");
      setShowText(true);
    }
  };

  const run = async (args: { inputType: "audio" | "texte"; audioBlob?: Blob; texte?: string }) => {
    try {
      const res = await callDevisIA({
        mode,
        inputType: args.inputType,
        audioBlob: args.audioBlob,
        texte: args.texte,
        contexte,
      });
      if (res.mode === "creation") {
        setCreation({
          transcription: res.transcription,
          avert: res.avertissements ?? [],
          lignes: res.lignes.map((lp, i) => ({
            uid: i,
            type: lp.type,
            designation: lp.designation,
            prestation_id: lp.prestation_id ?? null,
            candidats: lp.candidats ?? [],
            unite: lp.unite ?? null,
            quantite: lp.quantite ?? 1,
            est_option: !!lp.est_option,
            confiance: lp.confiance,
            prixManuel: 0,
          })),
        });
      } else {
        setEdition({
          transcription: res.transcription,
          avert: res.avertissements ?? [],
          ops: res.operations ?? [],
          resolved: {},
        });
      }
      setPhase("idle");
      setShowText(false);
      setTexte("");
    } catch (e) {
      const code = e instanceof DevisIAError ? e.code : "inconnue";
      toast.error(messageErreurIA(code), { description: "Tu peux poursuivre en saisie manuelle." });
      setPhase("idle");
    }
  };

  const stopAndCall = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    const blob = await rec.stop();
    setPhase("loading");
    await run({ inputType: "audio", audioBlob: blob });
  };
  const cancel = () => {
    recRef.current?.cancel();
    recRef.current = null;
    setPhase("idle");
    setSeconds(0);
  };
  const envoyerTexte = async () => {
    if (!texte.trim()) {
      toast.error("Décris la prestation.");
      return;
    }
    setPhase("loading");
    await run({ inputType: "texte", texte });
  };

  // Construit une ligne de devis à partir d'une proposée — MÊME résolution de prix que le manuel.
  const proposeeVersChamps = (
    lp: LigneProposee,
    prestationId: string | null,
    prixManuel: number,
  ): LigneDevisChamps => {
    if (lp.type === "titre")
      return ligneLibre(lp.designation, null, 1, tauxStandard, { est_titre: true });
    const p = prestationId ? prestations.find((x) => x.id === prestationId) : undefined;
    if (p) {
      const base = ligneDepuisPrestation(p, categorieId, tvaCourants, tauxStandard, {
        quantite: lp.quantite ?? 1,
        est_option: !!lp.est_option,
      });
      return { ...base, libelle: lp.designation || base.libelle, unite: lp.unite ?? base.unite };
    }
    const libre = ligneLibre(lp.designation, lp.unite ?? null, lp.quantite ?? 1, tauxStandard, {
      est_option: !!lp.est_option,
    });
    return { ...libre, prix_unitaire_ht: prixManuel || 0 };
  };

  // ----- Création : insertion -----
  const setPv = (uid: number, patch: Partial<PreviewLigne>) =>
    setCreation(
      (c) => c && { ...c, lignes: c.lignes.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) },
    );
  const supprimerPv = (uid: number) =>
    setCreation((c) => c && { ...c, lignes: c.lignes.filter((l) => l.uid !== uid) });

  const prixResolu = (pl: PreviewLigne): number | null => {
    if (pl.type === "titre") return null;
    if (!pl.prestation_id) return null;
    const p = prestations.find((x) => x.id === pl.prestation_id);
    return p ? prixVentePourCategorie(p, categorieId) : null;
  };

  const inserer = () => {
    if (!creation) return;
    const champs = creation.lignes.map((pl) =>
      proposeeVersChamps(
        {
          type: pl.type,
          designation: pl.designation,
          prestation_id: pl.prestation_id,
          unite: pl.unite,
          quantite: pl.quantite,
          est_option: pl.est_option,
        },
        pl.prestation_id,
        pl.prixManuel,
      ),
    );
    onInserer(champs);
    setCreation(null);
    toast.success(
      `${champs.length} ligne${champs.length > 1 ? "s" : ""} insérée${champs.length > 1 ? "s" : ""} dans le devis`,
    );
  };

  // ----- Édition : application -----
  const curLigne = (id: string) => contexte.devis_courant?.lignes.find((l) => l.id === id);
  const ambiguNonResolues =
    edition?.ops.some((op, i) => op.op === "ambigu" && !edition.resolved[i]) ?? false;

  const appliquer = () => {
    if (!edition) return;
    const ops: OpResolue[] = [];
    edition.ops.forEach((op, i) => {
      const concrete: OperationPatch =
        op.op === "ambigu"
          ? ({ ...op.operation_en_attente, ligne_id: edition.resolved[i] } as OperationPatch)
          : op;
      if (concrete.op === "ajouter_ligne")
        ops.push({
          kind: "add",
          champs: proposeeVersChamps(concrete.ligne, concrete.ligne.prestation_id ?? null, 0),
        });
      else if (concrete.op === "modifier_ligne")
        ops.push({ kind: "modify", id: concrete.ligne_id, champs: concrete.champs });
      else if (concrete.op === "supprimer_ligne")
        ops.push({ kind: "delete", id: concrete.ligne_id });
    });
    onAppliquer(ops);
    setEdition(null);
    toast.success(
      `${ops.length} modification${ops.length > 1 ? "s" : ""} appliquée${ops.length > 1 ? "s" : ""}`,
    );
  };

  // =========================== RENDER ===========================
  return (
    <>
      {/* Bouton micro central — fonctionnalité principale */}
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {phase === "recording" ? (
          <>
            <button
              onClick={stopAndCall}
              aria-label="Arrêter l'enregistrement"
              className="relative flex h-24 w-24 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition hover:bg-destructive/90"
            >
              <span className="absolute inset-0 rounded-full bg-destructive/40 animate-ping" />
              <Square className="relative h-9 w-9 fill-current" />
            </button>
            <div>
              <div className="text-sm font-medium text-destructive">Enregistrement en cours…</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                <span className="num-tabular font-medium text-foreground">{mmss(seconds)}</span> /{" "}
                {mmss(MAX_SECONDS)}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={cancel}>
              <X className="w-4 h-4 mr-1" />
              Annuler
            </Button>
          </>
        ) : phase === "loading" ? (
          <>
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Loader2 className="h-9 w-9 animate-spin" />
            </div>
            <div className="text-sm text-muted-foreground">Analyse en cours…</div>
          </>
        ) : (
          <>
            <button
              onClick={start}
              disabled={!pret}
              aria-label={mode === "edition" ? "Modifier le devis à la voix" : "Dicter le devis"}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mic className="h-10 w-10" />
            </button>
            <div className="text-sm font-medium inline-flex items-center gap-1.5">
              {mode === "edition" ? "Modifier à la voix" : "Dicter le devis"}
              <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground">
                <Sparkles className="w-3 h-3" />
                IA
              </span>
            </div>
            {pret ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setShowText((v) => !v)}
              >
                <Keyboard className="w-4 h-4 mr-1" />
                ou saisir en texte
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground max-w-xs">
                Veuillez d'abord sélectionner une entité et un client pour dicter votre devis.
              </p>
            )}
          </>
        )}
      </div>

      {showText && phase === "idle" && pret && (
        <div className="mt-2 flex items-start gap-2">
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={2}
            className="flex-1"
            placeholder={
              mode === "edition"
                ? "Ex : passe la dépose à 15 m2 et ajoute une évacuation des gravats."
                : "Ex : salle de bain — dépose de 12 m2 de carrelage, pose faïence, évacuation."
            }
          />
          <Button onClick={envoyerTexte} className="shrink-0">
            Analyser
          </Button>
        </div>
      )}

      {/* ---------- Dialog CRÉATION (preview) ---------- */}
      <Dialog open={!!creation} onOpenChange={(o) => !o && setCreation(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Lignes proposées
            </DialogTitle>
          </DialogHeader>
          {creation && (
            <div className="space-y-3">
              {creation.transcription && (
                <div className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 break-words">
                  « {creation.transcription} »
                </div>
              )}
              {creation.avert.map((a, i) => (
                <div
                  key={i}
                  className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1 break-words"
                >
                  {a}
                </div>
              ))}
              {creation.lignes.length === 0 && (
                <div className="text-sm text-muted-foreground">Aucune ligne proposée.</div>
              )}

              <div className="space-y-2">
                {creation.lignes.map((pl) => {
                  const resolu = prixResolu(pl);
                  const horsBiblio = pl.type === "prestation" && !pl.prestation_id;
                  return (
                    <div key={pl.uid} className="rounded-md border p-2.5">
                      <div className="flex flex-col md:flex-row items-start gap-2">
                        <div className="w-full md:w-auto md:flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {pl.type === "titre" && (
                              <Badge variant="outline" className="text-[10px]">
                                titre
                              </Badge>
                            )}
                            <BadgeConfiance c={pl.confiance} />
                            {horsBiblio &&
                              (proposees.has(pl.uid) ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40 text-[10px]"
                                >
                                  ajoutée
                                </Badge>
                              ) : (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="border-border text-muted-foreground text-[10px]"
                                  >
                                    hors biblio
                                  </Badge>
                                  <button
                                    onClick={() =>
                                      setProposeForm({
                                        uid: pl.uid,
                                        designation: pl.designation,
                                        unite: (pl.unite as Unite) ?? "u",
                                        prix: pl.prixManuel,
                                      })
                                    }
                                    className="text-[10px] text-accent hover:underline inline-flex items-center gap-0.5"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    Biblio
                                  </button>
                                </>
                              ))}
                            {pl.est_option && (
                              <Badge variant="outline" className="text-[10px]">
                                option
                              </Badge>
                            )}
                            <button
                              onClick={() => supprimerPv(pl.uid)}
                              className="md:hidden ml-auto text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <Input
                            value={pl.designation}
                            onChange={(e) => setPv(pl.uid, { designation: e.target.value })}
                            className="h-8 text-sm w-full"
                          />
                          {/* Sélecteur de référence si candidats */}
                          {pl.type === "prestation" && pl.candidats.length > 0 && (
                            <Select
                              value={pl.prestation_id ?? "none"}
                              onValueChange={(v) =>
                                setPv(pl.uid, { prestation_id: v === "none" ? null : v })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Choisir la référence" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— hors bibliothèque —</SelectItem>
                                {pl.candidats.map((c) => (
                                  <SelectItem key={c.prestation_id} value={c.prestation_id}>
                                    {c.libelle}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {pl.type === "prestation" && (
                          <div className="w-full min-w-0 grid grid-cols-3 gap-2 md:w-auto md:flex md:items-center md:shrink-0">
                            <div className="min-w-0 md:w-16">
                              <div className="text-[10px] text-muted-foreground text-center">
                                Qté
                              </div>
                              <Input
                                type="number"
                                step="0.01"
                                value={pl.quantite}
                                onChange={(e) =>
                                  setPv(pl.uid, { quantite: Number(e.target.value) })
                                }
                                className="h-8 text-right text-sm"
                              />
                            </div>
                            <div className="min-w-0 md:w-12 text-center">
                              <div className="text-[10px] text-muted-foreground">Unité</div>
                              <div className="text-sm py-1.5">{pl.unite ?? "—"}</div>
                            </div>
                            <div className="min-w-0 md:w-24">
                              <div className="text-[10px] text-muted-foreground text-center">
                                PU HT
                              </div>
                              {resolu != null ? (
                                <div
                                  className="text-sm text-right py-1.5 num-tabular"
                                  title="Résolu via le tarif de la catégorie du client"
                                >
                                  {formatEUR(resolu)}
                                </div>
                              ) : (
                                <Input
                                  type="number"
                                  step="0.05"
                                  value={pl.prixManuel}
                                  onChange={(e) =>
                                    setPv(pl.uid, { prixManuel: Number(e.target.value) })
                                  }
                                  className="h-8 text-right text-sm"
                                  placeholder="à saisir"
                                />
                              )}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => supprimerPv(pl.uid)}
                          className="hidden md:block text-muted-foreground hover:text-destructive mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreation(null)}>
              Annuler
            </Button>
            <Button onClick={inserer} disabled={!creation || creation.lignes.length === 0}>
              Insérer dans le devis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog ÉDITION (diff) ---------- */}
      <Dialog open={!!edition} onOpenChange={(o) => !o && setEdition(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Modifications proposées
            </DialogTitle>
          </DialogHeader>
          {edition && (
            <div className="space-y-2">
              {edition.transcription && (
                <div className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 break-words">
                  « {edition.transcription} »
                </div>
              )}
              {edition.avert.map((a, i) => (
                <div
                  key={i}
                  className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1 break-words"
                >
                  {a}
                </div>
              ))}
              {edition.ops.length === 0 && (
                <div className="text-sm text-muted-foreground">Aucune opération.</div>
              )}

              {edition.ops.map((op, i) => {
                if (op.op === "ajouter_ligne") {
                  return (
                    <div
                      key={i}
                      className="rounded border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2 text-sm"
                    >
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                        + Ajouter
                      </span>{" "}
                      {op.ligne.designation}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        {op.ligne.quantite ? `· ${op.ligne.quantite} ${op.ligne.unite ?? ""}` : ""}
                      </span>
                    </div>
                  );
                }
                if (op.op === "supprimer_ligne") {
                  const c = curLigne(op.ligne_id);
                  return (
                    <div
                      key={i}
                      className="rounded border-l-4 border-l-destructive bg-destructive/5 px-3 py-2 text-sm"
                    >
                      <span className="text-destructive font-medium">− Supprimer</span>{" "}
                      <span className="line-through">{c?.designation ?? op.ligne_id}</span>
                    </div>
                  );
                }
                if (op.op === "modifier_ligne") {
                  const c = curLigne(op.ligne_id);
                  const ch = op.champs;
                  return (
                    <div
                      key={i}
                      className="rounded border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-2 text-sm"
                    >
                      <span className="text-amber-700 dark:text-amber-300 font-medium">
                        ~ Modifier
                      </span>{" "}
                      {c?.designation ?? op.ligne_id}
                      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                        {ch.designation != null && (
                          <div>
                            désignation : <span className="line-through">{c?.designation}</span> →{" "}
                            <span className="text-foreground">{ch.designation}</span>
                          </div>
                        )}
                        {ch.quantite != null && (
                          <div>
                            quantité : <span className="line-through">{c?.quantite}</span> →{" "}
                            <span className="text-foreground">{ch.quantite}</span>
                          </div>
                        )}
                        {ch.unite != null && (
                          <div>
                            unité : <span className="line-through">{c?.unite ?? "—"}</span> →{" "}
                            <span className="text-foreground">{ch.unite ?? "—"}</span>
                          </div>
                        )}
                        {ch.est_option != null && (
                          <div>
                            option : →{" "}
                            <span className="text-foreground">{ch.est_option ? "oui" : "non"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                // ambigu
                return (
                  <div
                    key={i}
                    className="rounded border-l-4 border-l-muted-foreground bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="font-medium">
                      {op.message || "Quelle ligne voulez-vous modifier ?"}
                    </div>
                    <Select
                      value={edition.resolved[i] ?? ""}
                      onValueChange={(v) =>
                        setEdition((e) => e && { ...e, resolved: { ...e.resolved, [i]: v } })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs mt-1.5">
                        <SelectValue placeholder="Choisir la ligne…" />
                      </SelectTrigger>
                      <SelectContent>
                        {op.candidats_ligne_ids.map((id) => (
                          <SelectItem key={id} value={id}>
                            {curLigne(id)?.designation ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdition(null)}>
              Annuler
            </Button>
            <Button
              onClick={appliquer}
              disabled={!edition || edition.ops.length === 0 || ambiguNonResolues}
            >
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog PROPOSER À LA BIBLIOTHÈQUE ---------- */}
      <Dialog open={!!proposeForm} onOpenChange={(o) => !o && setProposeForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Ajouter à la bibliothèque
            </DialogTitle>
          </DialogHeader>
          {proposeForm && (
            <div className="space-y-3">
              <div>
                <Label>Désignation</Label>
                <Input
                  value={proposeForm.designation}
                  onChange={(e) => setProposeForm({ ...proposeForm, designation: e.target.value })}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Unité</Label>
                  <Select
                    value={proposeForm.unite}
                    onValueChange={(v) => setProposeForm({ ...proposeForm, unite: v as Unite })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITES.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prix de vente réf. HT</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={proposeForm.prix}
                    onChange={(e) =>
                      setProposeForm({ ...proposeForm, prix: Number(e.target.value) })
                    }
                    className="mt-1 num-tabular"
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Ajoutée depuis{" "}
                <span className="font-medium text-foreground">{contexte.entite_code}</span>{" "}
                directement à la <span className="font-medium">bibliothèque commune</span> (active
                immédiatement, modifiable ensuite).
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeForm(null)}>
              Annuler
            </Button>
            <Button onClick={submitPropose} disabled={ajouter.isPending}>
              {ajouter.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
