import { useState } from "react";
import { useContextStore } from "../../stores/context";
import { ScratchpadEditor } from "./ScratchpadEditor";
import { ScrollArea } from "../ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  ChevronRight,
  RefreshCw,
  X,
  Plus,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

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
    <aside className="w-[320px] shrink-0 flex flex-col border-l border-dashed border-border-default bg-surface-dim h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dashed border-border-default">
        <span className="font-mono text-xs text-text-muted">// context</span>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded text-text-dim hover:text-cb-blue transition-colors"
            onClick={() => refresh()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 rounded text-text-dim hover:text-text-secondary transition-colors"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dashed border-border-default px-4 pt-1">
        {(["live", "prompt"] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTabSwitch(t)}
            className={`py-2.5 mr-6 font-mono text-xs transition-all border-b-2 ${
              tab === t
                ? "text-cb-blue border-cb-blue"
                : "text-text-muted border-transparent hover:text-text-secondary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {tab === "live" && data && (
            <>
              {/* RAG Chunks */}
              {ragChunks.length > 0 && (
                <Section title="rag_injected" count={ragChunks.length} color="green" defaultOpen>
                  <div className="space-y-2">
                    {ragChunks.map((r, i) => (
                      <ExpandableCard
                        key={i}
                        item={r}
                        color="green"
                        label="rag"
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Schema */}
              <Section title="schema" count={data.schema_tables.length} color="blue">
                {data.schema_tables.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.schema_tables.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] px-2 py-0.5 rounded border border-dashed border-cb-blue/20 text-cb-blue bg-cb-blue/5"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-text-dim">// aucune table en cache</p>
                )}
              </Section>

              {/* User Context */}
              <Section title="user_context" count={data.user_context.length} color="purple">
                <div className="space-y-2">
                  {data.user_context.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-surface-raised rounded px-3 py-2.5"
                    >
                      <span className="font-mono text-[10px] px-1.5 py-0.5 shrink-0 rounded border border-dashed border-cb-purple/20 text-cb-purple">
                        {c.source}
                      </span>
                      <span className="flex-1 font-mono text-[11px] text-text-secondary leading-relaxed">
                        {c.text}
                      </span>
                      <button
                        className="shrink-0 p-1 rounded text-cb-red hover:bg-cb-red/10 transition-colors"
                        onClick={() => removeUserContext(i)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <input
                    value={ctxInput}
                    onChange={(e) => setCtxInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCtx()}
                    placeholder="add_context()..."
                    className="flex-1 h-8 font-mono text-xs bg-surface-base border border-dashed border-border-default rounded px-3 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none"
                  />
                  <button
                    className="h-8 w-8 shrink-0 rounded flex items-center justify-center border border-dashed border-border-default text-text-muted hover:text-cb-blue hover:border-cb-blue/30 transition-colors"
                    onClick={handleAddCtx}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Section>

              {/* Scratchpad */}
              <Section title="scratchpad" count={data.scratchpad.length} color="yellow">
                {data.reward_summary.total > 0 && (
                  <div className="flex gap-4 font-mono text-[10px] mb-3 text-text-muted">
                    <span>avg <strong className="text-text-primary">{data.reward_summary.avg_score.toFixed(1)}</strong></span>
                    <span className="text-cb-green">+{data.reward_summary.positive}</span>
                    <span className="text-cb-red">-{data.reward_summary.negative}</span>
                  </div>
                )}
                <div className="space-y-2">
                  {data.scratchpad.map((n, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-surface-raised rounded px-3 py-2.5"
                    >
                      <span className="flex-1 font-mono text-[11px] text-text-secondary leading-relaxed">
                        {n.note}
                      </span>
                      <div className="flex gap-1 shrink-0 items-center">
                        <button
                          className="h-6 w-6 rounded flex items-center justify-center border border-dashed border-cb-green/20 text-cb-green hover:bg-cb-green/10 transition-colors"
                          onClick={() => rewardNote(i, 1)}
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          className="h-6 w-6 rounded flex items-center justify-center border border-dashed border-cb-red/20 text-cb-red hover:bg-cb-red/10 transition-colors"
                          onClick={() => rewardNote(i, -1)}
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-mono text-[10px] text-text-muted">
                          {n.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <ScratchpadEditor />
              </Section>

              {/* Memory Recall */}
              {recalls.length > 0 && (
                <Section title="memory_recall" count={recalls.length} color="cyan">
                  <div className="space-y-2">
                    {recalls.map((r, i) => (
                      <ExpandableCard
                        key={i}
                        item={r}
                        color="cyan"
                        label={`thread:${r.source_thread.slice(0, 8)}`}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Summary */}
              {data.summary && (
                <Section title="summary" count={1} color="muted">
                  <p className="font-mono text-[11px] text-text-secondary leading-relaxed">{data.summary}</p>
                </Section>
              )}
            </>
          )}

          {tab === "prompt" && promptPreview && (
            <div className="space-y-3">
              <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-dashed border-border-default text-text-muted">
                ~{promptPreview.token_estimate} tokens
              </span>
              {promptPreview.sections.map((s) => (
                <Collapsible key={s.id}>
                  <div className="rounded border border-dashed border-border-default overflow-hidden">
                    <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 font-mono text-xs text-text-secondary hover:bg-surface-raised transition-colors cursor-pointer">
                      <ChevronRight className="w-4 h-4 text-text-dim" />
                      {s.label}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="font-mono text-[11px] max-h-52 overflow-auto px-4 py-3 border-t border-dashed border-border-default whitespace-pre-wrap break-words text-text-muted leading-relaxed">
                        {s.content}
                      </pre>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

/* -- Sub-components -- */

function Section({
  title,
  count,
  color,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number | string;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const colorMap: Record<string, string> = {
    green: "text-cb-green border-cb-green/30",
    blue: "text-cb-blue border-cb-blue/30",
    purple: "text-cb-purple border-cb-purple/30",
    yellow: "text-cb-yellow border-cb-yellow/30",
    cyan: "text-cb-cyan border-cb-cyan/30",
    muted: "text-text-muted border-border-default",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded border border-dashed border-border-default overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-raised transition-colors cursor-pointer">
          <ChevronRight
            className={`w-4 h-4 text-text-dim transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="font-mono text-xs text-text-secondary">
            {title}
          </span>
          <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded border border-dashed ${colorMap[color] || ""}`}>
            {count}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 pt-3 border-t border-dashed border-border-default">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ExpandableCard({
  item,
  color,
  label,
}: {
  item: { text: string; score: number; source_thread: string };
  color: string;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const match = item.text.match(/^\[(.+?)\]\s*([\s\S]*)$/);
  const displayText = match?.[2] ?? item.text;
  const displayLabel = match?.[1] ?? label;

  const borderColor = color === "green" ? "border-l-cb-green" : "border-l-cb-cyan";

  return (
    <div
      className={`rounded bg-surface-raised border-l-3 overflow-hidden ${borderColor}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className={`font-mono text-[10px] px-1.5 py-0.5 shrink-0 rounded border border-dashed ${color === "green" ? "text-cb-green border-cb-green/30" : "text-cb-cyan border-cb-cyan/30"}`}>
          {item.score.toFixed(2)}
        </span>
        <span className="font-mono text-[10px] text-text-muted shrink-0">
          {displayLabel}
        </span>
        {!expanded && (
          <span className="font-mono text-[10px] text-text-dim truncate flex-1 min-w-0">
            {displayText.slice(0, 60)}
          </span>
        )}
        <ChevronRight
          className={`w-3.5 h-3.5 text-text-dim shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words">
          {displayText}
        </div>
      )}
    </div>
  );
}
