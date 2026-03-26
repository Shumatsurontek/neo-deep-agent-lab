import { create } from "zustand";
import { apiGet, apiPost } from "../lib/api";

interface HitlStore {
  enabled: boolean;
  pendingQuery: string | null;
  pendingDescription: string | null;
  pendingData: unknown | null;

  loadStatus: () => Promise<void>;
  toggle: () => Promise<void>;
  setPending: (query: string, description: string, data: unknown) => void;
  clearPending: () => void;
}

export const useHitlStore = create<HitlStore>((set, get) => ({
  enabled: true,
  pendingQuery: null,
  pendingDescription: null,
  pendingData: null,

  loadStatus: async () => {
    try {
      const data = await apiGet<{ enabled: boolean }>("/hitl");
      set({ enabled: data.enabled });
    } catch { /* ignore */ }
  },

  toggle: async () => {
    const prev = get().enabled;
    const next = !prev;
    set({ enabled: next }); // optimistic
    try {
      const data = await apiPost<{ enabled: boolean }>("/hitl", { enabled: next });
      set({ enabled: data.enabled });
    } catch (err) {
      console.error("HITL toggle failed:", err);
      set({ enabled: prev }); // revert on failure
    }
  },

  setPending: (query, description, data) => {
    set({ pendingQuery: query, pendingDescription: description, pendingData: data });
  },

  clearPending: () => {
    set({ pendingQuery: null, pendingDescription: null, pendingData: null });
  },
}));
