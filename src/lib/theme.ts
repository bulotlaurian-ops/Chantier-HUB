import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "theme";

// Lit la préférence : localStorage > préférence système > clair.
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* stockage indisponible */
  }
}

// Script anti-flash injecté dans le <head> (applique .dark avant le paint).
export const THEME_INIT_SCRIPT =
  "try{var t=localStorage.getItem('theme');" +
  "if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))" +
  "document.documentElement.classList.add('dark');}catch(e){}";

// Force le mode clair sur les écrans publics (connexion, réinitialisation),
// sans toucher à la préférence enregistrée : elle est restaurée à la sortie.
export function useForceLightTheme() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.remove("dark");
    return () => {
      document.documentElement.classList.toggle("dark", getInitialTheme() === "dark");
    };
  }, []);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  // Synchronise l'état React avec la classe déjà posée par le script anti-flash.
  useEffect(() => {
    setThemeState(getInitialTheme());
  }, []);

  const setTheme = (t: Theme) => {
    applyTheme(t);
    setThemeState(t);
  };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, setTheme, toggle };
}
