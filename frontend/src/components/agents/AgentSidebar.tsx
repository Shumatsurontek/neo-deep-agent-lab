import { useState } from "react";
import { useAgentsStore, type AgentState } from "../../stores/agents";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Plus, X, Pencil, Trash2 } from "lucide-react";

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
    <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-[15px] font-semibold text-foreground">Threads</span>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onNewAgent} title="New thread">
            <Plus className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1">
        {agentList.length === 0 ? (
          <p className="text-sm text-muted-foreground p-5">No threads yet.</p>
        ) : (
          agentList.map((agent) => {
            const isActive = agent.id === activeAgentId;
            return (
              <div
                key={agent.id}
                onClick={() => switchAgent(agent.id)}
                className={`px-5 py-4 cursor-pointer border-b border-border transition-all group ${
                  isActive
                    ? "bg-cb-blue/5 border-l-3 border-l-cb-blue"
                    : "hover:bg-secondary/50 border-l-3 border-l-transparent"
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
                    className="h-9 text-sm rounded-xl"
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground truncate flex-1">
                        {agent.name}
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(agent);
                          }}
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-cb-red hover:text-cb-red"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAgent(agent.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-3">
                      <span>{agent.messages.length} msgs</span>
                      {agent.isStreaming && (
                        <span className="text-cb-green font-medium animate-pulse">streaming</span>
                      )}
                      <span>{new Date(agent.createdAt).toLocaleTimeString()}</span>
                    </div>
                    {agent.messages.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate mt-1.5 leading-relaxed">
                        {agent.messages[agent.messages.length - 1]!.content.slice(0, 80)}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </ScrollArea>
    </aside>
  );
}
