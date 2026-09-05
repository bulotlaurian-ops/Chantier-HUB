import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EntiteFilterStore {
  currentEntiteId: string | "all";
  setEntite: (id: string | "all") => void;
}

export const useEntiteFilter = create<EntiteFilterStore>()(
  persist(
    (set) => ({
      currentEntiteId: "all",
      setEntite: (id) => set({ currentEntiteId: id }),
    }),
    { name: "chantier-hub-entite-filter", version: 1 },
  ),
);
