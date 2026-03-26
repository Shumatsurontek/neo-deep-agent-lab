import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useSessionStore } from "./stores/session";
import { useContextStore } from "./stores/context";
import { useProvidersStore } from "./stores/providers";
import { useHitlStore } from "./stores/hitl";
import { useChatStore } from "./stores/chat";
import { useAgentsStore, type AgentState } from "./stores/agents";
import { initSession, setToken } from "./lib/api";
import { Header } from "./components/layout/Header";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ContextSidebar } from "./components/context/ContextSidebar";
import { HitlModal } from "./components/hitl/HitlModal";
import { DocumentPanel } from "./components/documents/DocumentPanel";
import { AgentSidebar } from "./components/agents/AgentSidebar";
import { AgentTabs } from "./components/agents/AgentTabs";
import { LogPanel } from "./components/layout/LogPanel";

export default function App() {
  const { ready, init } = useSessionStore();
  const refreshCtx = useContextStore((s) => s.refresh);
  const loadProviders = useProvidersStore((s) => s.load);
  const loadHitl = useHitlStore((s) => s.loadStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const chatMessages = useChatStore((s) => s.messages);

  const { agents, activeAgentId, addAgent, switchAgent, updateAgent } = useAgentsStore();
  const [ctxVisible, setCtxVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [logsVisible, setLogsVisible] = useState(false);

  // Track previous active agent for save/restore
  const prevAgentIdRef = useRef<string | null>(null);

  // Init session + create first agent
  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!ready) return;
    refreshCtx();
    loadProviders();
    loadHitl();

    // Auto-create first agent from the session
    const session = useSessionStore.getState();
    if (Object.keys(agents).length === 0 && session.threadId) {
      const agent: AgentState = {
        id: crypto.randomUUID(),
        name: "Agent 1",
        token: "",
        threadId: session.threadId,
        messages: [],
        isStreaming: false,
        contextData: null,
        createdAt: Date.now(),
      };
      addAgent(agent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Sync chat messages back to active agent
  useEffect(() => {
    if (activeAgentId && !isStreaming) {
      updateAgent(activeAgentId, { messages: chatMessages, isStreaming: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, isStreaming]);

  // On agent switch: save old agent messages, restore new agent messages + token
  useEffect(() => {
    if (!activeAgentId) return;
    const prev = prevAgentIdRef.current;

    if (prev && prev !== activeAgentId) {
      const chatState = useChatStore.getState();
      updateAgent(prev, {
        messages: chatState.messages,
        isStreaming: chatState.isStreaming,
      });
    }

    const agent = agents[activeAgentId];
    if (agent) {
      if (agent.token) {
        setToken(agent.token);
      }
      useChatStore.setState({
        messages: agent.messages,
        isStreaming: false,
        status: "ready",
      });
      refreshCtx();
    }

    prevAgentIdRef.current = activeAgentId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentId]);

  // Refresh context after stream ends
  const prevStreaming = usePrevious(isStreaming);
  useEffect(() => {
    if (prevStreaming && !isStreaming) {
      refreshCtx();
      if (activeAgentId) {
        updateAgent(activeAgentId, { isStreaming: false });
      }
    }
  }, [isStreaming, prevStreaming, refreshCtx, activeAgentId, updateAgent]);

  // Create new agent via new session
  const handleNewAgent = useCallback(async () => {
    try {
      const { token, thread_id } = await initSession();
      const count = Object.keys(agents).length + 1;
      const agent: AgentState = {
        id: crypto.randomUUID(),
        name: `Agent ${count}`,
        token,
        threadId: thread_id,
        messages: [],
        isStreaming: false,
        contextData: null,
        createdAt: Date.now(),
      };
      if (activeAgentId) {
        const chatState = useChatStore.getState();
        updateAgent(activeAgentId, { messages: chatState.messages });
      }
      setToken(token);
      useChatStore.setState({ messages: [], isStreaming: false, status: "ready" });
      addAgent(agent);
    } catch (err) {
      console.error("Failed to create new agent:", err);
    }
  }, [agents, activeAgentId, addAgent, updateAgent]);

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-purple/10 border border-purple/30 flex items-center justify-center text-lg font-mono text-purple font-bold mx-auto mb-4 animate-pulse">
            N
          </div>
          <div className="text-text-secondary font-mono text-sm">Initializing session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      <Header
        ctxVisible={ctxVisible}
        onToggleCtx={() => setCtxVisible(!ctxVisible)}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        logsVisible={logsVisible}
        onToggleLogs={() => setLogsVisible(!logsVisible)}
      />
      <div className="flex flex-1 overflow-hidden">
        <AgentSidebar
          visible={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
          onNewAgent={handleNewAgent}
        />
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <AgentTabs onNewAgent={handleNewAgent} />
          <Routes>
            <Route path="/documents" element={<DocumentPanel />} />
            <Route path="*" element={<ChatPanel />} />
          </Routes>
        </div>
        <ContextSidebar visible={ctxVisible} onClose={() => setCtxVisible(false)} />
      </div>
      <LogPanel visible={logsVisible} onClose={() => setLogsVisible(false)} />
      <HitlModal />
    </div>
  );
}

function usePrevious<T>(value: T): T | undefined {
  const [prev, setPrev] = useState<T | undefined>(undefined);
  useEffect(() => {
    setPrev(value);
  }, [value]);
  return prev;
}
