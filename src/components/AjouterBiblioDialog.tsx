import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { usePrestationsOptions } from "@/lib/queries/prestations";
import { CfcCombo } from "@/components/CfcCombo";
import type { Tables } from "@/lib/database.types";

type Unite = Tables<"prestations">["unite"];
const UNITES: Unite[] = ["m2", "ml", "pce", "u", "fft", "h", "forfait"];
const AUCUNE_FAM = "__aucune_fam__";
const NOUVELLE_FAM = "__nouvelle_fam__";
const AUCUN_FOURN = "__aucun_fourn__";
const AUTRE_FOURN = "__autre_fourn__";

export interface AjoutBiblioDefaults {
  libelle: string;
  famille: string | null;
  prix_achat_net: number;
  unite: Unite;
  fournisseur: string | null;
  code_cfc?: string | null;
}

// Mini-modal « Ajouter à la bibliothèque ». INSERT direct (valide + actif),
// source='manuel', ON CONFLICT (libelle, source) DO NOTHING. RLS : prestations_conducteur_ajouter.
export function AjouterBiblioDialog({
  open,
  onOpenChange,
  defaults,
  entite,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults: AjoutBiblioDefaults | null;
  entite: string | null; // entité du devis courant — non éditable
}) {
  const qc = useQueryClient();
  const { data: options } = usePrestationsOptions();
  const fournisseurs = options?.fournisseurs ?? [];
  const familles = options?.familles ?? [];
  const cfcOptions = options?.cfc ?? [];

  const [libelle, setLibelle] = useState("");
  const [famille, setFamille] = useState("");
  const [familleAutre, setFamilleAutre] = useState(false);
  const [prix, setPrix] = useState(0);
  const [unite, setUnite] = useState<Unite>("u");
  const [fournisseur, setFournisseur] = useState("");
  const [fournisseurAutre, setFournisseurAutre] = useState(false);
  const [codeCfc, setCodeCfc] = useState("");
  const [codeCfcLibelle, setCodeCfcLibelle] = useState("");
  const [saving, setSaving] = useState(false);

  // (Ré)initialise le formulaire à l'ouverture / changement de ligne.
  useEffect(() => {
    if (!defaults) return;
    setLibelle(defaults.libelle);
    setFamille(defaults.famille ?? "");
    setFamilleAutre(false);
    setPrix(defaults.prix_achat_net);
    setUnite(defaults.unite);
    setFournisseur(defaults.fournisseur ?? "");
    setFournisseurAutre(false);
    setCodeCfc(defaults.code_cfc ?? "");
    setCodeCfcLibelle("");
  }, [defaults]);

  // Inclut la valeur courante dans les options même si absente de la liste fetchée.
  const famOpts = useMemo(
    () => [...new Set([...(famille ? [famille] : []), ...familles])],
    [famille, familles],
  );
  const fournOpts = useMemo(
    () => [...new Set([...(fournisseur ? [fournisseur] : []), ...fournisseurs])],
    [fournisseur, fournisseurs],
  );

  const famValue = familleAutre ? NOUVELLE_FAM : famille ? famille : AUCUNE_FAM;
  const fournValue = fournisseurAutre ? AUTRE_FOURN : fournisseur ? fournisseur : AUCUN_FOURN;

  const enregistrer = async () => {
    if (!libelle.trim()) {
      toast.error("Désignation requise");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const cfcLibelle =
        codeCfcLibelle.trim() || (cfcOptions.find((c) => c.code === codeCfc)?.libelle ?? null);
      const { data, error } = await supabase
        .from("prestations")
        .upsert(
          {
            libelle: libelle.trim(),
            famille: famille.trim() || null,
            prix_achat_net: prix || null,
            unite,
            fournisseur: fournisseur.trim() || null,
            code_cfc: codeCfc.trim() || null,
            code_cfc_libelle: codeCfc.trim() ? cfcLibelle : null,
            source: "manuel",
            statut_validation: "valide",
            actif: true,
            type_tva: "standard",
            created_by: user.id,
          },
          { onConflict: "libelle,source", ignoreDuplicates: true },
        )
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info("Prestation déjà existante"); // conflit (libelle, source) → DO NOTHING
      } else {
        toast.success("Prestation ajoutée à la bibliothèque");
        qc.invalidateQueries({ queryKey: ["prestations"] });
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Ajout impossible : " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!saving) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4" />
            Ajouter à la bibliothèque
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Désignation</Label>
            <Input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Famille (combo + nouvelle) */}
            <div>
              <Label>Famille</Label>
              <Select
                value={famValue}
                onValueChange={(v) => {
                  if (v === NOUVELLE_FAM) {
                    setFamilleAutre(true);
                    setFamille("");
                  } else if (v === AUCUNE_FAM) {
                    setFamilleAutre(false);
                    setFamille("");
                  } else {
                    setFamilleAutre(false);
                    setFamille(v);
                  }
                }}
              >
                <SelectTrigger className="mt-1">
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
              {familleAutre && (
                <Input
                  value={famille}
                  onChange={(e) => setFamille(e.target.value)}
                  placeholder="Nouvelle famille"
                  className="mt-1.5"
                  autoFocus
                />
              )}
            </div>

            {/* Unité */}
            <div>
              <Label>Unité</Label>
              <Select value={unite} onValueChange={(v) => setUnite(v as Unite)}>
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

            {/* Prix d'achat */}
            <div>
              <Label>Prix d'achat net HT</Label>
              <Input
                type="number"
                step="0.05"
                value={prix}
                onChange={(e) => setPrix(Number(e.target.value))}
                className="mt-1 num-tabular"
              />
            </div>

            {/* Fournisseur (combo + autre) */}
            <div>
              <Label>Fournisseur / Marque</Label>
              <Select
                value={fournValue}
                onValueChange={(v) => {
                  if (v === AUTRE_FOURN) {
                    setFournisseurAutre(true);
                    setFournisseur("");
                  } else if (v === AUCUN_FOURN) {
                    setFournisseurAutre(false);
                    setFournisseur("");
                  } else {
                    setFournisseurAutre(false);
                    setFournisseur(v);
                  }
                }}
              >
                <SelectTrigger className="mt-1">
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
              {fournisseurAutre && (
                <Input
                  value={fournisseur}
                  onChange={(e) => setFournisseur(e.target.value)}
                  placeholder="Nouveau fournisseur"
                  className="mt-1.5"
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Code CFC (optionnel) */}
          <div>
            <Label>
              Code CFC <span className="text-muted-foreground font-normal">(optionnel)</span>
            </Label>
            <CfcCombo
              code={codeCfc}
              libelle={codeCfcLibelle}
              options={cfcOptions}
              onChange={(c, l) => {
                setCodeCfc(c);
                setCodeCfcLibelle(l);
              }}
            />
          </div>

          <div>
            <Label className="text-muted-foreground">Entité</Label>
            <Input value={entite ?? "—"} disabled className="mt-1" />
          </div>
          <div className="text-xs text-muted-foreground">
            Ajoutée directement à la <span className="font-medium">bibliothèque commune</span>{" "}
            (active immédiatement, modifiable ensuite).
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={enregistrer} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
