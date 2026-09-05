import { createFileRoute, Link } from '@tanstack/react-router';
import { useStore } from '@/lib/store';
import { PageHeader } from '@/components/Badges';
import { EntiteChip, StatutDevisChip, CategorieChip } from '@/components/ChantierBadges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatEURShort, formatDate, pct } from '@/lib/format';
import { Plus, Search, Loader2, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArchivedToggle } from '@/components/ArchivedToggle';
import { useDevisList, useArchiveDevis, numeroBase, numeroVersion } from '@/lib/queries/devis';
import { useParametres, paramNumber } from '@/lib/queries/parametres';

export const Route = createFileRoute('/devis/')({ component: DevisList });

function DevisList() {
  const currentEntiteId = useStore(s => s.currentEntiteId);
  const storeEntites = useStore(s => s.entites);
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: devisData = [], isLoading, isError, error } = useDevisList(includeArchived);
  const { data: params } = useParametres();
  const archiveDevis = useArchiveDevis();
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState<string>('all');

  // Seuils de marge cible PARAMÉTRÉS (placeholders démo en base, §8) — pas codés en dur.
  const seuilAlerte = paramNumber(params, 'marge_seuil_alerte_pct', 15);
  const seuilOk = paramNumber(params, 'marge_seuil_ok_pct', 22);

  const selectedCode = currentEntiteId === 'all'
    ? 'all'
    : storeEntites.find(e => e.id === currentEntiteId)?.code ?? 'all';

  const devis = useMemo(() => {
    const filtres = devisData
      .filter(d => selectedCode === 'all' || d.entite?.code === selectedCode)
      .filter(d => statut === 'all' || d.statut === statut)
      .filter(d => {
        if (!q) return true;
        const t = q.toLowerCase();
        return d.numero.toLowerCase().includes(t)
          || (d.client?.nom ?? '').toLowerCase().includes(t)
          || (d.chantier?.nom ?? '').toLowerCase().includes(t)
          || (d.chantier?.reference ?? '').toLowerCase().includes(t);
      });
    // Une seule ligne par numéro de base : seule la DERNIÈRE version (parmi celles
    // qui passent les filtres) apparaît ; les autres restent accessibles depuis le
    // bandeau « Versions » du détail.
    const dernieres = new Map<string, (typeof filtres)[number]>();
    for (const d of filtres) {
      const base = numeroBase(d.numero);
      const cur = dernieres.get(base);
      if (!cur || numeroVersion(d.numero) > numeroVersion(cur.numero)) dernieres.set(base, d);
    }
    return [...dernieres.values()].sort((a, b) => (b.date_creation ?? '').localeCompare(a.date_creation ?? ''));
  }, [devisData, selectedCode, statut, q]);

  return (
    <div>
      <PageHeader
        title="Devis"
        subtitle={`${devis.length} devis`}
        actions={<Link to="/devis/nouveau" className="w-full md:w-auto"><Button className="w-full md:w-auto bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" />Nouveau devis</Button></Link>}
      />

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher numéro, client ou chantier" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={statut} onValueChange={setStatut}>
          <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="brouillon">Brouillon</SelectItem>
            <SelectItem value="envoye">Envoyé</SelectItem>
            <SelectItem value="accepte">Accepté</SelectItem>
            <SelectItem value="refuse">Refusé</SelectItem>
            <SelectItem value="expire">Expiré</SelectItem>
          </SelectContent>
        </Select>
        <ArchivedToggle value={includeArchived} onChange={setIncludeArchived} />
      </div>

      <Card>
        <CardContent className="p-0 md:overflow-x-auto">
          {/* Cartes mobiles */}
          <div className="md:hidden divide-y">
            {isLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></div>
              : isError ? <div className="py-10 text-center text-destructive text-sm">Erreur de chargement.</div>
              : devis.length === 0 ? <div className="py-10 text-center text-muted-foreground text-sm">Aucun devis.</div>
              : devis.map(d => (
                <Link key={d.id} to="/devis/$id" params={{ id: d.id }} className={`block p-3 ${d.archive_at ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-primary">{d.numero}{d.archive_at && <span className="ml-1 text-[10px] uppercase text-muted-foreground">archivé</span>}</span>
                    <StatutDevisChip statut={d.statut} />
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">{d.client?.nom}</div>
                  {d.chantier && <div className="text-xs text-muted-foreground truncate">{d.chantier.nom}</div>}
                  <div className="flex items-center justify-between mt-1.5">
                    <EntiteChip entite={d.entite} />
                    <span className="num-tabular font-semibold">{formatEURShort(d.total_ttc)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span>{formatDate(d.date_creation)}</span>
                    {d.total_ht > 0 && d.taux_marge != null
                      ? <span className={d.taux_marge < seuilAlerte ? 'text-destructive' : d.taux_marge < seuilOk ? 'text-warning-foreground' : 'text-success'}>marge {pct(d.taux_marge, 1)}</span>
                      : <span>marge —</span>}
                  </div>
                </Link>
              ))}
          </div>
          {/* Tableau desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Numéro</th>
                <th className="text-left px-4 py-3 font-medium">Entité</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Chantier</th>
                <th className="text-left px-4 py-3 font-medium">Cat.</th>
                <th className="text-right px-4 py-3 font-medium">TTC</th>
                <th className="text-right px-4 py-3 font-medium">Marge</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="text-center py-10"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></td></tr>}
              {isError && !isLoading && <tr><td colSpan={10} className="text-center py-10 text-destructive">Erreur de chargement : {(error as Error)?.message}</td></tr>}
              {!isLoading && !isError && devis.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Aucun devis.</td></tr>
              )}
              {devis.map(d => (
                <tr key={d.id} className={`border-b last:border-0 hover:bg-muted/30 ${d.archive_at ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <Link to="/devis/$id" params={{ id: d.id }} className="font-mono text-xs text-primary hover:underline">{d.numero}</Link>
                    {d.archive_at && <span className="ml-2 text-[10px] uppercase text-muted-foreground">archivé</span>}
                  </td>
                  <td className="px-4 py-3"><EntiteChip entite={d.entite} /></td>
                  <td className="px-4 py-3">{d.client?.nom}</td>
                  <td className="px-4 py-3">
                    {d.chantier
                      ? <Link to="/chantiers/$id" params={{ id: d.chantier.id }} className="hover:underline" title={d.chantier.reference}>{d.chantier.nom}</Link>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3"><CategorieChip libelle={d.client?.categorie?.libelle} /></td>
                  <td className="px-4 py-3 text-right num-tabular">{formatEURShort(d.total_ttc)}</td>
                  <td className="px-4 py-3 text-right num-tabular">
                    {d.total_ht > 0 && d.taux_marge != null ? (
                      <span className={d.taux_marge < seuilAlerte ? 'text-destructive' : d.taux_marge < seuilOk ? 'text-warning-foreground' : 'text-success'}>
                        {pct(d.taux_marge, 1)}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3"><StatutDevisChip statut={d.statut} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(d.date_creation)}</td>
                  <td className="px-4 py-3 text-right">
                    {d.archive_at && (
                      <button title="Restaurer" onClick={() => archiveDevis.mutate({ id: d.id, restore: true }, { onSuccess: () => toast.success('Devis restauré') })} className="text-muted-foreground hover:text-foreground">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
