import { useAgentsStore } from "../../stores/agents";
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
    <div className="flex items-center overflow-x-auto border-b border-dashed border-border-default bg-surface-dim px-3 shrink-0">
      {agentList.map((agent) => {
        const isActive = agent.id === activeAgentId;
        return (
          <button
            key={agent.id}
            onClick={() => switchAgent(agent.id)}
            className={`flex items-center gap-2.5 shrink-0 group px-5 py-3.5 font-mono text-xs transition-all border-b-2 ${
              isActive
                ? "border-cb-blue text-cb-blue font-medium"
                : "border-transparent text-text-muted hover:text-text-secondary hover:bg-surface-base"
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
                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-cb-red ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </button>
        );
      })}
      <button
        onClick={onNewAgent}
        title="New thread"
        className="h-9 w-9 shrink-0 ml-2 rounded-lg flex items-center justify-center text-text-dim hover:text-cb-blue hover:bg-cb-blue/5 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
