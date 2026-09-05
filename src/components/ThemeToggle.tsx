import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Bascule clair / sombre. Variante "sidebar" = tons sidebar ; sinon tons standard.
export function ThemeToggle({
  variant = "default",
  className,
}: {
  variant?: "default" | "sidebar";
  className?: string;
}) {
  const { theme, toggle } = useTheme();
  const sombre = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={sombre ? "Passer en mode clair" : "Passer en mode sombre"}
      title={sombre ? "Mode clair" : "Mode sombre"}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors",
        variant === "sidebar"
          ? "h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          : "h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {sombre ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
