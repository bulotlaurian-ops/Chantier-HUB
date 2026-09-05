import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Library, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  callOcrDevisST,
  DevisIAError,
  messageErreurIA,
  type DevisIAContexte,
} from "@/lib/devis-ia";
import { DropZone } from "@/components/DropZone";
import { SelecteurFeuilles } from "@/components/SelecteurFeuilles";
import { useEntites } from "@/lib/queries/entites";
import { usePrestationsOptions } from "@/lib/queries/prestations";
import type { Tables } from "@/lib/database.types";
import {
  detecterType,
  fichierVersBase64,
  normUnite,
  ouvrirExcel,
  versCandidatsBiblio,
  type CandidatBiblio,
  type ClasseurExcel,
} from "@/lib/import-fichier";

const MAX_BYTES = 20 * 1024 * 1024;
type Unite = Tables<"prestations">["unite"];
const UNITES: Unite[] = ["m2", "ml", "pce", "u", "fft", "h", "forfait"];
const AUCUNE_FAM = "__aucune_fam__";
const NOUVELLE_FAM = "__nouvelle_fam__";
const AUCUN_FOURN = "__aucun_fourn__";
const AUTRE_FOURN = "__autre_fourn__";

interface Candidat extends CandidatBiblio {
  uid: number;
  sel: boolean;
  familleLibre?: boolean;
  fournisseur?: string | null;
  fournisseurLibre?: boolean;
}

// Enrichissement de la bibliothèque depuis un fichier fournisseur (PDF OCR ou Excel).
export function BiblioImport() {
  const qc = useQueryClient();
  const { data: entites = [] } = useEntites();
  const { data: options } = usePrestationsOptions();
  const familles = options?.familles ?? [];
  const fournisseurs = options?.fournisseurs ?? [];
  // Contexte OCR valide (n8n exige entite_code + client.nom non vides). Ces champs ne
  // servent qu'au biais biblio côté LLM — ignoré ici, on récupère les lignes brutes.
  const ctxBiblio: DevisIAContexte = {
    entite_code: entites[0]?.code ?? "PRO",
    client: { id: "", nom: "Bibliothèque", categorie_tarifaire: null },
  };
  const uidRef = useState(() => ({ n: 1 }))[0];
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classeur, setClasseur] = useState<ClasseurExcel | null>(null);
  const [candidats, setCandidats] = useState<Candidat[] | null>(null);

  const onFile = (f: File) => {
    const type = detecterType(f);
    if (type === "excel") {
      void traiterExcel(f);
      return;
    }
    if (type !== "pdf") {
      toast.error("Format non supporté — PDF ou Excel uniquement.");
      return;
    }
    void traiterPdf(f);
  };

  const traiterPdf = async (f: File) => {
    if (f.size > MAX_BYTES) {
      toast.error("Fichier trop volumineux (max 20 Mo).");
      return;
    }
    setLoading(true);
    try {
      const b64 = await fichierVersBase64(f);
      const res = await callOcrDevisST({
        fichierBase64: b64,
        mimeType: f.type || "application/pdf",
        contexte: ctxBiblio,
      });
      ouvrirPreview(
        res.lignes.map((l) => ({
          libelle: l.designation,
          prix_achat_net: Number(l.prix_unitaire) || null,
          unite: l.unite || null,
          famille: null,
        })),
        res.fournisseur,
      );
    } catch (e) {
      const code = e instanceof DevisIAError ? e.code : "inconnue";
      toast.error(messageErreurIA(code));
    } finally {
      setLoading(false);
    }
  };

  const traiterExcel = async (f: File) => {
    try {
      const cl = await ouvrirExcel(f);
      if (cl.feuilles.length <= 1)
        ouvrirPreview(versCandidatsBiblio(cl.parseFeuilles(cl.feuilles)));
      else setClasseur(cl);
    } catch (e) {
      toast.error("Lecture Excel impossible : " + (e as Error).message);
    }
  };

  const ouvrirPreview = (rows: CandidatBiblio[], fournisseurDefaut?: string | null) => {
    const items = rows.filter((r) => r.libelle.trim());
    if (items.length === 0) {
      toast.error("Aucune prestation exploitable dans ce fichier.");
      return;
    }
    setCandidats(
      items.map((r) => ({
        ...r,
        uid: uidRef.n++,
        sel: true,
        fournisseur: fournisseurDefaut ?? null,
      })),
    );
  };

  const toggle = (uid: number) =>
    setCandidats((c) => c && c.map((x) => (x.uid === uid ? { ...x, sel: !x.sel } : x)));
  const patch = (uid: number, p: Partial<Candidat>) =>
    setCandidats((c) => c && c.map((x) => (x.uid === uid ? { ...x, ...p } : x)));
  const removeRow = (uid: number) => setCandidats((c) => c && c.filter((x) => x.uid !== uid));
  const ajouterLigne = () =>
    setCandidats((c) => [
      ...(c ?? []),
      {
        uid: uidRef.n++,
        sel: true,
        libelle: "",
        prix_achat_net: null,
        unite: null,
        famille: null,
        fournisseur: null,
      },
    ]);
  const nbSel = candidats?.filter((c) => c.sel).length ?? 0;
  const toutSel = !!candidats && candidats.length > 0 && nbSel === candidats.length;
  const toggleTout = () => setCandidats((c) => c && c.map((x) => ({ ...x, sel: !toutSel })));

  const enregistrer = async () => {
    const choisis = (candidats ?? []).filter((c) => c.sel && c.libelle.trim());
    if (choisis.length === 0) {
      toast.error("Sélectionnez au moins une prestation avec un libellé.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const rows = choisis.map((c) => ({
        libelle: c.libelle.trim(),
        famille: c.famille?.trim() || null,
        fournisseur: c.fournisseur?.trim() || null,
        prix_achat_net: c.prix_achat_net,
        unite: normUnite(c.unite),
        source: "import:fichier",
        statut_validation: "valide" as const,
        actif: true,
        type_tva: "standard" as const,
        created_by: user.id,
      }));
      const { data, error } = await supabase
        .from("prestations")
        .upsert(rows, { onConflict: "libelle,source", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      const ajoutees = data?.length ?? 0;
      const ignorees = choisis.length - ajoutees;
      toast.success(
        `${ajoutees} prestation${ajoutees > 1 ? "s" : ""} ajoutée${ajoutees > 1 ? "s" : ""} à la bibliothèque` +
          (ignorees > 0 ? ` · ${ignorees} déjà existante${ignorees > 1 ? "s" : ""}` : ""),
      );
      qc.invalidateQueries({ queryKey: ["prestations"] });
      setCandidats(null);
    } catch (e) {
      toast.error("Ajout impossible : " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-accent/30 bg-muted/30 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Library className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Enrichir la bibliothèque</h3>
        <span className="text-[11px] text-muted-foreground">
          depuis un devis fournisseur PDF ou Excel
        </span>
      </div>
      <DropZone
        accept=".pdf,.xlsx,.xls"
        hint="Glissez un devis PDF ou Excel fournisseur"
        onFile={onFile}
        loading={loading}
        loadingText="Analyse du document en cours…"
      />

      <SelecteurFeuilles
        open={!!classeur}
        feuilles={classeur?.feuilles ?? []}
        onConfirm={(noms) => {
          const cl = classeur;
          setClasseur(null);
          if (cl) ouvrirPreview(versCandidatsBiblio(cl.parseFeuilles(noms)));
        }}
        onCancel={() => setClasseur(null)}
      />

      <Dialog
        open={!!candidats}
        onOpenChange={(o) => {
          if (!o && !saving) setCandidats(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="w-4 h-4 text-accent" />
              Prestations détectées — à valider avant import
            </DialogTitle>
          </DialogHeader>
          {candidats && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {candidats.length} prestation{candidats.length > 1 ? "s" : ""} détectée
                  {candidats.length > 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleTout}>
                    {toutSel ? "Tout désélectionner" : "Tout sélectionner"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={ajouterLigne}>
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter une ligne
                  </Button>
                </div>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm min-w-[40rem]">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2">
                        <Checkbox checked={toutSel} onCheckedChange={toggleTout} />
                      </th>
                      <th className="text-left px-2 py-2">Libellé</th>
                      <th className="text-left px-2 py-2 w-40">Famille</th>
                      <th className="text-left px-2 py-2 w-40">Fournisseur</th>
                      <th className="text-right px-2 py-2 w-28">Prix achat HT</th>
                      <th className="text-left px-2 py-2 w-20">Unité</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidats.map((c) => {
                      const famOpts = [
                        ...new Set([...(c.famille ? [c.famille] : []), ...familles]),
                      ];
                      const fournOpts = [
                        ...new Set([...(c.fournisseur ? [c.fournisseur] : []), ...fournisseurs]),
                      ];
                      return (
                        <tr key={c.uid} className="border-t">
                          <td className="px-2 py-1.5 align-top pt-3">
                            <Checkbox checked={c.sel} onCheckedChange={() => toggle(c.uid)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={c.libelle}
                              onChange={(e) => patch(c.uid, { libelle: e.target.value })}
                              placeholder="Désignation"
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {c.familleLibre ? (
                              <Input
                                value={c.famille ?? ""}
                                onChange={(e) => patch(c.uid, { famille: e.target.value })}
                                placeholder="Nouvelle famille"
                                className="h-8 text-sm"
                              />
                            ) : (
                              <Select
                                value={c.famille ?? AUCUNE_FAM}
                                onValueChange={(v) => {
                                  if (v === NOUVELLE_FAM)
                                    patch(c.uid, { familleLibre: true, famille: "" });
                                  else patch(c.uid, { famille: v === AUCUNE_FAM ? null : v });
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={AUCUNE_FAM}>— aucune —</SelectItem>
                                  {famOpts.map((f) => (
                                    <SelectItem key={f} value={f}>
                                      {f}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value={NOUVELLE_FAM}>+ Nouvelle famille</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {c.fournisseurLibre ? (
                              <Input
                                value={c.fournisseur ?? ""}
                                onChange={(e) => patch(c.uid, { fournisseur: e.target.value })}
                                placeholder="Fournisseur"
                                className="h-8 text-sm"
                              />
                            ) : (
                              <Select
                                value={c.fournisseur ?? AUCUN_FOURN}
                                onValueChange={(v) => {
                                  if (v === AUTRE_FOURN)
                                    patch(c.uid, { fournisseurLibre: true, fournisseur: "" });
                                  else patch(c.uid, { fournisseur: v === AUCUN_FOURN ? null : v });
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={AUCUN_FOURN}>— aucun —</SelectItem>
                                  {fournOpts.map((f) => (
                                    <SelectItem key={f} value={f}>
                                      {f}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value={AUTRE_FOURN}>Autre…</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              step="0.05"
                              value={c.prix_achat_net ?? ""}
                              onChange={(e) =>
                                patch(c.uid, {
                                  prix_achat_net:
                                    e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              className="h-8 text-right text-sm num-tabular"
                              placeholder="—"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select
                              value={normUnite(c.unite)}
                              onValueChange={(v) => patch(c.uid, { unite: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
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
                          </td>
                          <td className="px-2 py-1.5 text-right align-top pt-3">
                            <button
                              onClick={() => removeRow(c.uid)}
                              className="text-muted-foreground hover:text-destructive"
                              title="Retirer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {candidats.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-2 py-6 text-center text-muted-foreground text-sm"
                        >
                          Aucune ligne. Ajoutez-en une.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground num-tabular">
                  {nbSel} / {candidats.length}
                </span>{" "}
                sélectionnée{nbSel > 1 ? "s" : ""}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidats(null)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={enregistrer} disabled={saving || nbSel === 0}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer dans la bibliothèque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
