import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table2 } from "lucide-react";

// Sélecteur des feuilles d'un classeur Excel (affiché si > 1 feuille).
// Multi-sélection + « Toutes les feuilles ». Confirme avec les noms choisis.
export function SelecteurFeuilles({
  open,
  feuilles,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  feuilles: string[];
  onConfirm: (noms: string[]) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSel(new Set(feuilles));
  }, [feuilles]); // tout coché par défaut

  const toutes = sel.size === feuilles.length && feuilles.length > 0;
  const toggle = (n: string) =>
    setSel((s) => {
      const x = new Set(s);
      x.has(n) ? x.delete(n) : x.add(n);
      return x;
    });
  const toggleToutes = () => setSel(toutes ? new Set() : new Set(feuilles));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="h-4 w-4" />
            Choisir les feuilles à importer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <label className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer border-b mb-1">
            <Checkbox checked={toutes} onCheckedChange={toggleToutes} />
            <span className="text-sm font-medium">Toutes les feuilles</span>
            <span className="ml-auto text-xs text-muted-foreground">{feuilles.length}</span>
          </label>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {feuilles.map((n) => (
              <label
                key={n}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox checked={sel.has(n)} onCheckedChange={() => toggle(n)} />
                <span className="text-sm truncate">{n}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Astuce : ne sélectionnez plusieurs feuilles que si elles ont la même structure de
            colonnes.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button disabled={sel.size === 0} onClick={() => onConfirm([...sel])}>
            Importer ({sel.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
