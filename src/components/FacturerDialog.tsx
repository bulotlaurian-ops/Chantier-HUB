import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIE_OPERATION_DEFAUT,
  CATEGORIE_OPERATION_LABEL,
  formatSiren,
  type CategorieOperation,
} from "@/lib/facturation-electronique";
import type { DevisDetail } from "@/lib/queries/devis";
import { adresseChantierDistincte, type OptionsFacture } from "@/lib/queries/factures";

// Confirmation avant émission : une facture émise est figée (036/038), donc les
// mentions de la réforme facture électronique se choisissent ici, une seule fois.
export function FacturerDialog({
  devis,
  trigger,
  pending,
  onConfirm,
}: {
  devis: DevisDetail;
  trigger: ReactNode;
  pending: boolean;
  onConfirm: (options: OptionsFacture) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [categorie, setCategorie] = useState<CategorieOperation>(CATEGORIE_OPERATION_DEFAUT);
  const [autoliquidation, setAutoliquidation] = useState(false);
  const client = devis.client;
  const estPro = client?.type_client === "professionnel";
  const adresseChantier = adresseChantierDistincte(devis);

  const valider = async () => {
    await onConfirm({ categorie_operation: categorie, autoliquidation: estPro && autoliquidation });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCategorie(CATEGORIE_OPERATION_DEFAUT);
          setAutoliquidation(false);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Émettre la facture</DialogTitle>
          <DialogDescription>
            Une facture émise ne peut plus être modifiée. Vérifie les mentions ci-dessous.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{client?.nom}</div>
            {estPro ? (
              <div className="text-xs text-muted-foreground mt-1">
                Client professionnel
                {client?.siren && ` · SIREN ${formatSiren(client.siren)}`}. À partir du 1er
                septembre 2027, sa facture devra passer par une plateforme agréée.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">
                Client particulier : facture PDF par mail ou papier, comme d'habitude. Si c'est en
                réalité une SCI, un syndic ou un bailleur, passe-le en professionnel sur sa fiche
                avant de facturer.
              </div>
            )}
            {adresseChantier && (
              <div className="text-xs text-muted-foreground mt-1">
                Lieu des travaux imprimé : {adresseChantier}
              </div>
            )}
          </div>

          <div>
            <Label>Catégorie d'opération</Label>
            <Select value={categorie} onValueChange={(v) => setCategorie(v as CategorieOperation)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORIE_OPERATION_LABEL) as CategorieOperation[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORIE_OPERATION_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {estPro && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={autoliquidation}
                onCheckedChange={(v) => setAutoliquidation(!!v)}
                className="mt-0.5"
              />
              <span>
                Autoliquidation (sous-traitance BTP)
                <span className="block text-xs text-muted-foreground">
                  Facture sans TVA, la TVA est due par l'entreprise cliente. À faire valider par le
                  comptable avant le premier usage.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={valider} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Émettre la facture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
