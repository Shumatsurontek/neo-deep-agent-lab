import { create } from "zustand";
import { initSession, setToken } from "../lib/api";

interface SessionStore {
  ready: boolean;
  threadId: string | null;
  init: () => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  ready: false,
  threadId: null,

  init: async () => {
    try {
      const { thread_id, token } = await initSession();
      setToken(token);
      set({ ready: true, threadId: thread_id });
    } catch (err) {
      console.error("Session init failed:", err);
    }
  },
}));
