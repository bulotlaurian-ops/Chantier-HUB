import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useStore } from '@/lib/store';
import { PageHeader } from '@/components/Badges';
import { EntiteChip, StatutChantierChip } from '@/components/ChantierBadges';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Hammer, Loader2, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ArchivedToggle } from '@/components/ArchivedToggle';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CLE_BROUILLON_CHANTIER_GLOBAL, lireBrouillon, ecrireBrouillon, effacerBrouillon } from '@/lib/brouillon';
import { todayIso } from '@/lib/store';
import { addDays, abregeVille, formatEUR } from '@/lib/format';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useChantiersList, useCreateChantier, useArchiveChantier, useChantierCoutsReels, evalMarge, type MargeEval } from '@/lib/queries/chantiers';
import { useDevisList } from '@/lib/queries/devis';
import { useClients } from '@/lib/queries/clients';
import { useEntites } from '@/lib/queries/entites';
import { useAuth } from '@/lib/auth';

// Affichage : arrondi suisse 0.05 (valeur affichée uniquement, pas le calcul).
const a05 = (n: number) => Math.round(n / 0.05) * 0.05;
const margeColor = (n: MargeEval['niveau']) => n === 'negatif' ? 'text-destructive' : n === 'faible' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';

export const Route = createFileRoute('/chantiers/')({ component: ChantiersList });

function ChantiersList() {
  const currentEntiteId = useStore(s => s.currentEntiteId);
  const storeEntites = useStore(s => s.entites);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortMarge, setSortMarge] = useState<'none' | 'asc' | 'desc'>('none');
  const { data: chantiersData = [], isLoading, isError, error } = useChantiersList(includeArchived);
  const { data: allDevis = [] } = useDevisList();
  const { profile } = useAuth();
  const isOuvrier = profile?.role === 'ouvrier';
  const { data: couts = {} } = useChantierCoutsReels(!isOuvrier);
  const archiveChantier = useArchiveChantier();

  // L'entité est portée par le chantier (§4) → filtre légitime. Bridge seed↔DB par le CODE entité.
  const selectedCode = currentEntiteId === 'all'
    ? 'all'
    : storeEntites.find(e => e.id === currentEntiteId)?.code ?? 'all';

  const filtres = useMemo(
    () => chantiersData.filter(c => selectedCode === 'all' || c.entite?.code === selectedCode),
    [chantiersData, selectedCode],
  );

  // Tri par marge (chantiers sans marge calculable = toujours en dernier).
  const chantiers = useMemo(() => {
    if (isOuvrier || sortMarge === 'none') return filtres;
    const dir = sortMarge === 'asc' ? 1 : -1;
    return [...filtres].sort((a, b) => {
      const ma = evalMarge(couts[a.id]); const mb = evalMarge(couts[b.id]);
      if (!ma.calculable && !mb.calculable) return 0;
      if (!ma.calculable) return 1;
      if (!mb.calculable) return -1;
      return ((ma.margeChf ?? 0) - (mb.margeChf ?? 0)) * dir;
    });
  }, [filtres, sortMarge, isOuvrier, couts]);

  const cycleSort = () => setSortMarge(s => s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none');
  const cols = isOuvrier ? 8 : 9;

  return (
    <div>
      <PageHeader
        title="Chantiers"
        subtitle={`${chantiers.length} chantier${chantiers.length > 1 ? 's' : ''}`}
        actions={<NouveauChantierDialog />}
      />

      <div className="flex justify-end mb-3">
        <ArchivedToggle value={includeArchived} onChange={setIncludeArchived} />
      </div>

      <Card>
        <CardContent className="p-0 md:overflow-x-auto">
          {/* Cartes mobiles */}
          <div className="md:hidden divide-y">
            {isLoading ? <div className="py-12 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></div>
              : isError ? <div className="py-12 text-center text-destructive text-sm">Erreur de chargement.</div>
              : chantiers.length === 0 ? <div className="py-12 text-center text-muted-foreground text-sm">Aucun chantier.</div>
              : chantiers.map(c => {
                const nbDevis = allDevis.filter(d => d.chantier_id === c.id).length;
                const ev = evalMarge(couts[c.id]);
                return (
                  <Link key={c.id} to="/chantiers/$id" params={{ id: c.id }} className={`block p-3 ${c.archive_at ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-primary">{c.reference}{c.archive_at && <span className="ml-1 text-[10px] uppercase text-muted-foreground">archivé</span>}</span>
                      <StatutChantierChip statut={c.statut} />
                    </div>
                    <div className="text-sm font-medium mt-0.5 truncate">{c.nom}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.client?.nom} · {c.ville}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <EntiteChip entite={c.entite} />
                      {!isOuvrier
                        ? (ev.calculable ? <span className={`num-tabular text-sm font-medium ${margeColor(ev.niveau)}`}>{formatEUR(a05(ev.margeChf!))}{ev.margePct != null ? ` · ${ev.margePct.toFixed(1)} %` : ''}</span> : <span className="text-xs text-muted-foreground">marge —</span>)
                        : <span className="text-xs text-muted-foreground num-tabular">{nbDevis} devis</span>}
                    </div>
                  </Link>
                );
              })}
          </div>
          {/* Tableau desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3">Référence</th>
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3">Entité</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Ville</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-right px-4 py-3">Devis</th>
                {!isOuvrier && (
                  <th className="text-right px-4 py-3">
                    <button onClick={cycleSort} className="inline-flex items-center gap-1 hover:text-foreground">
                      Marge
                      {sortMarge === 'none' ? <ArrowUpDown className="w-3 h-3" /> : sortMarge === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                    </button>
                  </th>
                )}
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={cols} className="text-center py-12"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></td></tr>}
              {isError && !isLoading && <tr><td colSpan={cols} className="text-center py-12 text-destructive">Erreur de chargement : {(error as Error)?.message}</td></tr>}
              {!isLoading && !isError && chantiers.length === 0 && (
                <tr><td colSpan={cols} className="text-center py-12">
                  <Hammer className="w-10 h-10 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground mt-2 text-sm">Aucun chantier.</p>
                </td></tr>
              )}
              {chantiers.map(c => {
                const nbDevis = allDevis.filter(d => d.chantier_id === c.id).length;
                return (
                  <tr key={c.id} className={`border-b last:border-0 hover:bg-muted/30 ${c.archive_at ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <Link to="/chantiers/$id" params={{ id: c.id }} className="font-mono text-xs text-primary hover:underline">{c.reference}</Link>
                      {c.archive_at && <span className="ml-2 text-[10px] uppercase text-muted-foreground">archivé</span>}
                    </td>
                    <td className="px-4 py-3">{c.nom}</td>
                    <td className="px-4 py-3"><EntiteChip entite={c.entite} /></td>
                    <td className="px-4 py-3">{c.client?.nom}</td>
                    <td className="px-4 py-3">{c.ville}</td>
                    <td className="px-4 py-3"><StatutChantierChip statut={c.statut} /></td>
                    <td className="px-4 py-3 text-right text-xs num-tabular">{nbDevis}</td>
                    {!isOuvrier && (() => {
                      const ev = evalMarge(couts[c.id]);
                      return (
                        <td className="px-4 py-3 text-right num-tabular">
                          {ev.calculable ? (
                            <span className={`font-medium ${margeColor(ev.niveau)}`}>
                              {formatEUR(a05(ev.margeChf!))}
                              {ev.margePct != null && <span className="block text-[11px] font-normal text-muted-foreground">{ev.margePct.toFixed(1)} %</span>}
                            </span>
                          ) : <span className="text-muted-foreground" title="Aucun devis accepté">—</span>}
                        </td>
                      );
                    })()}
                    <td className="px-4 py-3 text-right">
                      {c.archive_at && (
                        <button title="Restaurer" onClick={() => archiveChantier.mutate({ id: c.id, restore: true }, { onSuccess: () => toast.success('Chantier restauré') })} className="text-muted-foreground hover:text-foreground">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NouveauChantierDialog() {
  const nav = useNavigate();
  const { data: entites = [] } = useEntites();
  const { data: clients = [] } = useClients();
  const create = useCreateChantier();
  const [open, setOpen] = useState(false);
  // Repart du brouillon local si l'utilisateur avait quitté l'app en pleine saisie.
  const b0 = lireBrouillon<{ entiteId: string; clientId: string; nom: string; ville: string; adresse: string }>(CLE_BROUILLON_CHANTIER_GLOBAL);
  const [entiteId, setEntiteId] = useState(b0?.entiteId ?? '');
  const [clientId, setClientId] = useState(b0?.clientId ?? '');
  const [nom, setNom] = useState(b0?.nom ?? '');
  const [ville, setVille] = useState(b0?.ville ?? '');
  const [adresse, setAdresse] = useState(b0?.adresse ?? '');
  const [dateDebut, setDateDebut] = useState(todayIso());
  const [dateFin, setDateFin] = useState(addDays(todayIso(), 30));

  useEffect(() => {
    if (!open) return;
    if (!nom.trim() && !clientId && !entiteId) return;
    ecrireBrouillon(CLE_BROUILLON_CHANTIER_GLOBAL, { entiteId, clientId, nom, ville, adresse });
  }, [open, entiteId, clientId, nom, ville, adresse]);

  const entite = entites.find(e => e.id === entiteId);
  // Aperçu (la référence définitive est générée côté serveur à la création)
  const apercu = entite ? `${entite.prefixe_nomenclature}-${ville ? abregeVille(ville) : '…'}-…` : '…';

  const submit = async () => {
    if (!entiteId || !clientId || !nom || !ville) { toast.error('Renseignez entité, client, nom et ville'); return; }
    try {
      const ch = await create.mutateAsync({
        entite_id: entiteId, client_id: clientId, nom, ville, adresse,
        date_debut: dateDebut, date_fin_prevue: dateFin,
      });
      toast.success(`Chantier ${ch.reference} créé`);
      effacerBrouillon(CLE_BROUILLON_CHANTIER_GLOBAL);
      setOpen(false);
      nav({ to: '/chantiers/$id', params: { id: ch.id } });
    } catch (e) {
      toast.error('Création impossible : ' + (e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full md:w-auto bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="w-4 h-4 mr-2" />Nouveau chantier</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau chantier</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Entité</Label>
            <Select value={entiteId} onValueChange={setEntiteId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Sélectionner l'entité" /></SelectTrigger>
              <SelectContent>{entites.map(e => <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Nom du chantier</Label><Input value={nom} onChange={e => setNom(e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Ville</Label><Input value={ville} onChange={e => setVille(e.target.value)} className="mt-1" /></div>
            <div><Label>Adresse</Label><Input value={adresse} onChange={e => setAdresse(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Date début</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="mt-1" /></div>
            <div><Label>Date fin prévue</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="p-3 rounded-md bg-muted/50 border">
            <div className="text-xs text-muted-foreground">Référence générée automatiquement</div>
            <div className="font-mono text-lg text-primary mt-1">{apercu}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
