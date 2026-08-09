import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileUp, Loader2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatCHF } from '@/lib/format';
import type { Tables } from '@/lib/database.types';
import { callOcrDevisST, messageErreurIA, DevisIAError, type DevisIAContexte, type LigneDevisST } from '@/lib/devis-ia';
import { ligneLibre, useAjouterPrestationBiblio, type LigneDevisChamps } from '@/lib/queries/prestations';
import { DropZone } from '@/components/DropZone';
import { SelecteurFeuilles } from '@/components/SelecteurFeuilles';
import {
  detecterType, fichierVersBase64, normUnite, ouvrirExcel, versLignesDevis, type ClasseurExcel,
} from '@/lib/import-fichier';

type Unite = Tables<'prestations'>['unite'];
const UNITES: Unite[] = ['m2', 'ml', 'pce', 'u', 'fft', 'h', 'forfait'];
const MAX_BYTES = 20 * 1024 * 1024; // 20 Mo (OCR PDF)

interface PreviewLigne { uid: number; designation: string; unite: string; quantite: number; prix: number }

// Voie B : import d'un devis sous-traitant (PDF → OCR n8n, ou Excel → parsing local).
// Les deux convergent vers le même preview éditable → insertion au prix sous-traitant.
export function DevisImportPDF({ contexte, tauxStandard, pret, onInserer }: {
  contexte: DevisIAContexte;
  tauxStandard: number;
  pret: boolean; // entité + client choisis (requis pour l'OCR PDF)
  onInserer: (champs: LigneDevisChamps[]) => void;
}) {
  const uidRef = useRef(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ fournisseur: string | null; avert: string[]; lignes: PreviewLigne[] } | null>(null);
  const [classeur, setClasseur] = useState<ClasseurExcel | null>(null); // attente sélection de feuilles

  // Ajout direct en bibliothèque (valide+actif) d'une ligne importée.
  const ajouter = useAjouterPrestationBiblio();
  const [ajoutees, setAjoutees] = useState<Set<number>>(new Set());
  const [bForm, setBForm] = useState<{ uid: number; designation: string; unite: Unite; prix: number } | null>(null);
  const submitBiblio = async () => {
    if (!bForm) return;
    if (!bForm.designation.trim()) { toast.error('Désignation requise'); return; }
    try {
      await ajouter.mutateAsync({ libelle: bForm.designation.trim(), unite: bForm.unite, prix_vente_reference: bForm.prix || 0, entite_code: contexte.entite_code });
      setAjoutees((s) => new Set(s).add(bForm.uid));
      setBForm(null);
      toast.success('Prestation ajoutée à la bibliothèque');
    } catch (e) {
      toast.error('Ajout impossible : ' + (e as Error).message);
    }
  };

  const construirePreview = (fournisseur: string | null, avert: string[], lignes: LigneDevisST[]) =>
    setPreview({
      fournisseur, avert,
      lignes: lignes.map((l) => ({
        uid: uidRef.current++, designation: l.designation, unite: normUnite(l.unite),
        quantite: Number(l.quantite) || 1, prix: Number(l.prix_unitaire) || 0,
      })),
    });

  // ---- Réception fichier : aiguillage PDF / Excel ----
  const onFile = (f: File) => {
    const type = detecterType(f);
    if (type === 'excel') { void traiterExcel(f); return; }
    if (type !== 'pdf') { toast.error('Format non supporté — PDF ou Excel uniquement.'); return; }
    void traiterPdf(f);
  };

  const traiterPdf = async (f: File) => {
    if (f.size > MAX_BYTES) {
      toast.error('Ce fichier est trop volumineux (max 20 Mo). Réduisez ou divisez le PDF.');
      return;
    }
    setLoading(true);
    try {
      const b64 = await fichierVersBase64(f);
      const res = await callOcrDevisST({ fichierBase64: b64, mimeType: f.type || 'application/pdf', contexte });
      construirePreview(res.fournisseur, res.avertissements, res.lignes);
    } catch (e) {
      const code = e instanceof DevisIAError ? e.code : 'inconnue';
      toast.error(messageErreurIA(code), { description: 'Tu peux saisir manuellement.' });
    } finally {
      setLoading(false);
    }
  };

  const traiterExcel = async (f: File) => {
    try {
      const cl = await ouvrirExcel(f);
      if (cl.feuilles.length <= 1) finExcel(cl.parseFeuilles(cl.feuilles));
      else setClasseur(cl); // > 1 feuille → sélecteur
    } catch (e) {
      toast.error('Lecture Excel impossible : ' + (e as Error).message);
    }
  };

  const finExcel = (rows: ReturnType<ClasseurExcel['parseFeuilles']>) => {
    if (rows.length === 0) { toast.error('Aucune ligne exploitable dans ce fichier Excel.'); return; }
    construirePreview(null, ['Importé depuis Excel — vérifiez les désignations et montants avant insertion.'], versLignesDevis(rows));
  };

  const setPv = (uid: number, patch: Partial<PreviewLigne>) =>
    setPreview((p) => p && ({ ...p, lignes: p.lignes.map((l) => l.uid === uid ? { ...l, ...patch } : l) }));
  const supprimer = (uid: number) =>
    setPreview((p) => p && ({ ...p, lignes: p.lignes.filter((l) => l.uid !== uid) }));

  const inserer = () => {
    if (!preview) return;
    const champs: LigneDevisChamps[] = preview.lignes.map((l) => {
      const base = ligneLibre(l.designation, l.unite || null, l.quantite || 1, tauxStandard);
      return { ...base, prix_unitaire_ht: l.prix || 0 }; // prix = prix sous-traitant
    });
    onInserer(champs);
    setPreview(null);
    toast.success(`${champs.length} ligne${champs.length > 1 ? 's' : ''} insérée${champs.length > 1 ? 's' : ''} dans le devis`);
  };

  return (
    <div className="rounded-lg border-2 border-accent/30 bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileUp className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold">Importer un devis fournisseur</h3>
        <span className="text-[11px] text-muted-foreground">PDF (OCR) ou Excel</span>
      </div>
      <DropZone
        accept=".pdf,.xlsx,.xls"
        hint="Glissez votre devis ici ou cliquez pour parcourir"
        onFile={onFile}
        loading={loading}
        loadingText="Analyse du PDF — peut prendre 10 à 30 s…"
        disabled={!pret}
      />
      {!pret && <p className="text-[11px] text-muted-foreground mt-2">Choisissez d'abord l'entité et le client pour activer l'import.</p>}

      {/* Sélecteur de feuilles (classeur Excel multi-feuilles) */}
      <SelecteurFeuilles
        open={!!classeur}
        feuilles={classeur?.feuilles ?? []}
        onConfirm={(noms) => { const cl = classeur; setClasseur(null); if (cl) finExcel(cl.parseFeuilles(noms)); }}
        onCancel={() => setClasseur(null)}
      />

      {/* Prévisualisation des lignes extraites */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-4 h-4 text-accent" />
              Devis sous-traitant{preview?.fournisseur ? ` — ${preview.fournisseur}` : ''}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">{preview.lignes.length} ligne{preview.lignes.length > 1 ? 's' : ''} extraite{preview.lignes.length > 1 ? 's' : ''} · prix du sous-traitant (vérifie avant d'insérer)</div>
              {preview.avert.map((a, i) => <div key={i} className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1">{a}</div>)}
              {preview.lignes.length === 0 && <div className="text-sm text-muted-foreground">Aucune ligne détectée.</div>}

              <div className="space-y-2">
                {preview.lignes.map((l) => (
                  <div key={l.uid} className="flex items-start gap-2">
                    <Input value={l.designation} onChange={(e) => setPv(l.uid, { designation: e.target.value })} className="flex-1 h-8 text-sm" placeholder="Désignation" />
                    <div className="w-20">
                      <Select value={l.unite} onValueChange={(v) => setPv(l.uid, { unite: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input type="number" step="0.01" value={l.quantite} onChange={(e) => setPv(l.uid, { quantite: Number(e.target.value) })} className="w-20 h-8 text-right text-sm num-tabular" title="Quantité" />
                    <Input type="number" step="0.05" value={l.prix} onChange={(e) => setPv(l.uid, { prix: Number(e.target.value) })} className="w-28 h-8 text-right text-sm num-tabular" title="Prix unitaire HT (sous-traitant)" />
                    {ajoutees.has(l.uid) ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40 text-[10px] mt-1.5 whitespace-nowrap">ajoutée</Badge>
                    ) : (
                      <button onClick={() => setBForm({ uid: l.uid, designation: l.designation, unite: normUnite(l.unite), prix: l.prix })}
                        className="text-[10px] text-accent hover:underline inline-flex items-center gap-0.5 mt-2 whitespace-nowrap" title="Ajouter à la bibliothèque">
                        <Plus className="w-2.5 h-2.5" />Biblio
                      </button>
                    )}
                    <button onClick={() => supprimer(l.uid)} className="text-muted-foreground hover:text-destructive mt-1.5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>

              {preview.lignes.length > 0 && (
                <div className="text-right text-xs text-muted-foreground">
                  Total lignes (HT, indicatif) : <span className="num-tabular font-medium text-foreground">{formatCHF(preview.lignes.reduce((s, l) => s + (l.quantite || 0) * (l.prix || 0), 0))}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Annuler</Button>
            <Button onClick={inserer} disabled={!preview || preview.lignes.length === 0}>Insérer dans le devis</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ajout d'une ligne à la bibliothèque */}
      <Dialog open={!!bForm} onOpenChange={(o) => !o && setBForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />Ajouter à la bibliothèque</DialogTitle></DialogHeader>
          {bForm && (
            <div className="space-y-3">
              <div><Label>Désignation</Label><Input value={bForm.designation} onChange={(e) => setBForm({ ...bForm, designation: e.target.value })} className="mt-1" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Unité</Label>
                  <Select value={bForm.unite} onValueChange={(v) => setBForm({ ...bForm, unite: v as Unite })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Prix de vente réf. HT</Label><Input type="number" step="0.05" value={bForm.prix} onChange={(e) => setBForm({ ...bForm, prix: Number(e.target.value) })} className="mt-1 num-tabular" /></div>
              </div>
              <div className="text-xs text-muted-foreground">
                Ajoutée depuis <span className="font-medium text-foreground">{contexte.entite_code}</span> directement à la <span className="font-medium">bibliothèque commune</span> (active immédiatement). Saisis ici le <span className="font-medium">prix de vente</span>, pas le prix sous-traitant.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBForm(null)}>Annuler</Button>
            <Button onClick={submitBiblio} disabled={ajouter.isPending}>
              {ajouter.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
