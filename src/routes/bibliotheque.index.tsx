import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/Badges';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCHF, formatHeures, formatDate } from '@/lib/format';
import { Search, Trash2, Plus, ChevronRight, ChevronDown, Copy, GripVertical, Loader2, Coins, Check, X, Inbox, FolderTree, List, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useMemo, useEffect } from 'react';
import type { Tables } from '@/lib/database.types';
import { useAuth } from '@/lib/auth';
import {
  usePrestationsToutes, useUpdatePrestation, useCreatePrestation, useDeletePrestation, useDuplicatePrestation,
  usePrestationsPending, useValiderPrestation, useRejeterPrestation, usePrestationsOptions, usePrestations, prixAffichage,
  type Prestation, type NouveauPoste, type NouveauTarif, type PrestationPending,
} from '@/lib/queries/prestations';
import { usePrestationPacks, useAddPack, useRemovePack } from '@/lib/queries/packs';
import { useUpsertTarif, useDeleteTarif } from '@/lib/queries/tarifs';
import { useCategoriesTarifaires } from '@/lib/queries/categories';
import { TarifsGrid, type TarifValue } from '@/components/TarifsGrid';
import { CfcCombo } from '@/components/CfcCombo';
import { MultiSelectFiltre } from '@/components/MultiSelectFiltre';
import { BiblioImport } from '@/components/BiblioImport';
import { useFiltresPrestation, grouperParFamille } from '@/lib/prestations-filtres';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const Route = createFileRoute('/bibliotheque/')({ component: Biblio });

type Unite = Tables<'prestations'>['unite'];
const UNITES: Unite[] = ['m2', 'ml', 'pce', 'u', 'fft', 'h', 'forfait'];
const TVA_TYPES = ['standard', 'reduit', 'hebergement', 'exonere'] as const;
type TvaType = typeof TVA_TYPES[number];
const AUCUNE_FAM = '__aucune_fam__';
const NOUVELLE_FAM = '__nouvelle_fam__';

// Badge CFC discret (gris clair). Title = libellé CFC si présent.
function BadgeCFC({ code, libelle }: { code: string | null; libelle?: string | null }) {
  if (!code) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span title={libelle ?? undefined} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      CFC {code}
    </span>
  );
}

function BadgeStatut({ statut }: { statut: Prestation['statut_validation'] }) {
  if (statut === 'valide') return null;
  const cls = statut === 'pending' ? 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40' : 'border-destructive/40 text-destructive bg-destructive/5';
  return <span className={`ml-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] ${cls}`}>{statut === 'pending' ? 'en attente' : 'rejeté'}</span>;
}

function Biblio() {
  // isAdmin : validation/rejet, édition inline (RLS UPDATE), suppression.
  // isStaff : création, grille tarifs, duplication (RLS le permet pour le conducteur).
  const { isAdmin, isStaff } = useAuth();
  const { data: prestationsData = [], isLoading, isError, error } = usePrestationsToutes();
  const [statutFilter, setStatutFilter] = useState<'actif' | 'pending' | 'rejete' | 'all'>('actif');
  const [vue, setVue] = useState<'famille' | 'plat'>('famille');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { filtres, options, setQ, toggleEntite, toggleFournisseur, toggleFamille, reset, actif, appliquer } =
    useFiltresPrestation(prestationsData);

  // Filtre statut (admin) appliqué d'abord, puis les filtres partagés (texte/entité/fournisseur/famille).
  const filtered = useMemo(() => {
    const parStatut = prestationsData.filter((p) => {
      if (statutFilter === 'actif') return p.actif;
      if (statutFilter === 'pending') return p.statut_validation === 'pending';
      if (statutFilter === 'rejete') return p.statut_validation === 'rejete';
      return true; // 'all'
    });
    return appliquer(parStatut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prestationsData, statutFilter, filtres.q, filtres.entites, filtres.fournisseurs, filtres.familles]);

  const groupes = useMemo(() => grouperParFamille(filtered), [filtered]);
  const toggleFam = (f: string) => setCollapsed(s => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });

  return (
    <div>
      <PageHeader
        title="Bibliothèque de prix"
        subtitle="Référentiel commun aux 3 entités · arborescence par famille métier + code CFC"
        actions={isStaff ? <NouvellePrestationDialog /> : undefined}
      />

      <BiblioImport />

      {isAdmin && <PrestationsAValider />}

      {/* Filtres + bascule de vue */}
      <div className="flex flex-col md:flex-row md:flex-wrap gap-2 mb-3">
        <div className="relative w-full md:flex-1 md:min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher (libellé, code, CFC)" value={filtres.q} onChange={e => setQ(e.target.value)} className="pl-9" />
        </div>
        <MultiSelectFiltre label="Entité" options={options.entites} selected={filtres.entites} onToggle={toggleEntite} width="w-full md:w-40" />
        <MultiSelectFiltre label="Fournisseur" options={options.fournisseurs} selected={filtres.fournisseurs} onToggle={toggleFournisseur} width="w-full md:w-48" />
        <MultiSelectFiltre label="Famille" options={options.familles} selected={filtres.familles} onToggle={toggleFamille} width="w-full md:w-48" />
        {actif && (
          <Button variant="ghost" onClick={reset} className="text-muted-foreground h-9 w-full md:w-auto">
            <X className="w-4 h-4 mr-1" />Réinitialiser les filtres
          </Button>
        )}
        {isAdmin && (
          <Select value={statutFilter} onValueChange={(v) => setStatutFilter(v as typeof statutFilter)}>
            <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="actif">Actives</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="rejete">Rejetées</SelectItem>
              <SelectItem value="all">Tous statuts</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="inline-flex rounded-md border">
          <button onClick={() => setVue('famille')} className={`px-3 h-9 text-sm inline-flex items-center gap-1 rounded-l-md ${vue === 'famille' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}><FolderTree className="w-4 h-4" />Familles</button>
          <button onClick={() => setVue('plat')} className={`px-3 h-9 text-sm inline-flex items-center gap-1 rounded-r-md border-l ${vue === 'plat' ? 'bg-muted font-medium' : 'text-muted-foreground'}`}><List className="w-4 h-4" />À plat</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <Card><CardContent className="py-8 text-center text-destructive text-sm">Erreur de chargement : {(error as Error)?.message}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          {prestationsData.length === 0 ? 'Aucune prestation visible.' : 'Aucune prestation ne correspond aux filtres.'}
        </CardContent></Card>
      ) : vue === 'famille' ? (
        <div className="space-y-2">
          {groupes.map(([fam, items]) => {
            const open = !collapsed.has(fam);
            return (
              <Card key={fam}>
                <button onClick={() => toggleFam(fam)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 rounded-t-lg">
                  <span className="flex items-center gap-2">
                    {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <span className="font-medium text-sm">{fam}</span>
                  </span>
                  <span className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full bg-muted text-[11px] text-muted-foreground">{items.length}</span>
                </button>
                {open && <div className="border-t overflow-x-auto"><PrestationTable items={items} isAdmin={isAdmin} isStaff={isStaff} /></div>}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto"><PrestationTable items={filtered} isAdmin={isAdmin} isStaff={isStaff} /></CardContent></Card>
      )}
    </div>
  );
}

function PrestationTable({ items, isAdmin, isStaff }: { items: Prestation[]; isAdmin: boolean; isStaff: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground border-b bg-muted/30">
        <tr>
          <th className="text-left px-3 py-2">Désignation</th>
          <th className="text-left px-3 py-2 w-14">Unité</th>
          <th className="text-right px-3 py-2 w-28">Prix réf.</th>
          <th className="text-left px-3 py-2 w-28">CFC</th>
          <th className="text-left px-3 py-2 w-40">Famille</th>
          {isStaff && <th className="px-3 py-2 w-24"></th>}
        </tr>
      </thead>
      <tbody>
        {items.map(p => <PrestationLigne key={p.id} p={p} isAdmin={isAdmin} isStaff={isStaff} />)}
      </tbody>
    </table>
  );
}

// Ligne de prestation : affichage + édition inline (admin) de famille et code_cfc.
// Tarifs / duplication = staff ; suppression = admin uniquement (RLS).
function PrestationLigne({ p, isAdmin, isStaff }: { p: Prestation; isAdmin: boolean; isStaff: boolean }) {
  const update = useUpdatePrestation();
  const duplicate = useDuplicatePrestation();
  const remove = useDeletePrestation();
  const [famille, setFamille] = useState(p.famille ?? '');
  const [cfc, setCfc] = useState(p.code_cfc ?? '');
  useEffect(() => { setFamille(p.famille ?? ''); setCfc(p.code_cfc ?? ''); }, [p.famille, p.code_cfc]);

  const saveFamille = () => {
    const v = famille.trim() || null;
    if (v !== (p.famille ?? null)) update.mutate({ id: p.id, patch: { famille: v } }, { onSuccess: () => toast.success('Famille mise à jour') });
  };
  const saveCfc = () => {
    const v = cfc.trim() || null;
    if (v !== (p.code_cfc ?? null)) update.mutate({ id: p.id, patch: { code_cfc: v } }, { onSuccess: () => toast.success('Code CFC mis à jour') });
  };

  const prix = prixAffichage(p);

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 align-top">
      <td className="px-3 py-2">
        <span className="font-medium">{p.libelle}</span>
        <BadgeStatut statut={p.statut_validation} />
        {p.code && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{p.code}</span>}
      </td>
      <td className="px-3 py-2 text-xs">{p.unite}</td>
      <td className="px-3 py-2 text-right num-tabular">
        <div>{prix.principal !== 0 ? formatCHF(prix.principal) : '—'}</div>
        {prix.secondaire != null && (
          <div className="text-[10px] text-muted-foreground">PA : {formatCHF(prix.secondaire)}</div>
        )}
      </td>
      <td className="px-3 py-2">
        {isAdmin
          ? <Input value={cfc} onChange={e => setCfc(e.target.value)} onBlur={saveCfc} placeholder="CFC" className="h-7 text-xs w-24" title={p.code_cfc_libelle ?? undefined} />
          : <BadgeCFC code={p.code_cfc} libelle={p.code_cfc_libelle} />}
      </td>
      <td className="px-3 py-2">
        {isAdmin
          ? <Input value={famille} onChange={e => setFamille(e.target.value)} onBlur={saveFamille} placeholder="Famille" className="h-7 text-xs" />
          : <span className="text-xs text-muted-foreground">{p.famille ?? '—'}</span>}
      </td>
      {isStaff && (
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <TarifsDialog prestation={p} />
          <LiaisonsDialog prestation={p} />
          <button onClick={() => duplicate.mutate(p, { onSuccess: () => toast.success('Prestation dupliquée') })} title="Dupliquer" className="text-muted-foreground hover:text-foreground mr-2"><Copy className="w-3.5 h-3.5 inline" /></button>
          {isAdmin && (
            <button onClick={() => remove.mutate(p.id, { onSuccess: () => toast.success('Prestation supprimée') })} title="Supprimer" className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5 inline" /></button>
          )}
        </td>
      )}
    </tr>
  );
}

// Modal d'édition de la grille tarifs (catégories client) d'une prestation existante.
function TarifsDialog({ prestation }: { prestation: Prestation }) {
  const { data: categories = [] } = useCategoriesTarifaires();
  const catsClient = useMemo(() => categories.filter((c) => c.type === 'client').sort((a, b) => a.ordre - b.ordre), [categories]);
  const upsert = useUpsertTarif();
  const del = useDeleteTarif();
  const value: Record<string, TarifValue> = Object.fromEntries(prestation.tarifs.map((t) => [t.categorie_id, { mode: t.mode, valeur: t.valeur }]));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button title="Grille tarifs par catégorie" className="text-muted-foreground hover:text-foreground mr-2 align-middle">
          <Coins className="w-3.5 h-3.5 inline" />{prestation.tarifs.length > 0 && <span className="text-[10px] ml-0.5">{prestation.tarifs.length}</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Grille tarifs — {prestation.libelle}</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground">
          Prix de référence : <span className="font-medium text-foreground">{formatCHF(prestation.prix_vente_reference)}</span>
          {prestation.code ? ` · réf. ${prestation.code}` : ''}
        </div>
        <TarifsGrid
          categories={catsClient}
          prixReference={prestation.prix_vente_reference}
          value={value}
          pending={upsert.isPending || del.isPending}
          onSet={(catId, mode, valeur) => upsert.mutate({ prestation_id: prestation.id, categorie_id: catId, mode, valeur }, { onSuccess: () => toast.success('Tarif enregistré') })}
          onRemove={(catId) => del.mutate({ prestation_id: prestation.id, categorie_id: catId }, { onSuccess: () => toast.success('Tarif supprimé — prix de référence appliqué') })}
        />
      </DialogContent>
    </Dialog>
  );
}

// Gestion des prestations liées (« packs ») d'une prestation : liste + ajout/retrait.
function LiaisonsDialog({ prestation }: { prestation: Prestation }) {
  const { data: packs = [] } = usePrestationPacks();
  const { data: prestations = [] } = usePrestations();
  const add = useAddPack();
  const remove = useRemovePack();
  const [q, setQ] = useState('');

  const parId = useMemo(() => new Map(prestations.map((p) => [p.id, p])), [prestations]);
  const liaisons = useMemo(
    () => packs.filter((k) => k.prestation_id === prestation.id).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [packs, prestation.id],
  );
  const dejaLiees = useMemo(() => new Set(liaisons.map((l) => l.prestation_liee_id)), [liaisons]);

  const resultats = useMemo(() => {
    const terme = q.trim().toLowerCase();
    if (!terme) return [];
    return prestations
      .filter((p) => p.id !== prestation.id && !dejaLiees.has(p.id) && p.libelle.toLowerCase().includes(terme))
      .slice(0, 8);
  }, [q, prestations, prestation.id, dejaLiees]);

  const ajouter = (lieeId: string) => {
    add.mutate(
      { prestation_id: prestation.id, prestation_liee_id: lieeId, ordre: liaisons.length },
      { onSuccess: () => { setQ(''); toast.success('Prestation liée ajoutée'); } },
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button title="Gérer les liaisons" className="text-muted-foreground hover:text-foreground mr-2 align-middle">
          <LinkIcon className="w-3.5 h-3.5 inline" />{liaisons.length > 0 && <span className="text-[10px] ml-0.5">{liaisons.length}</span>}
        </button>
      </DialogTrigger>
      {/* Largeur et hauteur bornées en style inline : quel que soit l'état du CSS,
          rien ne peut déborder du dialog (retour client : liste qui s'étalait sur
          toute la page). Tout l'intérieur défile dans ses propres zones. */}
      <DialogContent
        className="overflow-hidden flex flex-col gap-3 p-5"
        style={{ maxWidth: 'min(36rem, calc(100vw - 2rem))', maxHeight: '85vh' }}
      >
        <DialogHeader className="min-w-0">
          <DialogTitle className="pr-8 break-words leading-snug">Prestations liées</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground break-words">
          Proposées automatiquement quand « <span className="font-medium text-foreground">{prestation.libelle}</span> » est ajoutée à un devis.
        </div>

        {/* Liste des liées — zone bornée qui défile */}
        <div className="min-h-0 shrink-0 max-h-[30vh] overflow-y-auto overflow-x-hidden rounded-md border">
          {liaisons.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Aucune prestation liée pour l'instant.</div>
          ) : (
            <div className="divide-y">
              {liaisons.map((l, i) => {
                const pl = parId.get(l.prestation_liee_id);
                return (
                  <div key={l.id} className="flex items-start gap-2 px-3 py-2 min-w-0">
                    <span className="text-xs text-muted-foreground num-tabular w-5 shrink-0 text-right leading-5">{i + 1}.</span>
                    <span className="flex-1 min-w-0 text-sm break-words">
                      {pl ? pl.libelle : <span className="text-muted-foreground italic">Prestation introuvable</span>}
                    </span>
                    {pl?.unite && <span className="text-xs text-muted-foreground shrink-0">{pl.unite}</span>}
                    <button onClick={() => remove.mutate(l.id, { onSuccess: () => toast.success('Liaison retirée') })}
                      title="Retirer" className="text-muted-foreground hover:text-destructive shrink-0 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recherche + ajout */}
        <div className="min-w-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher une prestation à lier…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          {resultats.length > 0 && (
            <div className="mt-1.5 border rounded-md divide-y max-h-[30vh] overflow-y-auto overflow-x-hidden">
              {resultats.map((p) => (
                <button key={p.id} onClick={() => ajouter(p.id)} disabled={add.isPending}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent/10 min-w-0">
                  <Plus className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                  <span className="flex-1 min-w-0 break-words">{p.libelle}</span>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{p.unite}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim() && resultats.length === 0 && (
            <div className="mt-1.5 text-xs text-muted-foreground px-1">Aucune prestation active ne correspond (ou déjà liée).</div>
          )}
          {!q.trim() && (
            <div className="mt-1.5 text-[11px] text-muted-foreground px-1">Tape un mot du libellé (ex. « carrelage ») puis clique un résultat pour le lier.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Côté admin : file des prestations proposées (pending) ----
function PrestationsAValider() {
  const { data: pending = [], isLoading } = usePrestationsPending();
  const [tarifsPour, setTarifsPour] = useState<Prestation | null>(null);

  if (isLoading || pending.length === 0) return null; // section masquée si rien à valider

  return (
    <Card className="mb-4 border-amber-300">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-amber-50/60 dark:bg-amber-950/30">
          <Inbox className="w-4 h-4 text-amber-700 dark:text-amber-300" />
          <span className="text-sm font-medium">À valider</span>
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-600 text-white text-[11px] font-semibold">{pending.length}</span>
          <span className="text-xs text-muted-foreground">Prestations proposées / importées — ajuste si besoin, puis valide ou rejette.</span>
        </div>
        <div className="divide-y max-h-[28rem] overflow-y-auto">
          {pending.map(p => <PendingRow key={p.id} p={p} onValide={setTarifsPour} />)}
        </div>
      </CardContent>
      <TarifsApresValidation prestation={tarifsPour} onClose={() => setTarifsPour(null)} />
    </Card>
  );
}

function PendingRow({ p, onValide }: { p: PrestationPending; onValide: (pr: Prestation) => void }) {
  const valider = useValiderPrestation();
  const rejeter = useRejeterPrestation();
  const [lib, setLib] = useState(p.libelle);
  const [unite, setUnite] = useState<Unite>(p.unite);
  const [prix, setPrix] = useState(p.prix_vente_reference);

  const auteur = p.auteur ? `${p.auteur.prenom ?? ''} ${p.auteur.nom}`.trim() : '—';
  const depuis = (p.source ?? '').startsWith('suggestion:') ? p.source!.slice('suggestion:'.length)
    : (p.source ?? '').startsWith('import:') ? `import ${p.source!.slice('import:'.length)}` : null;
  const busy = valider.isPending || rejeter.isPending;

  const onValider = async () => {
    if (!lib.trim()) { toast.error('Désignation requise'); return; }
    try {
      const pr = await valider.mutateAsync({ id: p.id, patch: { libelle: lib.trim(), unite, prix_vente_reference: prix } });
      toast.success(`« ${lib} » validée — disponible en bibliothèque`);
      onValide(pr); // ouvre la grille tarifs
    } catch (e) {
      toast.error('Validation impossible : ' + (e as Error).message);
    }
  };

  return (
    <div className="px-4 py-3 grid md:grid-cols-[1fr_5rem_8rem_auto] gap-2 items-center">
      <div>
        <Input value={lib} onChange={e => setLib(e.target.value)} className="h-8 text-sm" />
        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1">
          {p.famille && <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-foreground">{p.famille}</span>}
          <span>soumis par <span className="text-foreground">{auteur}</span></span>
          {depuis && <span>· {depuis}</span>}
          <span>· {formatDate(p.created_at)}</span>
        </div>
      </div>
      <Select value={unite} onValueChange={(v) => setUnite(v as Unite)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{UNITES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
      </Select>
      <Input type="number" step="0.05" value={prix} onChange={e => setPrix(Number(e.target.value))} className="h-8 text-right text-sm num-tabular" />
      <div className="flex items-center gap-1 justify-end">
        <Button size="sm" onClick={onValider} disabled={busy}><Check className="w-4 h-4 mr-1" />Valider</Button>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => rejeter.mutate(p.id, { onSuccess: () => toast.success('Proposition rejetée') })}>
          <X className="w-4 h-4 mr-1" />Rejeter
        </Button>
      </div>
    </div>
  );
}

// Grille tarifs proposée juste après validation (dialog contrôlé, réutilise TarifsGrid).
function TarifsApresValidation({ prestation, onClose }: { prestation: Prestation | null; onClose: () => void }) {
  const { data: categories = [] } = useCategoriesTarifaires();
  const catsClient = useMemo(() => categories.filter((c) => c.type === 'client').sort((a, b) => a.ordre - b.ordre), [categories]);
  const upsert = useUpsertTarif();
  const del = useDeleteTarif();
  if (!prestation) return null;
  const value: Record<string, TarifValue> = Object.fromEntries((prestation.tarifs ?? []).map((t) => [t.categorie_id, { mode: t.mode, valeur: t.valeur }]));
  return (
    <Dialog open={!!prestation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Grille tarifs — {prestation.libelle}</DialogTitle></DialogHeader>
        <div className="text-xs text-muted-foreground">Prestation validée. Définis les prix par catégorie (sinon le prix de référence s'applique).</div>
        <TarifsGrid
          categories={catsClient}
          prixReference={prestation.prix_vente_reference}
          value={value}
          pending={upsert.isPending || del.isPending}
          onSet={(catId, mode, valeur) => upsert.mutate({ prestation_id: prestation.id, categorie_id: catId, mode, valeur }, { onSuccess: () => toast.success('Tarif enregistré') })}
          onRemove={(catId) => del.mutate({ prestation_id: prestation.id, categorie_id: catId }, { onSuccess: () => toast.success('Tarif supprimé — prix de référence appliqué') })}
        />
        <DialogFooter><Button onClick={onClose}>Terminer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NouvellePrestationDialog() {
  const create = useCreatePrestation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', famille: '', libelle: '', unite: 'm2' as Unite,
    prix_vente_reference: 0, prix_achat_net: 0, source: '', type_tva: 'standard' as TvaType,
    code_cfc: '', code_cfc_libelle: '',
  });
  const [familleAutre, setFamilleAutre] = useState(false);
  const [postes, setPostes] = useState<{ libelle: string; prix: number; temps: number }[]>([]);
  const [nouveauPoste, setNouveauPoste] = useState({ libelle: '', prix: 0, temps: 0 });
  const [tarifsMap, setTarifsMap] = useState<Record<string, TarifValue>>({});
  const { data: categories = [] } = useCategoriesTarifaires();
  const { data: options } = usePrestationsOptions();
  const familles = options?.familles ?? [];
  const cfcOptions = options?.cfc ?? [];
  const famOpts = useMemo(() => [...new Set([...(form.famille ? [form.famille] : []), ...familles])], [form.famille, familles]);
  const famValue = familleAutre ? NOUVELLE_FAM : (form.famille ? form.famille : AUCUNE_FAM);
  const catsClient = useMemo(() => categories.filter((c) => c.type === 'client').sort((a, b) => a.ordre - b.ordre), [categories]);

  const ajouterPoste = () => {
    if (!nouveauPoste.libelle) return;
    setPostes(ps => [...ps, nouveauPoste]);
    setNouveauPoste({ libelle: '', prix: 0, temps: 0 });
  };
  const move = (i: number, dir: -1 | 1) => {
    const arr = postes.slice();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setPostes(arr);
  };
  const total = postes.reduce((s, p) => s + p.prix, 0);
  const tempsTot = postes.reduce((s, p) => s + p.temps, 0);

  const submit = async () => {
    if (!form.libelle) { toast.error('Libellé requis'); return; }
    const builtPostes: NouveauPoste[] = postes.map(p => ({
      libelle: p.libelle, unite: form.unite, prix_brut: p.prix, temps_par_unite: p.temps || null,
    }));
    try {
      const cfc = form.code_cfc.trim();
      const cfcLib = cfc ? (form.code_cfc_libelle.trim() || cfcOptions.find((c) => c.code === cfc)?.libelle || null) : null;
      await create.mutateAsync({
        prestation: {
          code: form.code || null,
          famille: form.famille.trim() || null,
          libelle: form.libelle,
          unite: form.unite,
          prix_vente_reference: form.prix_vente_reference,
          prix_achat_net: form.prix_achat_net || null,
          source: form.source || 'manuel',
          temps_par_unite: tempsTot || null,
          type_tva: form.type_tva,
          code_cfc: cfc || null,
          code_cfc_libelle: cfcLib,
        },
        postes: builtPostes,
        tarifs: Object.entries(tarifsMap).map(([categorie_id, t]): NouveauTarif => ({ categorie_id, mode: t.mode, valeur: t.valeur })),
      });
      toast.success('Prestation créée');
      setOpen(false);
      setForm({ code: '', famille: '', libelle: '', unite: 'm2', prix_vente_reference: 0, prix_achat_net: 0, source: '', type_tva: 'standard', code_cfc: '', code_cfc_libelle: '' });
      setFamilleAutre(false);
      setPostes([]);
      setTarifsMap({});
    } catch (e) {
      toast.error('Création impossible : ' + (e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nouvelle prestation</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nouvelle prestation</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code / réf interne</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="réf. / CAN interne" /></div>
            <div>
              <Label>Famille</Label>
              <Select value={famValue} onValueChange={(v) => {
                if (v === NOUVELLE_FAM) { setFamilleAutre(true); setForm(f => ({ ...f, famille: '' })); }
                else if (v === AUCUNE_FAM) { setFamilleAutre(false); setForm(f => ({ ...f, famille: '' })); }
                else { setFamilleAutre(false); setForm(f => ({ ...f, famille: v })); }
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUCUNE_FAM}>— aucune —</SelectItem>
                  {famOpts.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  <SelectItem value={NOUVELLE_FAM}>+ Nouvelle famille</SelectItem>
                </SelectContent>
              </Select>
              {familleAutre && <Input value={form.famille} onChange={e => setForm(f => ({ ...f, famille: e.target.value }))} placeholder="Nouvelle famille" className="mt-1.5" autoFocus />}
            </div>
          </div>
          <div>
            <Label>Code CFC <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
            <CfcCombo code={form.code_cfc} libelle={form.code_cfc_libelle} options={cfcOptions}
              onChange={(c, l) => setForm(f => ({ ...f, code_cfc: c, code_cfc_libelle: l }))} />
          </div>
          <div>
            <Label>Libellé prestation</Label>
            {/* Textarea (pas Input) : les descriptifs Artisan Pro font souvent plusieurs
                lignes et le champ mono-ligne en masquait le début (retour client). */}
            <textarea value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })}
              rows={3} placeholder="ex : Pose de carrelage 30×30 sur sol salle de bain"
              className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Unité</Label>
              <Select value={form.unite} onValueChange={(v) => setForm({ ...form, unite: v as Unite })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>TVA</Label>
              <Select value={form.type_tva} onValueChange={(v) => setForm({ ...form, type_tva: v as TvaType })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TVA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Prix vente réf. HT</Label><Input type="number" step="0.05" value={form.prix_vente_reference} onChange={e => setForm({ ...form, prix_vente_reference: Number(e.target.value) })} className="mt-1" /></div>
            <div><Label className="text-xs">Prix achat net</Label><Input type="number" step="0.05" value={form.prix_achat_net} onChange={e => setForm({ ...form, prix_achat_net: Number(e.target.value) })} className="mt-1" /></div>
            <div><Label className="text-xs">Source</Label><Input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="manuel / clotures…" className="mt-1" /></div>
          </div>

          <div className="border-t pt-3">
            <Label className="text-xs uppercase">Postes (étapes techniques)</Label>
            <div className="space-y-1 mt-2">
              {postes.map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                  <span className="flex-1 text-sm">{p.libelle}</span>
                  <span className="text-xs num-tabular w-24 text-right">{formatCHF(p.prix)}</span>
                  <span className="text-xs num-tabular w-16 text-right">{formatHeures(p.temps)}</span>
                  <button onClick={() => move(i, -1)} className="text-xs text-muted-foreground hover:text-foreground">▲</button>
                  <button onClick={() => move(i, 1)} className="text-xs text-muted-foreground hover:text-foreground">▼</button>
                  <button onClick={() => setPostes(ps => ps.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2 mt-2">
              <div className="flex-1"><Label className="text-xs">Libellé</Label><Input value={nouveauPoste.libelle} onChange={e => setNouveauPoste({ ...nouveauPoste, libelle: e.target.value })} className="h-8" /></div>
              <div className="w-24"><Label className="text-xs">Prix</Label><Input type="number" value={nouveauPoste.prix} onChange={e => setNouveauPoste({ ...nouveauPoste, prix: Number(e.target.value) })} className="h-8" /></div>
              <div className="w-20"><Label className="text-xs">Temps (h)</Label><Input type="number" step="0.1" value={nouveauPoste.temps} onChange={e => setNouveauPoste({ ...nouveauPoste, temps: Number(e.target.value) })} className="h-8" /></div>
              <Button size="sm" onClick={ajouterPoste}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
            {postes.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground text-right">
                Total prestation : <span className="num-tabular font-medium text-foreground">{formatCHF(total)}</span> · {formatHeures(tempsTot)}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <Label className="text-xs uppercase">Tarifs par catégorie (optionnel)</Label>
            <div className="text-[11px] text-muted-foreground mb-2">Sans tarif, une catégorie applique le prix de référence. Le calcul utilise le prix de vente de référence saisi ci-dessus.</div>
            <TarifsGrid
              categories={catsClient}
              prixReference={form.prix_vente_reference}
              value={tarifsMap}
              onSet={(catId, mode, valeur) => setTarifsMap((m) => ({ ...m, [catId]: { mode, valeur } }))}
              onRemove={(catId) => setTarifsMap((m) => { const n = { ...m }; delete n[catId]; return n; })}
            />
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
