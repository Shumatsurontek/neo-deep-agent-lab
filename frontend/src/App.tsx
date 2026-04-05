import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useSessionStore } from "./stores/session";
import { useContextStore } from "./stores/context";
import { useProvidersStore } from "./stores/providers";
import { useHitlStore } from "./stores/hitl";
import { useChatStore } from "./stores/chat";
import { useAgentsStore, type AgentState } from "./stores/agents";
import { initSession, setToken } from "./lib/api";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { ChatPanel } from "./components/chat/ChatPanel";
import { ContextSidebar } from "./components/context/ContextSidebar";
import { HitlModal } from "./components/hitl/HitlModal";
import { DocumentPanel } from "./components/documents/DocumentPanel";
import { FineTunePanel } from "./components/finetune/FineTunePanel";
import { AgentTabs } from "./components/agents/AgentTabs";
import { LogPanel } from "./components/layout/LogPanel";
import { Menu } from "lucide-react";

export default function App() {
  const { ready, init } = useSessionStore();
  const refreshCtx = useContextStore((s) => s.refresh);
  const loadProviders = useProvidersStore((s) => s.load);
  const loadHitl = useHitlStore((s) => s.loadStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const chatMessages = useChatStore((s) => s.messages);

  const { agents, activeAgentId, addAgent, switchAgent, updateAgent } = useAgentsStore();
  const [ctxVisible, setCtxVisible] = useState(false);
  const [logsVisible, setLogsVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const prevAgentIdRef = useRef<string | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!ready) return;
    refreshCtx();
    loadProviders();
    loadHitl();

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

  useEffect(() => {
    if (activeAgentId && !isStreaming) {
      updateAgent(activeAgentId, { messages: chatMessages, isStreaming: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, isStreaming]);

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

  const prevStreaming = usePrevious(isStreaming);
  useEffect(() => {
    if (prevStreaming && !isStreaming) {
      refreshCtx();
      if (activeAgentId) {
        updateAgent(activeAgentId, { isStreaming: false });
      }
    }
  }, [isStreaming, prevStreaming, refreshCtx, activeAgentId, updateAgent]);

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
      <div className="h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-cb-blue/30 bg-cb-blue/5 animate-pulse">
            <span className="font-mono text-xl text-cb-blue">&gt;_</span>
          </div>
          <span className="font-mono text-sm font-bold text-cb-blue">NEO_DEEP</span>
          <span className="font-mono text-xs text-[#444]">// initializing session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 md:relative md:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <Sidebar onNewAgent={handleNewAgent} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile hamburger */}
        <div className="flex items-center md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-4 text-[#666]"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Desktop header */}
        <div className="hidden md:block">
          <Header
            ctxVisible={ctxVisible}
            onToggleCtx={() => setCtxVisible(!ctxVisible)}
            logsVisible={logsVisible}
            onToggleLogs={() => setLogsVisible(!logsVisible)}
          />
        </div>

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <AgentTabs onNewAgent={handleNewAgent} />
            <Routes>
              <Route path="/documents" element={<DocumentPanel />} />
              <Route path="/finetune" element={<FineTunePanel />} />
              <Route path="*" element={<ChatPanel />} />
            </Routes>
          </div>
          <ContextSidebar visible={ctxVisible} onClose={() => setCtxVisible(false)} />
        </div>
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
