import { create } from "zustand";
import type { Message, ContextData } from "../types";

export interface AgentState {
  id: string;
  name: string;
  token: string;
  threadId: string;
  messages: Message[];
  isStreaming: boolean;
  contextData: ContextData | null;
  createdAt: number;
}

interface AgentsStore {
  agents: Record<string, AgentState>;
  activeAgentId: string | null;

  addAgent: (agent: AgentState) => void;
  switchAgent: (id: string) => void;
  removeAgent: (id: string) => void;
  renameAgent: (id: string, name: string) => void;
  updateAgent: (id: string, patch: Partial<AgentState>) => void;
  getActive: () => AgentState | null;
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: {},
  activeAgentId: null,

  addAgent: (agent) =>
    set((s) => ({
      agents: { ...s.agents, [agent.id]: agent },
      activeAgentId: agent.id,
    })),

  switchAgent: (id) => set({ activeAgentId: id }),

  removeAgent: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.agents;
      const newActive =
        s.activeAgentId === id
          ? Object.keys(rest)[0] ?? null
          : s.activeAgentId;
      return { agents: rest, activeAgentId: newActive };
    }),

  renameAgent: (id, name) =>
    set((s) => {
      const agent = s.agents[id];
      if (!agent) return s;
      return { agents: { ...s.agents, [id]: { ...agent, name } } };
    }),

  updateAgent: (id, patch) =>
    set((s) => {
      const agent = s.agents[id];
      if (!agent) return s;
      return { agents: { ...s.agents, [id]: { ...agent, ...patch } } };
    }),

  getActive: () => {
    const s = get();
    return s.activeAgentId ? s.agents[s.activeAgentId] ?? null : null;
  },
}));
