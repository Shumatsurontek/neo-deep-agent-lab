import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAgentsStore, type AgentState } from "../../stores/agents";
import { Input } from "../ui/input";
import {
  Terminal,
  FileText,
  Cpu,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

interface Props {
  onNewAgent: () => void;
}

const NAV_ITEMS = [
  { label: "Chat", path: "/", icon: <Terminal className="h-4 w-4" /> },
  { label: "Docs", path: "/documents", icon: <FileText className="h-4 w-4" /> },
  { label: "Fine-tune", path: "/finetune", icon: <Cpu className="h-4 w-4" /> },
];

export function Sidebar({ onNewAgent }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { agents, activeAgentId, switchAgent, removeAgent, renameAgent } = useAgentsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const agentList = Object.values(agents).sort((a, b) => b.createdAt - a.createdAt);
  const isChatSection = location.pathname === "/" || (!location.pathname.startsWith("/documents") && !location.pathname.startsWith("/finetune"));

  const startRename = (agent: AgentState) => {
    setEditingId(agent.id);
    setEditName(agent.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      renameAgent(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-dashed border-border-default bg-surface-dim">
      {/* Logo */}
      <a
        href="/"
        className="flex items-center gap-2.5 px-5 py-5 transition-opacity hover:opacity-80"
        onClick={(e) => { e.preventDefault(); navigate("/"); }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cb-blue/10">
          <Terminal className="h-4 w-4 text-cb-blue" />
        </div>
        <span className="font-mono text-sm font-bold text-cb-blue">NEO_DEEP</span>
      </a>

      {/* New thread button */}
      <div className="px-4 pb-4">
        <button
          onClick={onNewAgent}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-cb-blue/30 bg-transparent px-4 py-2.5 font-mono text-xs text-cb-blue transition-all hover:border-cb-blue hover:bg-cb-blue/5"
        >
          <Plus className="h-3.5 w-3.5" />
          new_thread()
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === "/"
              ? isChatSection
              : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-mono text-xs transition-colors ${
                isActive
                  ? "bg-cb-blue/10 text-cb-blue"
                  : "text-text-muted hover:text-cb-blue/70 hover:bg-surface-base"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Separator */}
      <div className="mx-4 border-t border-dashed border-border-default" />

      {/* Thread list */}
      {isChatSection && (
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-3 px-2 font-mono text-[10px] uppercase tracking-widest text-text-dim">
            // threads
          </p>
          {agentList.length === 0 ? (
            <p className="px-2 font-mono text-xs text-text-dim">no threads yet</p>
          ) : (
            agentList.map((agent) => {
              const isActive = agent.id === activeAgentId;
              return (
                <div
                  key={agent.id}
                  onClick={() => switchAgent(agent.id)}
                  className={`group cursor-pointer rounded-lg px-3 py-3 mb-1 transition-colors ${
                    isActive
                      ? "bg-cb-blue/10 text-cb-blue"
                      : "text-text-muted hover:text-text-secondary hover:bg-surface-base"
                  }`}
                >
                  {editingId === agent.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-7 text-xs rounded-md border-dashed"
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs truncate flex-1">
                          {agent.name}
                        </span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-1.5 rounded-md hover:bg-surface-raised transition-colors"
                            onClick={(e) => { e.stopPropagation(); startRename(agent); }}
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            className="p-1.5 rounded-md hover:bg-surface-raised text-cb-red transition-colors"
                            onClick={(e) => { e.stopPropagation(); removeAgent(agent.id); }}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 mt-1.5 font-mono text-[10px] text-text-dim">
                        <span>{agent.messages.length} msgs</span>
                        {agent.isStreaming && (
                          <span className="text-cb-green animate-pulse">streaming</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {!isChatSection && <div className="flex-1" />}

      {/* Footer */}
      <div className="border-t border-dashed border-border-default px-5 py-4">
        <p className="font-mono text-[10px] text-text-ghost">neo_deep_agent // v0.1</p>
      </div>
    </aside>
  );
}
