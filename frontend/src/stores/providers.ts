import { create } from "zustand";
import type { Provider } from "../types";
import { apiGet, apiPost } from "../lib/api";

interface ProvidersStore {
  providers: Provider[];
  currentProvider: string;
  currentModel: string;
  switching: boolean;

  load: () => Promise<void>;
  switchProvider: (provider: string, model: string) => Promise<void>;
}

export const useProvidersStore = create<ProvidersStore>((set) => ({
  providers: [],
  currentProvider: "",
  currentModel: "",
  switching: false,

  load: async () => {
    try {
      const data = await apiGet<{
        providers: Provider[];
        current: { provider: string; model: string };
      }>("/providers");
      set({
        providers: data.providers,
        currentProvider: data.current.provider,
        currentModel: data.current.model,
      });
    } catch (err) {
      console.error("Providers load failed:", err);
    }
  },

  switchProvider: async (provider: string, model: string) => {
    set({ switching: true });
    try {
      await apiPost("/provider", { provider, model });
      set({ currentProvider: provider, currentModel: model });
    } catch (err) {
      console.error("Provider switch failed:", err);
    } finally {
      set({ switching: false });
    }
  },
}));
