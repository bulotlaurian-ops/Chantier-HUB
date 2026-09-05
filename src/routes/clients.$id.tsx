import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/Badges";
import { CategorieChip } from "@/components/ChantierBadges";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatEUR, formatEURShort, formatDate } from "@/lib/format";
import { ClientAvatar, NewClientDialog } from "./clients.index";
import { useClient, useArchiveClient, useDeleteClient } from "@/lib/queries/clients";
import { useDevisList } from "@/lib/queries/devis";
import { useChantiersList, useCreateChantier } from "@/lib/queries/chantiers";
import { useEntites } from "@/lib/queries/entites";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CLE_BROUILLON_CHANTIER,
  lireBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
} from "@/lib/brouillon";
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  Mail,
  Phone,
  MapPin,
  Upload,
  Loader2,
  Archive,
  RotateCcw,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

// Message clair quand la base refuse la suppression (données liées, contrainte FK).
export function messageSuppression(e: Error, quoi: string, liens: string): string {
  return /foreign key|violates|23503/i.test(e.message)
    ? `Suppression impossible : ${liens} sont liés à ce ${quoi}. Utilise l'archivage pour le masquer sans perdre l'historique.`
    : `Suppression impossible : ${e.message}`;
}

export const Route = createFileRoute("/clients/$id")({ component: ClientFiche });

// Petit badge neutre pour les statuts (les badges typés seront réconciliés
// avec le schéma DB lors de la migration des vues Devis / Chantiers).
function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
      {children}
    </span>
  );
}

function ClientFiche() {
  const { id } = useParams({ from: "/clients/$id" });
  const { data: c, isLoading } = useClient(id);
  const { data: allDevis = [] } = useDevisList();
  const { data: allChantiers = [] } = useChantiersList();
  const archiveClient = useArchiveClient();
  const deleteClient = useDeleteClient();
  const nav = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [chantierOpen, setChantierOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!c) return <div className="text-sm text-muted-foreground">Client introuvable.</div>;

  const archived = !!c.archive_at;

  const devis = allDevis
    .filter((d) => d.client_id === c.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const chantiers = allChantiers.filter((ch) => ch.client_id === c.id);

  const accepte = devis.filter((d) => d.statut === "accepte");
  const totalCA = accepte.reduce((sum, d) => sum + d.total_ttc, 0);
  const tauxMoy = accepte.length
    ? accepte.reduce((sum, d) => sum + (d.taux_marge ?? 0), 0) / accepte.length
    : 0;
  const devisAcc = accepte.length;
  const devisEnv = devis.filter(
    (d) => d.statut === "envoye" || d.statut === "accepte" || d.statut === "refuse",
  ).length;

  // Documents — maquette (le rattachement réel viendra avec le Storage)
  const documents = [
    ...devis.slice(0, 3).map((d, i) => ({
      id: `doc-d-${i}`,
      type: "pdf" as const,
      name: `Devis ${d.numero}.pdf`,
      date: d.date_creation,
      size: "420 Ko",
    })),
  ];

  return (
    <div>
      <PageHeader
        title={c.nom}
        subtitle={
          <span className="flex items-center gap-2">
            <Link to="/clients" className="text-xs hover:underline">
              ← Tous les clients
            </Link>
            {archived && (
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Archivé
              </span>
            )}
          </span>
        }
        actions={
          archived ? (
            <Button
              variant="outline"
              onClick={() =>
                archiveClient.mutate(
                  { id: c.id, restore: true },
                  { onSuccess: () => toast.success("Client restauré") },
                )
              }
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Restaurer
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-1" />
                Modifier
              </Button>
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Archive className="w-4 h-4 mr-1" />
                    Archiver
                  </Button>
                }
                title={`Archiver le client « ${c.nom} » ?`}
                description="Le client sera masqué des listes mais conservé (restaurable à tout moment)."
                confirmLabel="Archiver"
                onConfirm={() =>
                  archiveClient.mutate(
                    { id: c.id },
                    { onSuccess: () => toast.success("Client archivé") },
                  )
                }
              />
              <ConfirmAction
                trigger={
                  <Button variant="outline" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Supprimer
                  </Button>
                }
                title={`Supprimer définitivement « ${c.nom} » ?`}
                description="Action irréversible : la fiche client sera effacée. Refusé automatiquement si des devis ou chantiers y sont liés — utilise l'archivage dans ce cas."
                confirmLabel="Supprimer définitivement"
                destructive
                requireCheck
                onConfirm={() =>
                  deleteClient.mutate(c.id, {
                    onSuccess: () => {
                      toast.success("Client supprimé");
                      nav({ to: "/clients" });
                    },
                    onError: (e) =>
                      toast.error(
                        messageSuppression(e as Error, "client", "des devis ou chantiers"),
                      ),
                  })
                }
              />
            </div>
          )
        }
      />

      <NewClientDialog open={editOpen} onOpenChange={setEditOpen} client={c} />

      {/* Bloc info en-tête */}
      <Card className="mb-4">
        <CardContent className="p-5 flex items-start gap-5">
          <ClientAvatar nom={c.nom} size="lg" />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CategorieChip libelle={c.categorie?.libelle} />
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mt-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3" />
                  {c.adresse}, {c.ville}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3 h-3" />
                  {c.telephone}
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3 h-3" />
                  {c.email}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground md:col-span-2">
              <div>Client depuis le {formatDate(c.created_at)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="devis">Devis ({devis.length})</TabsTrigger>
          <TabsTrigger value="chantiers">Chantiers ({chantiers.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Total CA généré" value={formatEURShort(totalCA)} />
            <Kpi label="Marge moyenne" value={`${tauxMoy.toFixed(1)}%`} />
            <Kpi label="Devis acceptés / envoyés" value={`${devisAcc} / ${devisEnv}`} />
            <Kpi label="Premier contact" value={formatDate(c.created_at)} />
          </div>
        </TabsContent>

        <TabsContent value="devis" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2">N°</th>
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-4 py-2">Statut</th>
                    <th className="text-right px-4 py-2">Total TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {devis.map((d) => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link
                          to="/devis/$id"
                          params={{ id: d.id }}
                          className="font-mono text-xs hover:underline"
                        >
                          {d.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatDate(d.date_creation)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusPill>{d.statut}</StatusPill>
                      </td>
                      <td className="px-4 py-2 text-right num-tabular">{formatEUR(d.total_ttc)}</td>
                    </tr>
                  ))}
                  {devis.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        Aucun devis pour ce client.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chantiers" className="mt-4">
          {!archived && (
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setChantierOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Nouveau chantier
              </Button>
            </div>
          )}
          <NouveauChantierClientDialog
            open={chantierOpen}
            onOpenChange={setChantierOpen}
            clientId={c.id}
            villeDefaut={c.ville ?? ""}
            adresseDefaut={c.adresse ?? ""}
          />
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2">Référence</th>
                    <th className="text-left px-4 py-2">Nom</th>
                    <th className="text-left px-4 py-2">Statut</th>
                    <th className="text-left px-4 py-2">Période</th>
                  </tr>
                </thead>
                <tbody>
                  {chantiers.map((ch) => (
                    <tr key={ch.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link
                          to="/chantiers/$id"
                          params={{ id: ch.id }}
                          className="font-mono text-xs hover:underline"
                        >
                          {ch.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{ch.nom}</td>
                      <td className="px-4 py-2">
                        <StatusPill>{ch.statut}</StatusPill>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatDate(ch.date_debut ?? "")} → {formatDate(ch.date_fin_prevue ?? "")}
                      </td>
                    </tr>
                  ))}
                  {chantiers.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-muted-foreground text-sm"
                      >
                        Aucun chantier pour ce client.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucun document encore. Glisse-dépose des fichiers pour les rattacher à ce client.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {documents.map((doc) => {
                const Icon =
                  doc.type === "pdf"
                    ? FileText
                    : doc.type === "image"
                      ? FileImage
                      : FileSpreadsheet;
                const color = doc.type === "pdf" ? "text-destructive" : "text-success";
                return (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <Icon className={`w-8 h-8 mb-2 ${color}`} />
                      <div className="text-xs font-medium truncate">{doc.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {formatDate(doc.date)} · {doc.size}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1 num-tabular">{value}</div>
      </CardContent>
    </Card>
  );
}

// Création d'un chantier depuis la fiche client (client fixé, ville/adresse pré-remplies).
// Un client peut avoir autant de chantiers que nécessaire (relation 1-N en base).
function NouveauChantierClientDialog({
  open,
  onOpenChange,
  clientId,
  villeDefaut,
  adresseDefaut,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  clientId: string;
  villeDefaut: string;
  adresseDefaut: string;
}) {
  const { data: entites = [] } = useEntites();
  const create = useCreateChantier();
  const [entiteId, setEntiteId] = useState("");
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reprend le brouillon local s'il existe (la saisie survit à une sortie de l'app).
    const b = lireBrouillon<{ entiteId: string; nom: string; ville: string; adresse: string }>(
      CLE_BROUILLON_CHANTIER,
    );
    setEntiteId(b?.entiteId ?? "");
    setNom(b?.nom ?? "");
    setVille(b?.ville || villeDefaut);
    setAdresse(b?.adresse || adresseDefaut);
  }, [open, villeDefaut, adresseDefaut]);

  useEffect(() => {
    if (!open) return;
    if (!nom.trim() && !entiteId) return;
    ecrireBrouillon(CLE_BROUILLON_CHANTIER, { entiteId, nom, ville, adresse });
  }, [open, entiteId, nom, ville, adresse]);

  const submit = async () => {
    if (!entiteId || !nom.trim() || !ville.trim()) {
      toast.error("Renseigne entité, nom et ville");
      return;
    }
    try {
      const ch = await create.mutateAsync({
        entite_id: entiteId,
        client_id: clientId,
        nom: nom.trim(),
        ville: ville.trim(),
        adresse: adresse.trim() || undefined,
      });
      toast.success(`Chantier ${ch.reference} créé`);
      effacerBrouillon(CLE_BROUILLON_CHANTIER);
      onOpenChange(false);
    } catch (e) {
      toast.error("Création impossible : " + (e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau chantier</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Entité</Label>
            <Select value={entiteId} onValueChange={setEntiteId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner l'entité" />
              </SelectTrigger>
              <SelectContent>
                {entites.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nom du chantier</Label>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. Rénovation salle de bain"
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Ville</Label>
              <Input value={ville} onChange={(e) => setVille(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Adresse</Label>
              <Input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="Rue, n°"
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Créer le chantier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
