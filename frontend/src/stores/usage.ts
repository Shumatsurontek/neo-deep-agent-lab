import { create } from "zustand";

interface UsageStore {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  addMetrics: (tokens: number, cost: number) => void;
  reset: () => void;
}

export const useUsageStore = create<UsageStore>((set) => ({
  totalTokens: 0,
  totalCost: 0,
  requestCount: 0,
  addMetrics: (tokens, cost) =>
    set((s) => ({
      totalTokens: s.totalTokens + tokens,
      totalCost: s.totalCost + cost,
      requestCount: s.requestCount + 1,
    })),
  reset: () => set({ totalTokens: 0, totalCost: 0, requestCount: 0 }),
}));
