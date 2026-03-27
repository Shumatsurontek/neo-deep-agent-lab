import { useAgentsStore } from "../../stores/agents";
import { Button } from "../ui/button";
import { X, Plus } from "lucide-react";

interface Props {
  onNewAgent: () => void;
}

export function AgentTabs({ onNewAgent }: Props) {
  const { agents, activeAgentId, switchAgent, removeAgent } = useAgentsStore();
  const agentList = Object.values(agents).sort(
    (a, b) => a.createdAt - b.createdAt,
  );

  if (agentList.length <= 1) return null;

  return (
    <div className="flex items-center overflow-x-auto border-b border-border bg-surface px-2 shrink-0">
      {agentList.map((agent) => {
        const isActive = agent.id === activeAgentId;
        return (
          <button
            key={agent.id}
            onClick={() => switchAgent(agent.id)}
            className={`flex items-center gap-2 shrink-0 group px-4 py-3 text-sm transition-all border-b-2 ${
              isActive
                ? "border-cb-blue text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            }`}
          >
            {agent.isStreaming && (
              <span className="w-2 h-2 rounded-full bg-cb-green animate-pulse" />
            )}
            <span className="truncate max-w-[120px]">{agent.name}</span>
            {agentList.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeAgent(agent.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </button>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        onClick={onNewAgent}
        title="New thread"
        className="h-8 w-8 shrink-0 ml-1 rounded-xl"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}
