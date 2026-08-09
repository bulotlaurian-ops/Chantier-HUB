import { cn } from '@/lib/utils';

// Presets d'acomptes cliquables (en plus du textarea libre et du Select « Modèle… »).
// Le texte est injecté tel quel dans conditions_paiement (alimente le PDF).
export const CONDITIONS_TEMPLATES: { label: string; texte: string }[] = [
  { label: 'Acompte 30% — Solde', texte: 'Acompte de 30% à la signature du devis, solde net à la livraison.' },
  { label: 'Acompte 30% + 50% — Solde', texte: 'Acompte de 30% à la signature du devis, acompte de 50% en cours de travaux, solde net à la livraison.' },
  { label: 'Solde à la livraison', texte: 'Solde net à la livraison.' },
  { label: 'Solde à 30 jours', texte: 'Solde net à 30 jours date de facture.' },
];

// Rangée de chips : clic → remplit le textarea ; la chip dont le texte correspond
// à la valeur courante est mise en évidence (sinon = texte libre modifié).
export function ConditionsTemplates({ value, onSelect }: { value: string; onSelect: (texte: string) => void }) {
  const courant = value.trim();
  return (
    <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
      {CONDITIONS_TEMPLATES.map((t) => {
        const actif = courant === t.texte;
        return (
          <button
            key={t.label}
            type="button"
            onClick={() => onSelect(t.texte)}
            aria-pressed={actif}
            title={t.texte}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              actif
                ? 'border-accent bg-accent/10 text-accent font-medium'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
