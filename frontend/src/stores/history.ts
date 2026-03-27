import { create } from "zustand";
import { apiGet } from "../lib/api";

export interface ThreadSummary {
  thread_id: string;
  first_message: string;
  message_count: number;
  created_at: string | null;
}

interface HistoryStore {
  threads: ThreadSummary[];
  loading: boolean;
  load: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  threads: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const data = await apiGet<{ threads: ThreadSummary[] }>("/history/threads");
      set({ threads: data.threads });
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      set({ loading: false });
    }
  },
}));
