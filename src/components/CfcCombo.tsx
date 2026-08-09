import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AUCUN = '__aucun_cfc__';
const AUTRE = '__autre_cfc__';

// Combo Code CFC : Select des codes existants + « Autre code CFC… » qui révèle
// deux inputs libres (code + libellé). Partagé par AjouterBiblioDialog et le
// formulaire « Nouvelle prestation » pour un comportement identique.
export function CfcCombo({ code, libelle, options, onChange }: {
  code: string;
  libelle: string;
  options: { code: string; libelle: string | null }[];
  onChange: (code: string, libelle: string) => void;
}) {
  const [autre, setAutre] = useState(false);

  // Inclut le code courant dans la liste s'il n'y est pas déjà (valeur pré-remplie).
  const opts = useMemo(() => {
    if (!code || autre || options.some((o) => o.code === code)) return options;
    return [{ code, libelle: libelle || null }, ...options];
  }, [code, libelle, autre, options]);

  const selectValue = autre ? AUTRE : code ? code : AUCUN;

  const onSelect = (v: string) => {
    if (v === AUTRE) { setAutre(true); onChange('', ''); }
    else if (v === AUCUN) { setAutre(false); onChange('', ''); }
    else { setAutre(false); onChange(v, options.find((o) => o.code === v)?.libelle ?? ''); }
  };

  return (
    <div>
      <Select value={selectValue} onValueChange={onSelect}>
        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={AUCUN}>— aucun —</SelectItem>
          {opts.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}{c.libelle ? ` — ${c.libelle}` : ''}</SelectItem>)}
          <SelectItem value={AUTRE}>Autre code CFC…</SelectItem>
        </SelectContent>
      </Select>
      {autre && (
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <Input value={code} onChange={(e) => onChange(e.target.value, libelle)} placeholder="Code (ex. 271)" autoFocus />
          <Input value={libelle} onChange={(e) => onChange(code, e.target.value)} placeholder="Libellé (ex. Plâtrerie)" />
        </div>
      )}
    </div>
  );
}
