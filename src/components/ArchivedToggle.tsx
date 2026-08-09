import { Switch } from '@/components/ui/switch';

export function ArchivedToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <Switch checked={value} onCheckedChange={onChange} />
      Voir les archivés
    </label>
  );
}
