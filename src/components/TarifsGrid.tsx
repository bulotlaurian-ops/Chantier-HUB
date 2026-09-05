import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { formatEUR } from '@/lib/format';
import { prixDepuisTarif, type ModeTarif } from '@/lib/queries/prestations';
import type { CategorieTarifaire } from '@/lib/queries/categories';

export interface TarifValue { mode: ModeTarif; valeur: number }

const MODES: { value: ModeTarif; label: string }[] = [
  { value: 'remise_pct', label: 'Remise %' },
  { value: 'coefficient', label: 'Coefficient' },
  { value: 'prix_absolu', label: 'Prix absolu' },
];

const defautValeur = (mode: ModeTarif, ref: number) => (mode === 'coefficient' ? 1 : mode === 'prix_absolu' ? ref : 0);

// Grille tarifs CONTRÔLÉE (catégories de type 'client'). La persistance (upsert/delete
// en édition, ou collecte locale en création) est gérée par le parent via onSet/onRemove.
export function TarifsGrid({
  categories, prixReference, value, onSet, onRemove, pending,
}: {
  categories: CategorieTarifaire[];                                  // type='client', triées par ordre
  prixReference: number;
  value: Record<string, TarifValue>;                                 // categorie_id -> tarif courant
  onSet: (catId: string, mode: ModeTarif, valeur: number) => void;
  onRemove: (catId: string) => void;
  pending?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground border-b">
        <tr>
          <th className="text-left px-2 py-2">Catégorie</th>
          <th className="text-left px-2 py-2 w-32">Mode</th>
          <th className="text-right px-2 py-2 w-28">Valeur</th>
          <th className="text-right px-2 py-2 w-32">Prix résultant</th>
          <th className="px-2 py-2 w-36"></th>
        </tr>
      </thead>
      <tbody>
        {categories.map((cat) =>
          cat.code === 'public' ? (
            <tr key={cat.id} className="border-b last:border-0">
              <td className="px-2 py-2 font-medium">{cat.libelle}</td>
              <td className="px-2 py-2 text-xs text-muted-foreground" colSpan={2}>Prix de référence (base)</td>
              <td className="px-2 py-2 text-right num-tabular font-medium">{formatEUR(prixReference)}</td>
              <td></td>
            </tr>
          ) : (
            <TarifRow
              key={`${cat.id}:${value[cat.id]?.mode ?? 'none'}:${value[cat.id]?.valeur ?? ''}`}
              cat={cat}
              prixReference={prixReference}
              current={value[cat.id]}
              onSet={onSet}
              onRemove={onRemove}
              pending={pending}
            />
          ),
        )}
      </tbody>
    </table>
  );
}

function TarifRow({
  cat, prixReference, current, onSet, onRemove, pending,
}: {
  cat: CategorieTarifaire;
  prixReference: number;
  current: TarifValue | undefined;
  onSet: (catId: string, mode: ModeTarif, valeur: number) => void;
  onRemove: (catId: string) => void;
  pending?: boolean;
}) {
  const [mode, setMode] = useState<ModeTarif>(current?.mode ?? 'remise_pct');
  const [valeur, setValeur] = useState<number>(current?.valeur ?? 0);

  const prix = prixDepuisTarif(mode, valeur, prixReference);
  const dirty = !current || current.mode !== mode || current.valeur !== valeur;
  const changeMode = (m: ModeTarif) => { setMode(m); if (!current || current.mode !== m) setValeur(defautValeur(m, prixReference)); };

  return (
    <tr className="border-b last:border-0">
      <td className="px-2 py-1.5 font-medium">{cat.libelle}</td>
      <td className="px-2 py-1.5">
        <Select value={mode} onValueChange={(v) => changeMode(v as ModeTarif)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.01" value={valeur} onChange={(e) => setValeur(Number(e.target.value))} className="h-8 text-right text-xs" />
      </td>
      <td className="px-2 py-1.5 text-right num-tabular">
        {formatEUR(prix)}
        {!current && <div className="text-[10px] text-muted-foreground">prix réf. appliqué</div>}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <Button size="sm" variant="outline" className="h-7 mr-1" disabled={!dirty || pending} onClick={() => onSet(cat.id, mode, valeur)}>
          {current ? 'Enregistrer' : 'Ajouter'}
        </Button>
        {current && (
          <button title="Revenir au prix de référence" disabled={pending} onClick={() => onRemove(cat.id)} className="text-muted-foreground hover:text-destructive align-middle">
            <Trash2 className="w-3.5 h-3.5 inline" />
          </button>
        )}
      </td>
    </tr>
  );
}
