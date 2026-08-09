import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/Badges';
import { CategorieChip } from '@/components/ChantierBadges';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, UserPlus, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatDate } from '@/lib/format';
import { ArchivedToggle } from '@/components/ArchivedToggle';
import { useClients, useCreateClient, useUpdateClient, useArchiveClient, type Client } from '@/lib/queries/clients';
import { useDevisList } from '@/lib/queries/devis';
import { useChantiersList, useCreateChantier } from '@/lib/queries/chantiers';
import { useEntites } from '@/lib/queries/entites';
import { useCategoriesTarifaires } from '@/lib/queries/categories';
import { toast } from 'sonner';
import { CLE_BROUILLON_CLIENT, lireBrouillon, ecrireBrouillon, effacerBrouillon } from '@/lib/brouillon';

export const Route = createFileRoute('/clients/')({ component: ClientsPage });

export function ClientAvatar({ nom, size = 'md' }: { nom: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = nom.split(/[ ']/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  const dim = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${dim} bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold shrink-0`}>
      {initials || '?'}
    </div>
  );
}

export function relativeDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date('2026-05-21T12:00:00');
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return formatDate(iso);
}

function ClientsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');

  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: clientsData = [], isLoading, isError, error } = useClients(includeArchived);
  const { data: allDevis = [] } = useDevisList();
  const { data: allChantiers = [] } = useChantiersList();
  const { data: categories = [] } = useCategoriesTarifaires();
  const archiveClient = useArchiveClient();
  const categoriesClient = categories.filter(c => c.type === 'client');
  const [openNew, setOpenNew] = useState(false);

  const clients = useMemo(() => clientsData
    .filter(c => cat === 'all' || c.categorie?.code === cat)
    .filter(c => !q.trim() || c.nom.toLowerCase().includes(q.toLowerCase()) || (c.ville ?? '').toLowerCase().includes(q.toLowerCase())),
    [clientsData, cat, q]);

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} client${clients.length > 1 ? 's' : ''} affiché${clients.length > 1 ? 's' : ''}`}
        actions={<Button onClick={() => setOpenNew(true)} className="w-full md:w-auto"><Plus className="w-4 h-4 mr-1" />Nouveau client</Button>}
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client par nom ou ville…" className="pl-9" />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-full md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes catégories</SelectItem>
              {categoriesClient.map(c => <SelectItem key={c.id} value={c.code}>{c.libelle}</SelectItem>)}
            </SelectContent>
          </Select>
          <ArchivedToggle value={includeArchived} onChange={setIncludeArchived} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 md:overflow-x-auto">
          {/* Cartes mobiles */}
          <div className="md:hidden divide-y">
            {isLoading ? <div className="py-10 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></div>
              : isError ? <div className="py-10 text-center text-destructive text-sm">Erreur de chargement.</div>
              : clients.length === 0 ? <div className="py-10 text-center text-muted-foreground text-sm">{clientsData.length === 0 ? 'Aucun client. Crée le premier.' : 'Aucun client ne correspond aux filtres.'}</div>
              : clients.map(c => {
                const devisClient = allDevis.filter(d => d.client_id === c.id);
                const lastDevis = devisClient.map(d => d.created_at).sort().pop();
                const nbChantiers = allChantiers.filter(ch => ch.client_id === c.id).length;
                return (
                  <div key={c.id} onClick={() => nav({ to: '/clients/$id', params: { id: c.id } })} className={`p-3 cursor-pointer ${c.archive_at ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-3">
                      <ClientAvatar nom={c.nom} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.nom}{c.archive_at && <span className="ml-2 text-[10px] uppercase text-muted-foreground">archivé</span>}</div>
                        <div className="text-xs text-muted-foreground truncate">{[c.ville, c.telephone].filter(Boolean).join(' · ')}</div>
                      </div>
                      <CategorieChip libelle={c.categorie?.libelle} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                      <span className="num-tabular">{devisClient.length} devis · {nbChantiers} chantier{nbChantiers > 1 ? 's' : ''}</span>
                      <span>{relativeDate(lastDevis || c.created_at)}</span>
                    </div>
                  </div>
                );
              })}
          </div>
          {/* Tableau desktop */}
          <table className="hidden md:table w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3">Catégorie</th>
                <th className="text-left px-4 py-3">Adresse</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-right px-4 py-3">Devis</th>
                <th className="text-right px-4 py-3">Chantiers</th>
                <th className="text-left px-4 py-3">Dernière activité</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const devisClient = allDevis.filter(d => d.client_id === c.id);
                const lastDevis = devisClient.map(d => d.created_at).sort().pop();
                return (
                  <tr key={c.id}
                      onClick={() => nav({ to: '/clients/$id', params: { id: c.id } })}
                      className={`border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors ${c.archive_at ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ClientAvatar nom={c.nom} size="sm" />
                        <div>
                          <div className="font-medium">{c.nom}{c.archive_at && <span className="ml-2 text-[10px] uppercase text-muted-foreground">archivé</span>}</div>
                          <div className="text-xs text-muted-foreground">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CategorieChip libelle={c.categorie?.libelle} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.adresse}<br />{c.ville}</td>
                    <td className="px-4 py-3 text-xs">{c.telephone}</td>
                    <td className="px-4 py-3 text-right num-tabular">{devisClient.length}</td>
                    <td className="px-4 py-3 text-right num-tabular">{allChantiers.filter(ch => ch.client_id === c.id).length}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{relativeDate(lastDevis || c.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {c.archive_at && (
                        <button title="Restaurer" onClick={(e) => { e.stopPropagation(); archiveClient.mutate({ id: c.id, restore: true }, { onSuccess: () => toast.success('Client restauré') }); }} className="text-muted-foreground hover:text-foreground">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {isLoading && <tr><td colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></td></tr>}
              {isError && !isLoading && <tr><td colSpan={8} className="text-center py-10 text-destructive text-sm">Erreur : {(error as Error)?.message}</td></tr>}
              {!isLoading && !isError && clients.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  {clientsData.length === 0 ? 'Aucun client pour le moment. Crée le premier.' : 'Aucun client ne correspond aux filtres.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <NewClientDialog open={openNew} onOpenChange={setOpenNew} onCreated={(id) => nav({ to: '/clients/$id', params: { id } })} />
    </div>
  );
}

// Brouillon local du formulaire client (retour client : quitter l'app pour
// chercher une adresse ne perd plus la saisie).
interface BrouillonClient {
  nom: string; email: string; tel: string; adresse: string; ville: string; categorieId: string;
  chEntiteId: string; chNom: string; chVille: string; chAdresse: string;
}

export function NewClientDialog({ open, onOpenChange, initialName = '', client, onCreated }: { open: boolean; onOpenChange: (b: boolean) => void; initialName?: string; client?: Client; onCreated?: (id: string) => void }) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const createChantier = useCreateChantier();
  const { data: categories = [] } = useCategoriesTarifaires();
  const { data: entites = [] } = useEntites();
  const categoriesClient = categories.filter(c => c.type === 'client');
  const isEdit = !!client;
  const [nom, setNom] = useState(initialName);
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [adresse, setAdresse] = useState('');
  const [ville, setVille] = useState('');
  const [categorieId, setCategorieId] = useState('');
  // Premier chantier — obligatoire à la création (retour client) ; d'autres
  // chantiers peuvent ensuite être ajoutés depuis la fiche client.
  const [chEntiteId, setChEntiteId] = useState('');
  const [chNom, setChNom] = useState('');
  const [chVille, setChVille] = useState('');
  const [chAdresse, setChAdresse] = useState('');

  // À l'ouverture : pré-remplir depuis le client en édition, sinon repartir du nom proposé.
  useEffect(() => {
    if (!open) return;
    if (client) {
      setNom(client.nom ?? '');
      setEmail(client.email ?? '');
      setTel(client.telephone ?? '');
      setAdresse(client.adresse ?? '');
      setVille(client.ville ?? '');
      setCategorieId(client.categorie_tarifaire_id ?? '');
    } else {
      // Reprend le brouillon local s'il existe, sinon champs vierges.
      const b = lireBrouillon<BrouillonClient>(CLE_BROUILLON_CLIENT);
      setNom(b?.nom || initialName); setEmail(b?.email ?? ''); setTel(b?.tel ?? '');
      setAdresse(b?.adresse ?? ''); setVille(b?.ville ?? ''); setCategorieId(b?.categorieId ?? '');
      setChEntiteId(b?.chEntiteId ?? ''); setChNom(b?.chNom ?? ''); setChVille(b?.chVille ?? ''); setChAdresse(b?.chAdresse ?? '');
    }
  }, [open, client, initialName]);

  // Écriture continue du brouillon tant que le dialog de création est ouvert.
  useEffect(() => {
    if (!open || isEdit) return;
    if (!nom.trim() && !email.trim() && !tel.trim() && !adresse.trim() && !ville.trim() && !chNom.trim() && !chEntiteId) return;
    ecrireBrouillon(CLE_BROUILLON_CLIENT, { nom, email, tel, adresse, ville, categorieId, chEntiteId, chNom, chVille, chAdresse } satisfies BrouillonClient);
  }, [open, isEdit, nom, email, tel, adresse, ville, categorieId, chEntiteId, chNom, chVille, chAdresse]);

  const submit = async () => {
    if (!nom.trim()) { toast.error('Nom requis'); return; }
    if (!isEdit) {
      // Le premier chantier est obligatoire (la ville du chantier retombe sur celle du client).
      if (!chEntiteId || !chNom.trim()) { toast.error('Renseigne le premier chantier : entité et nom'); return; }
      if (!chVille.trim() && !ville.trim()) { toast.error('Renseigne la ville (client ou chantier)'); return; }
    }
    const champs = {
      nom: nom.trim(),
      categorie_tarifaire_id: categorieId || null,
      email: email.trim() || null,
      telephone: tel.trim() || null,
      ville: ville.trim() || null,
      adresse: adresse.trim() || null,
    };
    try {
      if (isEdit && client) {
        // La catégorie tarifaire n'est lue qu'à la création d'un devis → ne touche pas aux devis existants.
        await updateClient.mutateAsync({ id: client.id, patch: champs });
        toast.success(`Client « ${nom} » modifié`);
        onOpenChange(false);
        onCreated?.(client.id);
      } else {
        const c = await createClient.mutateAsync(champs);
        effacerBrouillon(CLE_BROUILLON_CLIENT);
        try {
          const ch = await createChantier.mutateAsync({
            entite_id: chEntiteId,
            client_id: c.id,
            nom: chNom.trim(),
            ville: chVille.trim() || ville.trim(),
            adresse: chAdresse.trim() || adresse.trim() || undefined,
          });
          toast.success(`Client « ${nom} » créé avec le chantier ${ch.reference}`);
        } catch (e) {
          // Le client existe déjà : on ne le perd pas, mais on signale le chantier manquant.
          toast.warning(`Client créé, mais chantier non créé : ${(e as Error).message}. Ajoute-le depuis la fiche client.`);
        }
        onOpenChange(false);
        setNom(''); setEmail(''); setTel(''); setAdresse(''); setVille(''); setCategorieId('');
        setChEntiteId(''); setChNom(''); setChVille('');
        onCreated?.(c.id);
      }
    } catch (e) {
      toast.error((isEdit ? 'Modification impossible : ' : 'Création impossible : ') + (e as Error).message);
    }
  };
  const pending = createClient.isPending || updateClient.isPending || createChantier.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />{isEdit ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>Nom</Label><Input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du client" className="mt-1" autoFocus /></div>
          <div className="col-span-2"><Label>Catégorie tarifaire</Label>
            <Select value={categorieId} onValueChange={setCategorieId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {categoriesClient.map(c => <SelectItem key={c.id} value={c.id}>{c.libelle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Adresse</Label><Input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Rue, n°" className="mt-1" /></div>
          <div><Label>Ville</Label><Input value={ville} onChange={e => setVille(e.target.value)} className="mt-1" /></div>
          <div><Label>Téléphone</Label><Input value={tel} onChange={e => setTel(e.target.value)} className="mt-1" /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
          {!isEdit && (
            <div className="col-span-2 rounded-md border p-3 space-y-3 bg-muted/30">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Premier chantier (obligatoire)</div>
              <div>
                <Label>Entité</Label>
                <Select value={chEntiteId} onValueChange={setChEntiteId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Sélectionner l'entité" /></SelectTrigger>
                  <SelectContent>{entites.map(e => <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Nom du chantier</Label><Input value={chNom} onChange={e => setChNom(e.target.value)} placeholder="Ex. Rénovation salle de bain" className="mt-1" /></div>
                <div><Label>Ville du chantier</Label><Input value={chVille} onChange={e => setChVille(e.target.value)} placeholder={ville.trim() ? `${ville.trim()} (ville du client)` : 'Ville'} className="mt-1" /></div>
              </div>
              <div>
                <Label>Adresse du chantier</Label>
                <Input value={chAdresse} onChange={e => setChAdresse(e.target.value)} placeholder={adresse.trim() ? `${adresse.trim()} (adresse du client)` : 'Rue, n°'} className="mt-1" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer le client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
