import { createFileRoute, useNavigate, Link, useBlocker } from "@tanstack/react-router";
import { PageHeader } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trash2,
  Save,
  Loader2,
  Plus,
  BookmarkPlus,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Library,
  Mic,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { todayIso } from "@/lib/devis-utils";
import { addDays, formatEUR, pct } from "@/lib/format";
import { useEntites } from "@/lib/queries/entites";
import { useClients } from "@/lib/queries/clients";
import { useChantiersList } from "@/lib/queries/chantiers";
import {
  usePrestations,
  ligneDepuisPrestation,
  ligneLibre,
  type LigneDevisChamps,
  type Prestation,
} from "@/lib/queries/prestations";
import { PrestationPicker } from "@/components/PrestationPicker";
import { AjouterBiblioDialog, type AjoutBiblioDefaults } from "@/components/AjouterBiblioDialog";
import { ConditionsTemplates } from "@/components/ConditionsTemplates";
import { normUnite } from "@/lib/import-fichier";
import { useTauxTvaCourants } from "@/lib/queries/tva";
import { useParametres, paramNumber } from "@/lib/queries/parametres";
import { useConditionsPaiement, conditionParDefaut } from "@/lib/queries/conditions";
import { useCreateDevis, useUpdateDevisComplet, useDevis } from "@/lib/queries/devis";
import { usePrestationPacks } from "@/lib/queries/packs";
import { useAuth } from "@/lib/auth";
import { DevisIA, type OpResolue } from "@/components/DevisIA";
import {
  CLE_BROUILLON_DEVIS,
  lireBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
} from "@/lib/brouillon";
import { DevisImportPDF } from "@/components/DevisImportPDF";
import type { DevisIAContexte } from "@/lib/devis-ia";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/devis/nouveau")({
  component: NouveauDevis,
  validateSearch: (s: Record<string, unknown>): { edit?: string } =>
    typeof s.edit === "string" ? { edit: s.edit } : {},
});

interface LigneForm {
  uid: number;
  id?: string; // id DB lignes_devis (présent en édition) → ciblage par l'IA
  prestation_id: string | null;
  code: string | null;
  libelle: string;
  unite: string | null;
  quantite: number;
  prix_unitaire_ht: number;
  prix_revient_unitaire: number;
  taux_tva: number;
  temps_par_unite: number | null;
  // Préservés à l'édition (pas éditables ici) :
  remise_pct: number;
  est_option: boolean;
  est_titre: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Brouillon local de l'éditeur (retour client : la saisie survit à une sortie de l'app).
interface BrouillonDevis {
  edit: string | null;
  entiteId: string;
  clientId: string;
  chantierId: string;
  objet: string;
  conditions: string;
  notes: string;
  lignes: LigneForm[];
  uidMax: number;
}

// Unités proposées dans l'éditeur (mêmes valeurs que l'enum `unite` en base).
const UNITES_DEVIS = [
  { value: "m2", label: "m²" },
  { value: "ml", label: "ml" },
  { value: "pce", label: "pce" },
  { value: "u", label: "u" },
  { value: "h", label: "h" },
  { value: "fft", label: "fft" },
  { value: "forfait", label: "forfait" },
];

function NouveauDevis() {
  const nav = useNavigate();
  const { data: entites = [] } = useEntites();
  const { data: clients = [] } = useClients();
  const { data: chantiers = [] } = useChantiersList();
  const { data: prestations = [] } = usePrestations();
  const { data: tvaCourants } = useTauxTvaCourants();
  const { data: params } = useParametres();
  const create = useCreateDevis();
  const update = useUpdateDevisComplet();
  const { edit } = Route.useSearch();
  const isEdit = !!edit;
  const { data: devisEdit } = useDevis(edit ?? "");
  const { profile } = useAuth();
  const isOuvrier = profile?.role === "ouvrier";

  const [entiteId, setEntiteId] = useState("");
  const [clientId, setClientId] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [lignes, setLignes] = useState<LigneForm[]>([]);
  const [conditions, setConditions] = useState("");
  const [objet, setObjet] = useState("");
  const [notes, setNotes] = useState("");
  // Vue mobile « bibliothèque d'abord » : étape sélection → ajout de lignes (biblio en direct,
  // dictée IA et import PDF accessibles sur demande, plus jamais ouverts par défaut).
  const [mobileEtape, setMobileEtape] = useState<"selection" | "micro">(
    isEdit ? "micro" : "selection",
  );
  const [mobileImport, setMobileImport] = useState(false);
  const [mobileBiblio, setMobileBiblio] = useState(false); // tiroir "Depuis la bibliothèque" (mobile)
  const [mobileDictee, setMobileDictee] = useState(false); // tiroir "Dicter le devis" (mobile) — sur demande
  const [editUid, setEditUid] = useState<number | null>(null); // ligne en édition (mini-dialog mobile)
  const [ajoutBiblio, setAjoutBiblio] = useState<AjoutBiblioDefaults | null>(null); // ligne → ajout biblio
  const uidRef = useRef(1);
  const autoCondKey = useRef("");
  const prefilled = useRef(false);

  // ---- Garde-fou navigation : devis avec lignes non enregistrées ----
  // Dirty = au moins une ligne présente et pas encore enregistré (§ saisie devis).
  const savedRef = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = lignes.length > 0 && !savedRef.current;
  const {
    status: blockStatus,
    proceed,
    reset,
  } = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  // ---- Brouillon local (localStorage) : quitter l'app (autre onglet, retour
  // arrière…) ne perd plus la saisie. Restauré à l'arrivée, écrit en continu,
  // effacé uniquement à l'enregistrement réussi ou via « Repartir à zéro ».
  const brouillonPret = useRef(false);
  useEffect(() => {
    if (brouillonPret.current) return;
    brouillonPret.current = true;
    const b = lireBrouillon<BrouillonDevis>(CLE_BROUILLON_DEVIS);
    if (!b || (b.edit ?? null) !== (edit ?? null)) return;
    if (!b.lignes?.length && !b.objet && !b.notes && !b.clientId) return;
    setEntiteId(b.entiteId);
    setClientId(b.clientId);
    setChantierId(b.chantierId);
    setObjet(b.objet);
    setConditions(b.conditions);
    setNotes(b.notes);
    setLignes(b.lignes ?? []);
    uidRef.current = (b.uidMax ?? 0) + 1;
    prefilled.current = true; // le pré-remplissage édition ne ré-écrase pas la reprise
    autoCondKey.current = `${b.entiteId}|${b.clientId}`; // idem pour les conditions auto
    if (b.lignes?.length) setMobileEtape("micro");
    toast.info("Saisie précédente restaurée", {
      action: {
        label: "Repartir à zéro",
        onClick: () => {
          effacerBrouillon(CLE_BROUILLON_DEVIS);
          window.location.reload();
        },
      },
    });
  }, [edit]);

  useEffect(() => {
    if (!brouillonPret.current) return;
    if (!lignes.length && !objet.trim() && !notes.trim() && !clientId) return;
    ecrireBrouillon(CLE_BROUILLON_DEVIS, {
      edit: edit ?? null,
      entiteId,
      clientId,
      chantierId,
      objet,
      conditions,
      notes,
      lignes,
      uidMax: uidRef.current,
    } satisfies BrouillonDevis);
  }, [edit, entiteId, clientId, chantierId, objet, conditions, notes, lignes]);

  // Pré-remplissage en mode édition (une seule fois, à l'arrivée du devis).
  useEffect(() => {
    if (!edit || !devisEdit || prefilled.current) return;
    prefilled.current = true;
    setEntiteId(devisEdit.entite_id);
    setClientId(devisEdit.client_id);
    setChantierId(devisEdit.chantier_id ?? "");
    setObjet(devisEdit.objet ?? "");
    setConditions(devisEdit.conditions_paiement ?? "");
    setNotes(devisEdit.notes ?? "");
    autoCondKey.current = `${devisEdit.entite_id}|${devisEdit.client_id}`; // n'écrase pas les conditions chargées
    setLignes(
      devisEdit.lignes.map((l) => ({
        uid: uidRef.current++,
        id: l.id,
        prestation_id: l.prestation_id,
        code: l.code,
        libelle: l.libelle,
        unite: l.unite,
        quantite: l.quantite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        prix_revient_unitaire: l.prix_revient_unitaire,
        taux_tva: l.taux_tva,
        temps_par_unite: l.temps_par_unite,
        remise_pct: l.remise_pct,
        est_option: l.est_option,
        est_titre: l.est_titre,
      })),
    );
  }, [edit, devisEdit]);

  const client = clients.find((c) => c.id === clientId);
  const categorieId = client?.categorie_tarifaire_id ?? null;
  const conditionsQ = useConditionsPaiement(entiteId || undefined);
  // Chantiers proposés : ceux de l'entité choisie (l'entité est portée par le chantier, §4)
  // Chantiers proposés : uniquement ceux du CLIENT sélectionné (et de l'entité le cas échéant).
  const chantiersClient = chantiers.filter(
    (ch) => !!clientId && ch.client_id === clientId && (!entiteId || ch.entite_id === entiteId),
  );

  // Pré-remplit les conditions de paiement à la sélection entité+client (modifiable ensuite).
  useEffect(() => {
    if (!entiteId || !clientId || !conditionsQ.data) return;
    const key = `${entiteId}|${clientId}`;
    if (autoCondKey.current === key) return;
    autoCondKey.current = key;
    const def = conditionParDefaut(conditionsQ.data, client?.categorie?.code);
    if (def) setConditions(def);
  }, [entiteId, clientId, conditionsQ.data, client?.categorie?.code]);

  const tauxStandard = tvaCourants?.["standard"] ?? 0;
  const codeEntiteDevis = entites.find((e) => e.id === entiteId)?.code ?? null;

  // ---- Prestations liées (packs) : proposition à l'ajout ----
  const { data: packs = [] } = usePrestationPacks();
  const packMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const k of packs)
      m.set(k.prestation_id, [...(m.get(k.prestation_id) ?? []), k.prestation_liee_id]);
    return m;
  }, [packs]);
  const prestaById = useMemo(() => new Map(prestations.map((p) => [p.id, p])), [prestations]);
  const [propositionLiees, setPropositionLiees] = useState<Prestation[] | null>(null);
  const [lieesChecked, setLieesChecked] = useState<Set<string>>(new Set());

  // Collecte les prestations liées (non déjà présentes) aux prestations qu'on vient d'ajouter.
  const proposerLiees = (ajoutIds: string[]) => {
    const dejaPresent = new Set<string>([
      ...ajoutIds,
      ...lignes.map((l) => l.prestation_id).filter((id): id is string => !!id),
    ]);
    const lieeIds = new Set<string>();
    for (const id of ajoutIds)
      for (const lid of packMap.get(id) ?? []) if (!dejaPresent.has(lid)) lieeIds.add(lid);
    const liees = [...lieeIds].map((id) => prestaById.get(id)).filter((p): p is Prestation => !!p);
    if (liees.length) {
      setPropositionLiees(liees);
      setLieesChecked(new Set(liees.map((l) => l.id)));
    }
  };

  const ajouterLieesSelectionnees = () => {
    const choisies = (propositionLiees ?? []).filter((l) => lieesChecked.has(l.id));
    if (choisies.length) {
      setLignes((ls) => [
        ...ls,
        ...choisies.map((l) => ({
          uid: uidRef.current++,
          ...ligneDepuisPrestation(l, categorieId, tvaCourants, tauxStandard),
        })),
      ]);
    }
    setPropositionLiees(null);
  };
  const toggleLiee = (id: string, checked: boolean) =>
    setLieesChecked((s) => {
      const n = new Set(s);
      checked ? n.add(id) : n.delete(id);
      return n;
    });

  // Ajout depuis le sélecteur via le MÊME helper que l'IA (résolution de prix identique, §5).
  const ajouterPrestation = (p: Prestation) => {
    setLignes((ls) => [
      ...ls,
      {
        uid: uidRef.current++,
        ...ligneDepuisPrestation(p, categorieId, tvaCourants, tauxStandard),
      },
    ]);
    proposerLiees([p.id]);
  };

  const ajouterLigneLibre = () => {
    setLignes((ls) => [...ls, { uid: uidRef.current++, ...ligneLibre("", null, 1, tauxStandard) }]);
  };

  // Titre de catégorie (est_titre) : bandeau de section dans le devis + sous-total auto dans le PDF.
  const ajouterTitre = () => {
    setLignes((ls) => [
      ...ls,
      { uid: uidRef.current++, ...ligneLibre("", null, 1, tauxStandard, { est_titre: true }) },
    ]);
  };

  // Mobile : ajoute une ligne vide ET ouvre directement le mini-dialog dessus.
  const ajouterLigneMobile = () => {
    const uid = uidRef.current; // = uid de la ligne qui va être ajoutée
    ajouterLigneLibre();
    setEditUid(uid);
  };

  const ajouterTitreMobile = () => {
    const uid = uidRef.current;
    ajouterTitre();
    setEditUid(uid);
  };

  // Mobile : sélection depuis la bibliothèque (même helper que le PC), puis ouverture
  // immédiate du mini-dialog pour ajuster la quantité.
  const choisirPrestationMobile = (p: Prestation) => {
    const uid = uidRef.current;
    ajouterPrestation(p);
    setMobileBiblio(false);
    setEditUid(uid);
  };

  // N° de poste affiché : même règle que le PDF (compteur continu qui saute les titres).
  const positions = useMemo(() => {
    const m = new Map<number, number>();
    let p = 0;
    for (const l of lignes) if (!l.est_titre) m.set(l.uid, ++p);
    return m;
  }, [lignes]);

  // ---- Réordonnancement (drag & drop desktop, flèches mobile) ----
  // Une ligne appartient à la catégorie (est_titre) qui la précède : la glisser
  // sous un titre = l'assigner à cette catégorie (même modèle que le PDF).
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLignes((ls) => {
      const from = ls.findIndex((l) => l.uid === active.id);
      const to = ls.findIndex((l) => l.uid === over.id);
      if (from < 0 || to < 0) return ls;
      return arrayMove(ls, from, to);
    });
  };
  const deplacerLigne = (uid: number, dir: -1 | 1) =>
    setLignes((ls) => {
      const i = ls.findIndex((l) => l.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      return arrayMove(ls, i, j);
    });

  // Pré-remplit le dialog « Ajouter à la bibliothèque » depuis une ligne du devis.
  const ouvrirAjoutBiblio = (l: LigneForm) =>
    setAjoutBiblio({
      libelle: l.libelle,
      famille: null,
      prix_achat_net: r2(l.quantite * l.prix_unitaire_ht),
      unite: normUnite(l.unite),
      fournisseur: null,
    });

  // ---- Insertion / application des propositions IA ----
  const insererLignesIA = (champs: LigneDevisChamps[]) => {
    setLignes((ls) => [...ls, ...champs.map((c) => ({ uid: uidRef.current++, ...c }))]);
    proposerLiees(champs.map((c) => c.prestation_id).filter((id): id is string => !!id));
  };

  const appliquerOpsIA = (ops: OpResolue[]) =>
    setLignes((ls) => {
      let next = [...ls];
      for (const op of ops) {
        if (op.kind === "add") next.push({ uid: uidRef.current++, ...op.champs });
        else if (op.kind === "delete") next = next.filter((l) => l.id !== op.id);
        else if (op.kind === "modify")
          next = next.map((l) =>
            l.id === op.id
              ? {
                  ...l,
                  ...(op.champs.designation != null ? { libelle: op.champs.designation } : {}),
                  ...(op.champs.quantite != null ? { quantite: op.champs.quantite } : {}),
                  ...(op.champs.unite !== undefined ? { unite: op.champs.unite } : {}),
                  ...(op.champs.est_option != null ? { est_option: op.champs.est_option } : {}),
                }
              : l,
          );
      }
      return next;
    });

  const patchLigne = (uid: number, patch: Partial<LigneForm>) =>
    setLignes((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const supprimerLigne = (uid: number) => setLignes((ls) => ls.filter((l) => l.uid !== uid));

  // Totaux + marge DÉRIVÉE (§5). Les lignes titre/option ne sont pas totalisées.
  // Total TTC arrondi au centime (aucun arrondi de caisse en France).
  const totaux = useMemo(() => {
    const fact = lignes.filter((l) => !l.est_titre && !l.est_option);
    const total_ht = r2(fact.reduce((s, l) => s + l.quantite * l.prix_unitaire_ht, 0));
    const total_tva = r2(
      fact.reduce((s, l) => s + l.quantite * l.prix_unitaire_ht * (l.taux_tva / 100), 0),
    );
    const cout_revient_total = r2(
      fact.reduce((s, l) => s + l.quantite * l.prix_revient_unitaire, 0),
    );
    const marge_estimee = r2(total_ht - cout_revient_total);
    const taux_marge = total_ht > 0 ? r2((marge_estimee / total_ht) * 100) : 0;
    const ttcBrut = total_ht + total_tva;
    const total_ttc = r2(ttcBrut);
    const arrondi = r2(total_ttc - ttcBrut);
    return {
      total_ht,
      total_tva,
      total_ttc,
      arrondi,
      cout_revient_total,
      marge_estimee,
      taux_marge,
    };
  }, [lignes]);

  const seuilAlerte = paramNumber(params, "marge_seuil_alerte_pct", 15);
  const seuilOk = paramNumber(params, "marge_seuil_ok_pct", 22);
  const margeColor =
    totaux.taux_marge < seuilAlerte
      ? "text-destructive"
      : totaux.taux_marge < seuilOk
        ? "text-warning-foreground"
        : "text-success";

  // Contexte transmis à l'IA. En édition, on envoie les lignes courantes avec leur id DB.
  const contexteIA: DevisIAContexte = {
    entite_code: entites.find((e) => e.id === entiteId)?.code ?? "",
    client: {
      id: clientId,
      nom: client?.nom ?? "",
      categorie_tarifaire: client?.categorie?.code ?? null,
    },
    ...(isEdit
      ? {
          devis_courant: {
            lignes: lignes
              .filter((l) => l.id)
              .map((l) => ({
                id: l.id!,
                designation: l.libelle,
                unite: l.unite,
                quantite: l.quantite,
                est_titre: l.est_titre,
                est_option: l.est_option,
              })),
          },
        }
      : {}),
  };

  const enregistrer = async () => {
    if (!entiteId || !clientId) {
      toast.error("Entité et client requis");
      return;
    }
    if (lignes.length === 0) {
      toast.error("Ajoute au moins une ligne");
      return;
    }
    if (lignes.some((l) => !l.libelle.trim())) {
      toast.error("Chaque ligne doit avoir un libellé");
      return;
    }

    const lignesPayload = lignes.map((l, i) => ({
      ordre: i,
      prestation_id: l.prestation_id,
      code: l.code,
      libelle: l.libelle,
      quantite: l.quantite,
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_pct: l.remise_pct,
      prix_revient_unitaire: l.prix_revient_unitaire,
      taux_tva: l.taux_tva,
      total_ht: l.est_titre || l.est_option ? 0 : r2(l.quantite * l.prix_unitaire_ht),
      est_option: l.est_option,
      est_titre: l.est_titre,
      temps_par_unite: l.temps_par_unite,
    }));
    const champs = {
      entite_id: entiteId,
      client_id: clientId,
      chantier_id: chantierId || null,
      total_ht: totaux.total_ht,
      total_tva: totaux.total_tva,
      total_ttc: totaux.total_ttc,
      arrondi: totaux.arrondi,
      cout_revient_total: totaux.cout_revient_total,
      marge: totaux.marge_estimee,
      taux_marge: totaux.taux_marge,
      conditions_paiement: conditions.trim() || null,
      objet: objet.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit && edit && devisEdit) {
        await update.mutateAsync({ id: edit, devis: champs, lignes: lignesPayload });
        toast.success(`Devis ${devisEdit.numero} mis à jour`);
        savedRef.current = true;
        dirtyRef.current = false; // plus de garde-fou après enregistrement
        effacerBrouillon(CLE_BROUILLON_DEVIS);
        nav({ to: "/devis/$id", params: { id: edit } });
      } else {
        const today = todayIso();
        const entite = entites.find((e) => e.id === entiteId);
        const d = await create.mutateAsync({
          devis: {
            ...champs,
            date_creation: today,
            date_validite: addDays(today, entite?.validite_devis_jours ?? 30),
            statut: "brouillon",
            coefficient_global: 1, // moteur FG/coefficient = Lot 2
            fg_valeur: 0,
          },
          lignes: lignesPayload,
        });
        toast.success(`Devis ${d.numero} créé`);
        savedRef.current = true;
        dirtyRef.current = false; // plus de garde-fou après enregistrement
        effacerBrouillon(CLE_BROUILLON_DEVIS);
        nav({ to: "/devis/$id", params: { id: d.id } });
      }
    } catch (e) {
      toast.error("Enregistrement impossible : " + (e as Error).message);
    }
  };

  // Garde : un devis émis n'est pas éditable (lecture seule + duplication côté fiche).
  if (isEdit && devisEdit && devisEdit.statut !== "brouillon") {
    return (
      <div className="text-sm text-muted-foreground">
        Ce devis ({devisEdit.numero}) n'est pas un brouillon : l'édition en place est désactivée.{" "}
        <Link to="/devis/$id" params={{ id: edit! }} className="text-primary hover:underline">
          Voir le devis
        </Link>
        .
      </div>
    );
  }
  if (isEdit && !devisEdit) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* ===================== Desktop — strictement inchangé ===================== */}
      <div className="hidden md:block">
        <PageHeader
          title={isEdit ? `Modifier le devis ${devisEdit?.numero ?? ""}` : "Nouveau devis"}
        />

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {/* Import devis fournisseur (PDF / Excel) — en haut, bien visible */}
            <DevisImportPDF
              contexte={contexteIA}
              tauxStandard={tauxStandard}
              pret={!!entiteId && !!clientId}
              onInserer={insererLignesIA}
            />

            {/* En-tête */}
            <Card>
              <CardContent className="p-4 grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Entité</Label>
                  <Select
                    value={entiteId}
                    onValueChange={(v) => {
                      setEntiteId(v);
                      setChantierId("");
                    }}
                  >
                    <SelectTrigger className="mt-1 h-12 md:h-9">
                      <SelectValue placeholder="Entité" />
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
                  <Label>Client</Label>
                  <Select
                    value={clientId}
                    onValueChange={(v) => {
                      setClientId(v);
                      setChantierId("");
                    }}
                  >
                    <SelectTrigger className="mt-1 h-12 md:h-9">
                      <SelectValue placeholder="Client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Chantier (option)</Label>
                  <Select value={chantierId} onValueChange={setChantierId} disabled={!clientId}>
                    <SelectTrigger className="mt-1 h-12 md:h-9">
                      <SelectValue placeholder={clientId ? "—" : "Choisis d'abord un client"} />
                    </SelectTrigger>
                    <SelectContent>
                      {chantiersClient.map((ch) => (
                        <SelectItem key={ch.id} value={ch.id}>
                          {ch.reference} — {ch.nom}
                        </SelectItem>
                      ))}
                      {chantiersClient.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Aucun chantier pour ce client — crée-le depuis sa fiche.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {client && (
                  <div className="sm:col-span-3 text-xs text-muted-foreground">
                    Catégorie tarifaire du client :{" "}
                    <span className="font-medium text-foreground">
                      {client.categorie?.libelle ?? "non définie"}
                    </span>{" "}
                    — les prix sont pré-remplis depuis la bibliothèque puis ajustables.
                  </div>
                )}
                <div className="sm:col-span-3">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Objet du devis (intro PDF)
                  </Label>
                  <Textarea
                    value={objet}
                    onChange={(e) => setObjet(e.target.value)}
                    rows={2}
                    className="mt-1"
                    placeholder="Ex : Veuillez trouver ci-joint notre offre de prix pour…"
                  />
                </div>
                <div className="sm:col-span-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Conditions de paiement
                    </Label>
                    {(conditionsQ.data?.length ?? 0) > 0 && (
                      <Select onValueChange={(v) => setConditions(v.replace(/ \/ /g, "\n"))}>
                        <SelectTrigger className="h-7 w-48 text-xs">
                          <SelectValue placeholder="Modèle…" />
                        </SelectTrigger>
                        <SelectContent>
                          {conditionsQ.data!.map((o) => (
                            <SelectItem key={o.id} value={o.libelle}>
                              {o.libelle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <ConditionsTemplates value={conditions} onSelect={setConditions} />
                  <Textarea
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    rows={2}
                    className="mt-1"
                    placeholder="Pré-rempli à la sélection du client — modifiable au cas par cas."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Ajout de lignes */}
            <Card>
              <CardContent className="p-4 space-y-3">
                {!isOuvrier && (
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <DevisIA
                      mode={isEdit ? "edition" : "creation"}
                      contexte={contexteIA}
                      prestations={prestations}
                      categorieId={categorieId}
                      tvaCourants={tvaCourants}
                      tauxStandard={tauxStandard}
                      pret={!!entiteId && !!clientId}
                      onInserer={insererLignesIA}
                      onAppliquer={appliquerOpsIA}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Depuis la bibliothèque</Label>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={ajouterTitre}>
                        Catégorie
                      </Button>
                      <Button variant="outline" size="sm" onClick={ajouterLigneLibre}>
                        Ligne libre
                      </Button>
                    </div>
                  </div>
                  <PrestationPicker
                    prestations={prestations}
                    entitePreselection={null}
                    onChoisir={ajouterPrestation}
                  />
                </div>

                <div className="overflow-x-auto">
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <table className="w-full text-sm table-fixed min-w-[720px]">
                      <thead className="text-xs text-muted-foreground border-b">
                        <tr>
                          <th className="w-7"></th>
                          <th className="text-right px-1 py-2 w-9">N°</th>
                          <th className="text-left px-2 py-2">Libellé</th>
                          <th className="text-left px-2 py-2 w-20">Unité</th>
                          <th className="text-right px-2 py-2 w-20">Qté</th>
                          <th className="text-right px-2 py-2 w-24">PU HT</th>
                          <th className="text-right px-2 py-2 w-16">TVA %</th>
                          <th className="text-right px-2 py-2 w-28">Total HT</th>
                          <th className="w-14"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.length === 0 && (
                          <tr>
                            <td
                              colSpan={9}
                              className="text-center py-6 text-muted-foreground text-sm"
                            >
                              Aucune ligne. Ajoute depuis la bibliothèque, une ligne libre ou une
                              catégorie.
                            </td>
                          </tr>
                        )}
                        <SortableContext
                          items={lignes.map((l) => l.uid)}
                          strategy={verticalListSortingStrategy}
                        >
                          {lignes.map((l) =>
                            l.est_titre ? (
                              <SortableTr
                                key={l.uid}
                                id={l.uid}
                                className="group border-b last:border-0 bg-muted/50"
                              >
                                {(grip) => (
                                  <>
                                    <td className="px-1 py-1.5 text-center">{grip}</td>
                                    <td className="px-1 py-1.5" />
                                    <td colSpan={6} className="px-2 py-1.5">
                                      <LibelleArea
                                        value={l.libelle}
                                        onChange={(v) => patchLigne(l.uid, { libelle: v })}
                                        placeholder="Titre de catégorie (ex. Salle de bain)"
                                        bold
                                      />
                                    </td>
                                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                                      <button
                                        onClick={() => supprimerLigne(l.uid)}
                                        className="text-muted-foreground hover:text-destructive"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 inline" />
                                      </button>
                                    </td>
                                  </>
                                )}
                              </SortableTr>
                            ) : (
                              <SortableTr
                                key={l.uid}
                                id={l.uid}
                                className="group border-b last:border-0 [&>td]:align-top"
                              >
                                {(grip) => (
                                  <>
                                    <td className="px-1 py-2.5 text-center">{grip}</td>
                                    <td className="px-1 py-1.5 text-right num-tabular text-xs text-muted-foreground leading-8">
                                      {positions.get(l.uid)}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <LibelleArea
                                        value={l.libelle}
                                        onChange={(v) => patchLigne(l.uid, { libelle: v })}
                                        placeholder="Libellé"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <Select
                                        value={normUnite(l.unite)}
                                        onValueChange={(v) => patchLigne(l.uid, { unite: v })}
                                      >
                                        <SelectTrigger className="h-8 text-sm">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {UNITES_DEVIS.map((u) => (
                                            <SelectItem key={u.value} value={u.value}>
                                              {u.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={l.quantite}
                                        onChange={(e) =>
                                          patchLigne(l.uid, { quantite: Number(e.target.value) })
                                        }
                                        className="h-8 text-right text-sm"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <Input
                                        type="number"
                                        step="0.05"
                                        value={l.prix_unitaire_ht}
                                        onChange={(e) =>
                                          patchLigne(l.uid, {
                                            prix_unitaire_ht: Number(e.target.value),
                                          })
                                        }
                                        className="h-8 text-right text-sm"
                                      />
                                    </td>
                                    <td className="px-2 py-1.5 text-right num-tabular text-xs text-muted-foreground leading-8">
                                      {l.taux_tva.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right num-tabular leading-8">
                                      {formatEUR(r2(l.quantite * l.prix_unitaire_ht))}
                                    </td>
                                    <td className="px-2 py-1.5 text-right whitespace-nowrap leading-8">
                                      <button
                                        onClick={() => ouvrirAjoutBiblio(l)}
                                        title="Ajouter à la bibliothèque"
                                        className="mr-2 text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                      >
                                        <BookmarkPlus className="w-3.5 h-3.5 inline" />
                                      </button>
                                      <button
                                        onClick={() => supprimerLigne(l.uid)}
                                        className="text-muted-foreground hover:text-destructive"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 inline" />
                                      </button>
                                    </td>
                                  </>
                                )}
                              </SortableTr>
                            ),
                          )}
                        </SortableContext>
                      </tbody>
                    </table>
                  </DndContext>
                </div>
              </CardContent>
            </Card>

            {/* Notes et remarques */}
            <Card>
              <CardContent className="p-4">
                <Label className="text-xs uppercase text-muted-foreground">
                  Notes et remarques
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="mt-1"
                  placeholder="Planning, inclus/exclus, remarques particulières..."
                />
              </CardContent>
            </Card>
          </div>

          {/* Récapitulatif + marge */}
          <div className="space-y-3">
            <Card>
              <CardContent className="p-4 space-y-1 text-sm">
                <Row label="Total HT" value={formatEUR(totaux.total_ht)} />
                <Row label="TVA" value={formatEUR(totaux.total_tva)} />
                {Math.abs(totaux.arrondi) > 0.0001 && (
                  <Row label="Arrondi" value={formatEUR(totaux.arrondi)} />
                )}
                <Row label="Total TTC" value={formatEUR(totaux.total_ttc)} bold />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-1 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Marge estimée
                </div>
                <Row label="Coût de revient" value={formatEUR(totaux.cout_revient_total)} />
                <Row label="Marge estimée" value={formatEUR(totaux.marge_estimee)} bold />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-muted-foreground text-xs">Taux de marge</span>
                  <span className={`text-lg font-semibold num-tabular ${margeColor}`}>
                    {totaux.total_ht > 0 ? pct(totaux.taux_marge, 1) : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full"
              onClick={enregistrer}
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isEdit ? "Enregistrer les modifications" : "Enregistrer le devis"}
            </Button>
          </div>
        </div>
      </div>

      {/* ===================== Mobile — bibliothèque d'abord ===================== */}
      <div className="md:hidden">
        {mobileEtape === "selection" ? (
          <div className="space-y-4 pt-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {isEdit ? "Modifier le devis" : "Nouveau devis"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Choisissez l'entité et le client pour accéder à la bibliothèque de prix.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Entité</Label>
                <Select
                  value={entiteId}
                  onValueChange={(v) => {
                    setEntiteId(v);
                    setChantierId("");
                  }}
                >
                  <SelectTrigger className="mt-1 h-12 w-full">
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
                <Label>Client</Label>
                <Select
                  value={clientId}
                  onValueChange={(v) => {
                    setClientId(v);
                    setChantierId("");
                  }}
                >
                  <SelectTrigger className="mt-1 h-12 w-full">
                    <SelectValue placeholder="Sélectionner le client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full h-12"
              disabled={!entiteId || !clientId}
              onClick={() => setMobileEtape("micro")}
            >
              Continuer
            </Button>
          </div>
        ) : (
          <div className={lignes.length > 0 ? "pb-36" : ""}>
            {/* En-tête minimal */}
            <div className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{codeEntiteDevis ?? "—"}</span> ·{" "}
                {client?.nom ?? "—"}
              </div>
              <button
                onClick={() => setMobileEtape("selection")}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                Modifier
              </button>
            </div>

            {/* Bibliothèque en direct — dictée disponible sur demande, pas par défaut */}
            {lignes.length === 0 && (
              <div className="pt-2 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Depuis la bibliothèque</Label>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={ajouterTitreMobile}>
                        Catégorie
                      </Button>
                      <Button variant="outline" size="sm" onClick={ajouterLigneMobile}>
                        Ligne libre
                      </Button>
                    </div>
                  </div>
                  <PrestationPicker
                    prestations={prestations}
                    entitePreselection={null}
                    onChoisir={choisirPrestationMobile}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
                  {!isOuvrier && (
                    <button
                      onClick={() => setMobileDictee(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline underline-offset-2"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      Dicter le devis (IA)
                    </button>
                  )}
                  <button
                    onClick={() => setMobileImport((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    ou importer un devis
                  </button>
                </div>
                {mobileImport && (
                  <div className="w-full">
                    <DevisImportPDF
                      contexte={contexteIA}
                      tauxStandard={tauxStandard}
                      pret={!!entiteId && !!clientId}
                      onInserer={insererLignesIA}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Lignes générées — cartes lecture seule, tap pour éditer */}
            {lignes.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lignes du devis ({lignes.length})
                </div>
                <div className="rounded-md border divide-y">
                  {lignes.map((l) => (
                    <div
                      key={l.uid}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditUid(l.uid)}
                      className={`flex items-start gap-3 p-3 cursor-pointer active:bg-muted/40 ${l.est_titre ? "bg-muted/50" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm break-words ${l.est_titre ? "font-semibold" : "font-medium"}`}
                        >
                          {!l.est_titre && positions.get(l.uid) != null && (
                            <span className="text-muted-foreground mr-1.5 num-tabular">
                              {positions.get(l.uid)}.
                            </span>
                          )}
                          {l.libelle || (l.est_titre ? "Titre de catégorie" : "Sans libellé")}
                        </div>
                        {!l.est_titre && (
                          <div className="text-sm text-muted-foreground mt-0.5 num-tabular">
                            {l.quantite} {normUnite(l.unite)} × {formatEUR(l.prix_unitaire_ht)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!l.est_titre && (
                          <span className="num-tabular font-semibold mr-1">
                            {formatEUR(r2(l.quantite * l.prix_unitaire_ht))}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deplacerLigne(l.uid, -1);
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title="Monter"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deplacerLigne(l.uid, 1);
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title="Descendre"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        {!l.est_titre && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              ouvrirAjoutBiblio(l);
                            }}
                            title="Ajouter à la bibliothèque"
                            className="p-1 text-muted-foreground hover:text-accent"
                          >
                            <BookmarkPlus className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            supprimerLigne(l.uid);
                          }}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <Row label="Total HT" value={formatEUR(totaux.total_ht)} />
                  <Row label="TVA" value={formatEUR(totaux.total_tva)} />
                  {Math.abs(totaux.arrondi) > 0.0001 && (
                    <Row label="Arrondi" value={formatEUR(totaux.arrondi)} />
                  )}
                  <Row label="Total TTC" value={formatEUR(totaux.total_ttc)} bold />
                </div>
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Notes et remarques
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="mt-1"
                    placeholder="Planning, inclus/exclus, remarques particulières..."
                  />
                </div>
              </div>
            )}

            {/* Barre d'action fixe : Ajouter une ligne (au-dessus) + Générer le devis */}
            {lignes.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background p-3 space-y-2">
                <div className={`grid gap-2 ${isOuvrier ? "grid-cols-3" : "grid-cols-4"}`}>
                  <Button
                    variant="outline"
                    className="h-11 px-1 text-xs"
                    onClick={ajouterTitreMobile}
                  >
                    <Plus className="w-4 h-4 mr-1 shrink-0" />
                    Catégorie
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 px-1 text-xs"
                    onClick={ajouterLigneMobile}
                  >
                    <Plus className="w-4 h-4 mr-1 shrink-0" />
                    Ligne
                  </Button>
                  {!isOuvrier && (
                    <Button
                      variant="outline"
                      className="h-11 px-1 text-xs"
                      onClick={() => setMobileDictee(true)}
                    >
                      <Mic className="w-4 h-4 mr-1 shrink-0" />
                      Dicter
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="h-11 px-1 text-xs"
                    onClick={() => setMobileBiblio(true)}
                  >
                    <Library className="w-4 h-4 mr-1 shrink-0" />
                    Biblio
                  </Button>
                </div>
                <Button
                  className="w-full h-12"
                  onClick={enregistrer}
                  disabled={create.isPending || update.isPending}
                >
                  {create.isPending || update.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Générer le devis
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Mini-dialog d'édition d'une ligne (tap sur la carte / nouvelle ligne) */}
        {editUid != null &&
          (() => {
            const lg = lignes.find((l) => l.uid === editUid);
            return lg ? (
              <LigneEditDialog
                ligne={lg}
                onClose={() => {
                  // Annuler sur une ligne encore sans libellé (jamais enregistrée) la
                  // retire, plutôt que de laisser une ligne invalide traîner sans que ce
                  // soit visible (le placeholder "Titre de catégorie" / "Sans libellé"
                  // masque le vide dans la liste).
                  if (!lg.libelle.trim()) supprimerLigne(editUid);
                  setEditUid(null);
                }}
                onSave={(p) => patchLigne(editUid, p)}
              />
            ) : null;
          })()}

        {/* Tiroir "Depuis la bibliothèque" — même sélecteur que le PC, quantité ajustable
            juste après via le mini-dialog d'édition (choisirPrestationMobile). */}
        <Sheet open={mobileBiblio} onOpenChange={setMobileBiblio}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Depuis la bibliothèque</SheetTitle>
            </SheetHeader>
            <div className="mt-3">
              <PrestationPicker
                prestations={prestations}
                entitePreselection={null}
                onChoisir={choisirPrestationMobile}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Tiroir "Dicter le devis" — sur demande uniquement, ne s'ouvre plus par défaut. */}
        <Sheet open={mobileDictee} onOpenChange={setMobileDictee}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{isEdit ? "Modifier à la voix" : "Dicter le devis"}</SheetTitle>
            </SheetHeader>
            <div className="mt-3">
              {!isOuvrier && (
                <DevisIA
                  mode={isEdit ? "edition" : "creation"}
                  contexte={contexteIA}
                  prestations={prestations}
                  categorieId={categorieId}
                  tvaCourants={tvaCourants}
                  tauxStandard={tauxStandard}
                  pret={!!entiteId && !!clientId}
                  onInserer={(champs) => {
                    insererLignesIA(champs);
                    setMobileDictee(false);
                  }}
                  onAppliquer={(ops) => {
                    appliquerOpsIA(ops);
                    setMobileDictee(false);
                  }}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Ajout d'une ligne du devis à la bibliothèque (partagé desktop + mobile) */}
      <AjouterBiblioDialog
        open={!!ajoutBiblio}
        onOpenChange={(o) => {
          if (!o) setAjoutBiblio(null);
        }}
        defaults={ajoutBiblio}
        entite={codeEntiteDevis}
      />

      {/* Proposition des prestations liées (packs) */}
      <Dialog
        open={!!propositionLiees}
        onOpenChange={(o) => {
          if (!o) setPropositionLiees(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Articles liés</DialogTitle>
            <DialogDescription>
              {propositionLiees?.length} article(s) lié(s) à la prestation ajoutée. Sélectionnez
              ceux à ajouter au devis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {propositionLiees?.map((l) => (
              <label
                key={l.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer hover:bg-accent/10"
              >
                <Checkbox
                  checked={lieesChecked.has(l.id)}
                  onCheckedChange={(c) => toggleLiee(l.id, c === true)}
                />
                <span className="flex-1 min-w-0 text-sm truncate">
                  {l.libelle}
                  <span className="text-xs text-muted-foreground ml-1">· {l.unite}</span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPropositionLiees(null)}>
              Ignorer
            </Button>
            <Button onClick={ajouterLieesSelectionnees} disabled={lieesChecked.size === 0}>
              Ajouter les sélectionnées{lieesChecked.size > 0 ? ` (${lieesChecked.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={blockStatus === "blocked"}
        onOpenChange={(o) => {
          if (!o) reset?.();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Voulez-vous quitter ?</DialogTitle>
            <DialogDescription>
              Vos modifications non enregistrées seront perdues.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => reset?.()}>
              Rester
            </Button>
            <Button variant="destructive" onClick={() => proceed?.()}>
              Quitter sans enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`num-tabular ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

// Mini-dialog mobile : édition d'une ligne (libellé / unité / quantité / PU) → patchLigne.
function LigneEditDialog({
  ligne,
  onClose,
  onSave,
}: {
  ligne: LigneForm;
  onClose: () => void;
  onSave: (patch: Partial<LigneForm>) => void;
}) {
  const [libelle, setLibelle] = useState(ligne.libelle);
  const [unite, setUnite] = useState<string>(normUnite(ligne.unite));
  const [qte, setQte] = useState(ligne.quantite);
  const [pu, setPu] = useState(ligne.prix_unitaire_ht);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
        // Radix focus (et donc ouvre le clavier) le premier champ tabbable à l'ouverture,
        // indépendamment de l'attribut autoFocus HTML posé plus bas — il faut l'empêcher
        // explicitement ici pour une ligne qui vient déjà de la bibliothèque.
        onOpenAutoFocus={(e) => {
          if (ligne.prestation_id) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {ligne.est_titre ? "Modifier la catégorie" : "Modifier la ligne"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{ligne.est_titre ? "Titre de catégorie" : "Libellé"}</Label>
            <Input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              className="mt-1 h-11"
              placeholder={ligne.est_titre ? "Ex. Salle de bain" : "Désignation"}
              // Pas de focus auto (et donc pas de clavier qui s'ouvre tout seul) quand la
              // ligne vient déjà d'une prestation de la bibliothèque : le libellé est déjà
              // rempli, seule la quantité reste probablement à ajuster.
              autoFocus={!ligne.prestation_id}
            />
          </div>
          {!ligne.est_titre && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Unité</Label>
                  <Select value={unite} onValueChange={setUnite}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITES_DEVIS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantité</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={qte}
                    onChange={(e) => setQte(Number(e.target.value))}
                    className="mt-1 h-11 num-tabular"
                  />
                </div>
                <div>
                  <Label>PU HT</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={pu}
                    onChange={(e) => setPu(Number(e.target.value))}
                    className="mt-1 h-11 num-tabular"
                  />
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Total HT :{" "}
                <span className="num-tabular font-medium text-foreground">
                  {formatEUR(r2(qte * pu))}
                </span>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              onSave(
                ligne.est_titre
                  ? { libelle }
                  : { libelle, unite, quantite: qte, prix_unitaire_ht: pu },
              );
              onClose();
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ligne de tableau triable (dnd-kit) : fournit la poignée de déplacement via render prop.
function SortableTr({
  id,
  className,
  children,
}: {
  id: number;
  className?: string;
  children: (grip: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const grip = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-foreground"
      title="Déplacer (glisser sous une catégorie pour l'y assigner)"
    >
      <GripVertical className="w-3.5 h-3.5 inline" />
    </button>
  );
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${className ?? ""} ${isDragging ? "opacity-60 relative z-10" : ""}`}
    >
      {children(grip)}
    </tr>
  );
}

// Libellé auto-extensible : remplace l'input mono-ligne du tableau — le texte long
// s'enroule sur plusieurs lignes au lieu de défiler et de masquer le début (retour client).
function LibelleArea({
  value,
  onChange,
  placeholder,
  bold,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  bold?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`flex w-full resize-none overflow-hidden rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${bold ? "font-semibold" : ""}`}
    />
  );
}
