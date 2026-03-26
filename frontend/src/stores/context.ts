import { create } from "zustand";
import type { ContextData, PromptPreview } from "../types";
import { apiGet, apiPost, apiDelete } from "../lib/api";

interface ContextStore {
  data: ContextData | null;
  promptPreview: PromptPreview | null;

  refresh: () => Promise<void>;
  addUserContext: (text: string) => Promise<void>;
  removeUserContext: (index: number) => Promise<void>;
  rewardNote: (index: number, delta: number) => Promise<void>;
  loadPromptPreview: () => Promise<void>;
}

export const useContextStore = create<ContextStore>((set, get) => ({
  data: null,
  promptPreview: null,

  refresh: async () => {
    try {
      const data = await apiGet<ContextData>("/context");
      set({ data });
    } catch (err) {
      console.error("Context refresh failed:", err);
    }
  },

  addUserContext: async (text: string) => {
    await apiPost("/context", { context: text });
    await get().refresh();
  },

  removeUserContext: async (index: number) => {
    await apiDelete(`/context/${index}`);
    await get().refresh();
  },

  rewardNote: async (index: number, delta: number) => {
    await apiPost(`/scratchpad/${index}/reward`, { delta });
    await get().refresh();
  },

  loadPromptPreview: async () => {
    try {
      const data = await apiGet<PromptPreview>("/prompt-preview");
      set({ promptPreview: data });
    } catch (err) {
      console.error("Prompt preview failed:", err);
    }
  },
}));
