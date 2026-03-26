import { create } from "zustand";
import type { MiddlewareInfo } from "../types";
import { apiGet, apiPost } from "../lib/api";

interface MiddlewareStore {
  items: MiddlewareInfo[];
  load: () => Promise<void>;
  toggle: (name: string, enabled: boolean) => Promise<void>;
}

export const useMiddlewareStore = create<MiddlewareStore>((set, get) => ({
  items: [],

  load: async () => {
    try {
      const data = await apiGet<{ middleware: MiddlewareInfo[] }>("/middleware");
      set({ items: data.middleware });
    } catch { /* ignore */ }
  },

  toggle: async (name: string, enabled: boolean) => {
    // Optimistic update
    set((s) => ({
      items: s.items.map((m) => (m.name === name ? { ...m, enabled } : m)),
    }));
    try {
      await apiPost("/middleware", { name, enabled });
    } catch {
      // Revert
      set((s) => ({
        items: s.items.map((m) => (m.name === name ? { ...m, enabled: !enabled } : m)),
      }));
    }
  },
}));
