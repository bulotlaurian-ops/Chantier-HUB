import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

// Dropdown multi-sélection (cases à cocher) réutilisable.
// Set vide ⇒ « Toutes » (aucune contrainte). Le menu reste ouvert entre les coches.
export function MultiSelectFiltre({ label, options, selected, onToggle, width = 'w-44' }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  width?: string;
}) {
  const resume =
    selected.size === 0 ? 'Toutes'
    : selected.size === 1 ? [...selected][0]
    : `${selected.size} sélectionnées`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={`${width} justify-between font-normal h-9`}>
          <span className="truncate text-sm">
            <span className="text-muted-foreground">{label} : </span>{resume}
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucune valeur</div>
        )}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={selected.has(o)}
            onSelect={(e) => e.preventDefault()} // garde le menu ouvert (multi-sélection)
            onCheckedChange={() => onToggle(o)}
          >
            {o}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
