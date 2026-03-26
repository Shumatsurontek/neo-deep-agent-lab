import { useState } from "react";
import { useContextStore } from "../../stores/context";
import { RecallSection } from "./RecallSection";
import { ScratchpadEditor } from "./ScratchpadEditor";

export function ContextSidebar({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, promptPreview, refresh, addUserContext, removeUserContext, rewardNote, loadPromptPreview } =
    useContextStore();
  const [tab, setTab] = useState<"live" | "prompt">("live");
  const [ctxInput, setCtxInput] = useState("");

  const handleAddCtx = async () => {
    const text = ctxInput.trim();
    if (!text) return;
    await addUserContext(text);
    setCtxInput("");
  };

  const handleTabSwitch = (t: "live" | "prompt") => {
    setTab(t);
    if (t === "prompt") loadPromptPreview();
    if (t === "live") refresh();
  };

  if (!visible) return null;

  return (
    <aside
      className="shrink-0 overflow-y-auto font-mono"
      style={{ width: "280px", borderLeft: "0.5px solid var(--color-border)", background: "var(--color-bg-paper)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--color-border)" }}>
        <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--color-text-bright)", letterSpacing: "0.03em" }}>
          Context Engineering
        </span>
        <button
          onClick={onClose}
          style={{ fontSize: "14px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
        {(["live", "prompt"] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTabSwitch(t)}
            className="flex-1 uppercase tracking-widest transition-colors"
            style={{
              padding: "6px 0",
              textAlign: "center",
              fontSize: "8px",
              letterSpacing: "0.15em",
              color: tab === t ? "var(--color-purple)" : "var(--color-text-secondary)",
              borderBottom: tab === t ? "1px solid var(--color-purple)" : "1px solid transparent",
              background: "none",
              border: "none",
              borderBottomWidth: "1px",
              borderBottomStyle: "solid",
              borderBottomColor: tab === t ? "var(--color-purple)" : "transparent",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "live" && data && (
        <div style={{ padding: "10px" }} className="space-y-3">
          {/* Schema Cache */}
          <Section title="schema cache" badge={data.schema_tables.length} color="var(--color-green)">
            {data.schema_tables.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {data.schema_tables.map((t) => (
                  <span
                    key={t}
                    style={{ fontSize: "9px", color: "var(--color-green)", padding: "1px 5px", borderRadius: "2px", background: "rgba(124, 214, 100, 0.08)", border: "0.5px solid rgba(124, 214, 100, 0.15)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "9px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>vide</p>
            )}
          </Section>

          {/* User Context */}
          <Section title="user context" badge={data.user_context.length} color="var(--color-blue)">
            <div className="space-y-1">
              {data.user_context.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5" style={{ background: "var(--color-bg-secondary)", borderRadius: "2px", padding: "4px 6px" }}>
                  <span style={{ fontSize: "8px", color: "var(--color-blue)" }}>[{c.source}]</span>
                  <span className="flex-1" style={{ fontSize: "9px", color: "var(--color-text)" }}>{c.text}</span>
                  <button
                    onClick={() => removeUserContext(i)}
                    style={{ fontSize: "9px", color: "var(--color-red)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1" style={{ marginTop: "4px" }}>
              <input
                value={ctxInput}
                onChange={(e) => setCtxInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCtx()}
                placeholder="regle metier, hint..."
                style={{
                  flex: 1,
                  fontSize: "9px",
                  color: "var(--color-text)",
                  background: "var(--color-bg-secondary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: "2px",
                  padding: "3px 6px",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-purple)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
              />
              <button
                onClick={handleAddCtx}
                style={{
                  fontSize: "9px",
                  color: "var(--color-purple)",
                  background: "rgba(167, 125, 255, 0.1)",
                  border: "0.5px solid rgba(167, 125, 255, 0.2)",
                  borderRadius: "2px",
                  padding: "3px 8px",
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>
          </Section>

          {/* Scratchpad */}
          <Section title="scratchpad" badge={data.scratchpad.length} color="var(--color-purple)">
            {data.reward_summary.total > 0 && (
              <div className="flex gap-3" style={{ fontSize: "9px", marginBottom: "4px" }}>
                <span>avg <span style={{ color: "var(--color-text-bright)" }}>{data.reward_summary.avg_score.toFixed(1)}</span></span>
                <span style={{ color: "var(--color-green)" }}>+{data.reward_summary.positive}</span>
                <span style={{ color: "var(--color-red)" }}>-{data.reward_summary.negative}</span>
              </div>
            )}
            <div className="space-y-1">
              {data.scratchpad.map((n, i) => (
                <div key={i} className="flex items-start gap-1.5" style={{ background: "var(--color-bg-secondary)", borderRadius: "2px", padding: "4px 6px" }}>
                  <span className="flex-1" style={{ fontSize: "9px", color: "var(--color-text)" }}>{n.note}</span>
                  <div className="flex gap-0.5 shrink-0">
                    <MiniBtn onClick={() => rewardNote(i, 1)} color="var(--color-green)">+</MiniBtn>
                    <MiniBtn onClick={() => rewardNote(i, -1)} color="var(--color-red)">-</MiniBtn>
                    <span style={{ width: "16px", fontSize: "8px", textAlign: "center", color: "var(--color-text-secondary)" }}>{n.score}</span>
                  </div>
                </div>
              ))}
            </div>
            <ScratchpadEditor />
          </Section>

          {/* Recalled */}
          <Section title="recalled" badge={data.last_recall.length} color="var(--color-orange)">
            <RecallSection items={data.last_recall} />
          </Section>

          {/* Summary */}
          <Section title="summary" badge={data.summary ? "1" : "-"} color="var(--color-yellow)">
            {data.summary ? (
              <p style={{ fontSize: "9px", color: "var(--color-text)" }}>{data.summary}</p>
            ) : (
              <p style={{ fontSize: "9px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>aucun resume</p>
            )}
          </Section>
        </div>
      )}

      {tab === "prompt" && promptPreview && (
        <div style={{ padding: "10px" }} className="space-y-1.5">
          <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
            ~{promptPreview.token_estimate} tokens
          </div>
          {promptPreview.sections.map((s) => (
            <details key={s.id} style={{ border: "0.5px solid var(--color-border)", borderRadius: "2px" }}>
              <summary style={{ padding: "4px 8px", cursor: "pointer", fontSize: "9px", color: "var(--color-text-bright)" }}>
                {s.label}
              </summary>
              <pre style={{ margin: 0, borderRadius: 0, borderTop: "0.5px solid var(--color-border)", fontSize: "9px", maxHeight: "200px", overflow: "auto", padding: "6px 8px" }}>
                {s.content}
              </pre>
            </details>
          ))}
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  badge,
  color,
  children,
}: {
  title: string;
  badge: number | string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: "4px" }}>
        <span className="uppercase tracking-widest" style={{ fontSize: "8px", letterSpacing: "0.12em", color: "var(--color-text-bright)" }}>
          {title}
        </span>
        <span
          style={{
            fontSize: "8px",
            color,
            padding: "0px 4px",
            borderRadius: "2px",
            border: `0.5px solid ${color}`,
            opacity: 0.7,
          }}
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function MiniBtn({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "16px",
        height: "16px",
        fontSize: "9px",
        color,
        background: "transparent",
        border: `0.5px solid ${color}`,
        borderRadius: "2px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.6,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
    >
      {children}
    </button>
  );
}
