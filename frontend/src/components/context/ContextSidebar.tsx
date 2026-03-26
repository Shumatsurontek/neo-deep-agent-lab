import { useState } from "react";
import { useContextStore } from "../../stores/context";
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

  const ragChunks = data?.last_rag_chunks ?? [];
  const recalls = data?.last_recall ?? [];

  return (
    <aside
      className="shrink-0 flex flex-col font-mono h-full"
      style={{
        width: "300px",
        borderLeft: "0.5px solid var(--color-border)",
        background: "var(--color-bg-paper)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-bright)" }}>
          Context
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            style={{ fontSize: "10px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
          >
            refresh
          </button>
          <button
            onClick={onClose}
            style={{ fontSize: "16px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
        {(["live", "prompt"] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTabSwitch(t)}
            className="flex-1 uppercase tracking-widest"
            style={{
              padding: "8px 0",
              textAlign: "center",
              fontSize: "10px",
              letterSpacing: "0.12em",
              color: tab === t ? "var(--color-purple)" : "var(--color-text-secondary)",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "1.5px solid var(--color-purple)" : "1.5px solid transparent",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "10px 12px" }}>
        {tab === "live" && data && (
          <div className="space-y-2">
            {/* RAG Chunks Injected — prominent section */}
            {ragChunks.length > 0 && (
              <CollapsibleSection
                title="RAG Injected"
                badge={ragChunks.length}
                color="var(--color-green)"
                defaultOpen
              >
                <div className="space-y-1.5">
                  {ragChunks.map((r, i) => (
                    <RagChunkCard key={i} item={r} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Schema Cache */}
            <CollapsibleSection
              title="Schema"
              badge={data.schema_tables.length}
              color="var(--color-blue)"
            >
              {data.schema_tables.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {data.schema_tables.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: "10px",
                        color: "var(--color-blue)",
                        padding: "2px 6px",
                        borderRadius: "2px",
                        background: "rgba(100, 160, 255, 0.08)",
                        border: "0.5px solid rgba(100, 160, 255, 0.2)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <Empty>aucune table en cache</Empty>
              )}
            </CollapsibleSection>

            {/* User Context */}
            <CollapsibleSection
              title="User Context"
              badge={data.user_context.length}
              color="var(--color-purple)"
            >
              <div className="space-y-1">
                {data.user_context.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5"
                    style={{
                      background: "var(--color-bg-secondary)",
                      borderRadius: "3px",
                      padding: "5px 8px",
                    }}
                  >
                    <span style={{ fontSize: "9px", color: "var(--color-purple)", flexShrink: 0 }}>
                      [{c.source}]
                    </span>
                    <span className="flex-1" style={{ fontSize: "11px", color: "var(--color-text)", lineHeight: "150%" }}>
                      {c.text}
                    </span>
                    <button
                      onClick={() => removeUserContext(i)}
                      style={{ fontSize: "11px", color: "var(--color-red)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1" style={{ marginTop: "6px" }}>
                <input
                  value={ctxInput}
                  onChange={(e) => setCtxInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCtx()}
                  placeholder="ajouter un contexte..."
                  style={{
                    flex: 1,
                    fontSize: "11px",
                    color: "var(--color-text)",
                    background: "var(--color-bg-secondary)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: "3px",
                    padding: "5px 8px",
                    outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-purple)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                />
                <button
                  onClick={handleAddCtx}
                  style={{
                    fontSize: "11px",
                    color: "var(--color-purple)",
                    background: "rgba(167, 125, 255, 0.1)",
                    border: "0.5px solid rgba(167, 125, 255, 0.2)",
                    borderRadius: "3px",
                    padding: "5px 10px",
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </CollapsibleSection>

            {/* Scratchpad */}
            <CollapsibleSection
              title="Scratchpad"
              badge={data.scratchpad.length}
              color="var(--color-yellow)"
            >
              {data.reward_summary.total > 0 && (
                <div className="flex gap-3" style={{ fontSize: "10px", marginBottom: "4px", color: "var(--color-text-secondary)" }}>
                  <span>avg <b style={{ color: "var(--color-text-bright)" }}>{data.reward_summary.avg_score.toFixed(1)}</b></span>
                  <span style={{ color: "var(--color-green)" }}>+{data.reward_summary.positive}</span>
                  <span style={{ color: "var(--color-red)" }}>-{data.reward_summary.negative}</span>
                </div>
              )}
              <div className="space-y-1">
                {data.scratchpad.map((n, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5"
                    style={{ background: "var(--color-bg-secondary)", borderRadius: "3px", padding: "5px 8px" }}
                  >
                    <span className="flex-1" style={{ fontSize: "10px", color: "var(--color-text)", lineHeight: "150%" }}>
                      {n.note}
                    </span>
                    <div className="flex gap-0.5 shrink-0 items-center">
                      <MiniBtn onClick={() => rewardNote(i, 1)} color="var(--color-green)">+</MiniBtn>
                      <MiniBtn onClick={() => rewardNote(i, -1)} color="var(--color-red)">&minus;</MiniBtn>
                      <span style={{ width: "18px", fontSize: "10px", textAlign: "center", color: "var(--color-text-secondary)" }}>
                        {n.score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <ScratchpadEditor />
            </CollapsibleSection>

            {/* Memory Recall */}
            {recalls.length > 0 && (
              <CollapsibleSection
                title="Memory Recall"
                badge={recalls.length}
                color="var(--color-orange)"
              >
                <div className="space-y-1.5">
                  {recalls.map((r, i) => (
                    <RecallCard key={i} item={r} />
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Summary */}
            {data.summary && (
              <CollapsibleSection title="Summary" badge="1" color="var(--color-text-secondary)">
                <p style={{ fontSize: "10px", color: "var(--color-text)", lineHeight: "160%" }}>{data.summary}</p>
              </CollapsibleSection>
            )}
          </div>
        )}

        {tab === "prompt" && promptPreview && (
          <div className="space-y-1.5">
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
              ~{promptPreview.token_estimate} tokens
            </div>
            {promptPreview.sections.map((s) => (
              <details key={s.id} style={{ border: "0.5px solid var(--color-border)", borderRadius: "3px" }}>
                <summary style={{ padding: "6px 10px", cursor: "pointer", fontSize: "11px", color: "var(--color-text-bright)" }}>
                  {s.label}
                </summary>
                <pre style={{
                  margin: 0,
                  borderRadius: 0,
                  borderTop: "0.5px solid var(--color-border)",
                  fontSize: "10px",
                  maxHeight: "200px",
                  overflow: "auto",
                  padding: "8px 10px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {s.content}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function CollapsibleSection({
  title,
  badge,
  color,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge: number | string;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "0.5px solid var(--color-border)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2"
        style={{
          padding: "7px 10px",
          background: open ? "rgba(255,255,255,0.02)" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: "9px",
            color: "var(--color-text-secondary)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          &#x25B8;
        </span>
        <span
          className="uppercase tracking-widest"
          style={{ fontSize: "10px", letterSpacing: "0.1em", color: "var(--color-text-bright)", fontWeight: 500 }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: "9px",
            color,
            padding: "0px 5px",
            borderRadius: "3px",
            border: `0.5px solid ${color}`,
            opacity: 0.8,
            marginLeft: "auto",
          }}
        >
          {badge}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", borderTop: "0.5px solid var(--color-border)" }}>
          <div style={{ paddingTop: "8px" }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function ExpandableCard({
  item,
  accentColor,
  accentBg,
  label,
}: {
  item: { text: string; score: number; source_thread: string };
  accentColor: string;
  accentBg: string;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Parse source from text: "[source_name] actual text"
  const match = item.text.match(/^\[(.+?)\]\s*([\s\S]*)$/);
  const displayText = match?.[2] ?? item.text;
  const displayLabel = match?.[1] ?? label;
  const isLong = displayText.length > 100;

  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      style={{
        background: "var(--color-bg-secondary)",
        borderRadius: "3px",
        borderLeft: `2px solid ${accentColor}`,
      }}
    >
      <summary
        style={{
          padding: "6px 8px",
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "10px",
        }}
      >
        <span
          style={{
            fontSize: "9px",
            padding: "1px 5px",
            borderRadius: "2px",
            background: accentBg,
            border: `0.5px solid ${accentColor}`,
            color: accentColor,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {item.score.toFixed(2)}
        </span>
        <span style={{ fontSize: "9px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
          {displayLabel}
        </span>
        {!expanded && (
          <span style={{
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}>
            {displayText.slice(0, 60)}
          </span>
        )}
        {isLong && (
          <span style={{ fontSize: "9px", color: "var(--color-purple)", marginLeft: "auto", flexShrink: 0 }}>
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </summary>
      <div style={{
        padding: "0 8px 8px",
        fontSize: "10px",
        lineHeight: "160%",
        color: "var(--color-text)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {displayText}
      </div>
    </details>
  );
}

function RagChunkCard({ item }: { item: { text: string; score: number; source_thread: string } }) {
  return (
    <ExpandableCard
      item={item}
      accentColor="var(--color-green)"
      accentBg="rgba(124, 214, 100, 0.1)"
      label="rag"
    />
  );
}

function RecallCard({ item }: { item: { text: string; score: number; source_thread: string } }) {
  return (
    <ExpandableCard
      item={item}
      accentColor="var(--color-orange)"
      accentBg="rgba(255, 152, 0, 0.1)"
      label={`thread:${item.source_thread.slice(0, 8)}`}
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
      {children}
    </p>
  );
}

function MiniBtn({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "18px",
        height: "18px",
        fontSize: "11px",
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
