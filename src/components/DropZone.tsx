import { useRef, useState, type ComponentType } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Zone de glisser-déposer partagée (events HTML5 natifs, aucune lib externe).
// Le clic et le drop déclenchent le même `onFile`.
export function DropZone({
  onFile,
  accept,
  hint,
  loading = false,
  loadingText,
  disabled = false,
  icon: Icon = FileUp,
  className,
}: {
  onFile: (file: File) => void;
  accept: string;
  hint: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const inactif = disabled || loading;

  const handleFile = (f: File | undefined) => {
    if (f && !inactif) onFile(f);
  };

  return (
    <div
      role="button"
      tabIndex={inactif ? -1 : 0}
      aria-disabled={inactif}
      onClick={() => !inactif && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!inactif && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        if (inactif) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (inactif) return;
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex min-h-[120px] md:min-h-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
        inactif
          ? "cursor-not-allowed opacity-60 border-border"
          : dragOver
            ? "cursor-pointer border-accent bg-accent/5"
            : "cursor-pointer border-border hover:border-accent/60 hover:bg-muted/40",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
      ) : (
        <Icon className="h-7 w-7 text-muted-foreground" />
      )}
      <div className="text-sm text-muted-foreground">
        {loading ? (loadingText ?? "Traitement en cours…") : hint}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={inactif}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
