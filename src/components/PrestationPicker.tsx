import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronRight, ChevronDown, X, BookmarkPlus } from 'lucide-react';
import { MultiSelectFiltre } from '@/components/MultiSelectFiltre';
import { AjouterBiblioDialog } from '@/components/AjouterBiblioDialog';
import { useFiltresPrestation, grouperParFamille } from '@/lib/prestations-filtres';
import { prixAffichage, type Prestation } from '@/lib/queries/prestations';
import { formatCHF } from '@/lib/format';

// Sélecteur de prestation pour le devis : mêmes filtres que la bibliothèque
// (recherche + entité/fournisseur/famille) + résultats groupés par famille.
// L'entité est pré-filtrée sur celle du devis (débrayable — biblio commune §4).
export function PrestationPicker({ prestations, entitePreselection, onChoisir }: {
  prestations: Prestation[];
  entitePreselection: string | null;
  onChoisir: (p: Prestation) => void;
}) {
  const {
    filtres, options, setQ, toggleEntite, toggleFournisseur, toggleFamille, reset, actif, appliquer,
  } = useFiltresPrestation(prestations, { entitePreselection });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [ajoutPour, setAjoutPour] = useState<Prestation | null>(null);

  const groupes = grouperParFamille(appliquer(prestations));
  const toggleFam = (f: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });

  return (
    <div className="space-y-2">
      <div className="flex flex-col md:flex-row md:flex-wrap gap-2">
        <div className="relative w-full md:flex-1 md:min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher une prestation (libellé, code, CFC)" value={filtres.q}
            onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <MultiSelectFiltre label="Entité" options={options.entites} selected={filtres.entites} onToggle={toggleEntite} width="w-full md:w-36" />
        <MultiSelectFiltre label="Fournisseur" options={options.fournisseurs} selected={filtres.fournisseurs} onToggle={toggleFournisseur} width="w-full md:w-44" />
        <MultiSelectFiltre label="Famille" options={options.familles} selected={filtres.familles} onToggle={toggleFamille} width="w-full md:w-44" />
        {actif && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground h-9 w-full md:w-auto">
            <X className="w-4 h-4 mr-1" />Réinitialiser
          </Button>
        )}
      </div>

      <div className="border rounded-md max-h-80 overflow-y-auto">
        {prestations.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Bibliothèque vide.</div>
        ) : groupes.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Aucune prestation ne correspond aux filtres.</div>
        ) : groupes.map(([fam, items]) => {
          const open = !collapsed.has(fam);
          return (
            <div key={fam} className="border-b last:border-0">
              <button type="button" onClick={() => toggleFam(fam)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 text-left">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  {fam}
                </span>
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-muted text-[11px] text-muted-foreground">{items.length}</span>
              </button>
              {open && items.map((p) => {
                const prix = prixAffichage(p);
                return (
                <div key={p.id} className="group flex items-center gap-2 px-3 pl-8 border-t hover:bg-accent/10">
                  <button type="button" onClick={() => onChoisir(p)}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 py-1.5 text-left text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {p.code && <span className="font-mono text-[10px] text-muted-foreground mr-1">{p.code}</span>}
                        {p.libelle}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {[p.fournisseur ?? 'Interne', p.entite].filter(Boolean).join(' · ')} · {p.unite}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block num-tabular text-xs">{prix.principal !== 0 ? formatCHF(prix.principal) : '—'}</span>
                      {prix.secondaire != null && (
                        <span className="block num-tabular text-[10px] text-muted-foreground">PA : {formatCHF(prix.secondaire)}</span>
                      )}
                    </span>
                  </button>
                  <button type="button" onClick={() => setAjoutPour(p)} title="Ajouter à la bibliothèque"
                    className="shrink-0 p-1 text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    <BookmarkPlus className="w-4 h-4" />
                  </button>
                </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <AjouterBiblioDialog
        open={!!ajoutPour}
        onOpenChange={(o) => { if (!o) setAjoutPour(null); }}
        defaults={ajoutPour && {
          libelle: ajoutPour.libelle,
          famille: ajoutPour.famille,
          prix_achat_net: ajoutPour.prix_achat_net ?? prixAffichage(ajoutPour).principal,
          unite: ajoutPour.unite,
          fournisseur: ajoutPour.fournisseur,
          code_cfc: ajoutPour.code_cfc,
        }}
        entite={entitePreselection}
      />
    </div>
  );
}
