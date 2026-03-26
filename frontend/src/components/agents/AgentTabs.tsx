import { useAgentsStore } from "../../stores/agents";

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
    <div
      className="flex items-center overflow-x-auto"
      style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-bg-paper)" }}
    >
      {agentList.map((agent) => (
        <div
          key={agent.id}
          onClick={() => switchAgent(agent.id)}
          className="flex items-center gap-1.5 shrink-0 group font-mono transition-colors"
          style={{
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: "9px",
            color: agent.id === activeAgentId ? "var(--color-purple)" : "var(--color-text-secondary)",
            borderBottom: agent.id === activeAgentId ? "1px solid var(--color-purple)" : "1px solid transparent",
            background: agent.id === activeAgentId ? "rgba(167, 125, 255, 0.03)" : "transparent",
          }}
        >
          {agent.isStreaming && (
            <span className="rounded-full animate-pulse" style={{ width: "4px", height: "4px", background: "var(--color-green)" }} />
          )}
          <span className="truncate" style={{ maxWidth: "100px" }}>{agent.name}</span>
          {agentList.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeAgent(agent.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ fontSize: "9px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
            >
              &times;
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onNewAgent}
        className="shrink-0 font-mono"
        title="New thread"
        style={{ padding: "4px 8px", fontSize: "9px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
      >
        +
      </button>
    </div>
  );
}
