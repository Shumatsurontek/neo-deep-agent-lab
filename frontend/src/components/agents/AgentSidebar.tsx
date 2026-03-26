import { useState } from "react";
import { useAgentsStore, type AgentState } from "../../stores/agents";

interface Props {
  visible: boolean;
  onClose: () => void;
  onNewAgent: () => void;
}

export function AgentSidebar({ visible, onClose, onNewAgent }: Props) {
  const { agents, activeAgentId, switchAgent, removeAgent, renameAgent } = useAgentsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const agentList = Object.values(agents).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

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

  if (!visible) return null;

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-paper overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-mono text-text-bright text-sm">Threads</span>
        <div className="flex gap-2">
          <button
            onClick={onNewAgent}
            className="text-purple hover:opacity-80 text-sm font-mono"
            title="New thread"
          >
            +
          </button>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text text-lg"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {agentList.length === 0 ? (
          <p className="text-xs text-text-secondary italic p-4">No threads yet.</p>
        ) : (
          agentList.map((agent) => (
            <div
              key={agent.id}
              onClick={() => switchAgent(agent.id)}
              className={`px-4 py-2.5 cursor-pointer border-b border-border transition-colors group ${
                agent.id === activeAgentId
                  ? "bg-purple/10 border-l-2 border-l-purple"
                  : "hover:bg-bg-secondary border-l-2 border-l-transparent"
              }`}
            >
              {editingId === agent.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="bg-bg-secondary border border-border rounded px-1.5 py-0.5 text-xs text-text w-full focus:outline-none focus:border-purple"
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-text-bright truncate flex-1">
                      {agent.name}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(agent);
                        }}
                        className="text-[10px] text-text-secondary hover:text-text"
                        title="Rename"
                      >
                        edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAgent(agent.id);
                        }}
                        className="text-[10px] text-red hover:opacity-80"
                        title="Delete"
                      >
                        del
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-text-secondary mt-0.5 flex items-center gap-2">
                    <span>{agent.messages.length} msgs</span>
                    {agent.isStreaming && (
                      <span className="text-green animate-pulse">streaming</span>
                    )}
                    <span>{new Date(agent.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {agent.messages.length > 0 && (
                    <p className="text-[10px] text-text-secondary truncate mt-0.5">
                      {agent.messages[agent.messages.length - 1]!.content.slice(0, 60)}
                    </p>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
