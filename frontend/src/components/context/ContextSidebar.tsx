import { useState } from "react";
import { useContextStore } from "../../stores/context";
import { ScratchpadEditor } from "./ScratchpadEditor";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
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
    <aside className="w-[320px] shrink-0 flex flex-col border-l border-border bg-surface h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <span className="text-[15px] font-semibold text-foreground">Context</span>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => refresh()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-5 pt-1">
        {(["live", "prompt"] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleTabSwitch(t)}
            className={`py-3 mr-6 text-sm font-medium transition-all border-b-2 capitalize ${
              tab === t
                ? "text-cb-blue border-cb-blue"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-3">
          {tab === "live" && data && (
            <>
              {/* RAG Chunks */}
              {ragChunks.length > 0 && (
                <Section title="RAG Injected" count={ragChunks.length} color="green" defaultOpen>
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
              <Section title="Schema" count={data.schema_tables.length} color="blue">
                {data.schema_tables.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.schema_tables.map((t) => (
                      <Badge key={t} variant="outline" className="text-[11px] h-6 px-2.5 text-cb-blue border-cb-blue/20 bg-cb-blue-muted rounded-lg font-medium">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">aucune table en cache</p>
                )}
              </Section>

              {/* User Context */}
              <Section title="User Context" count={data.user_context.length} color="purple">
                <div className="space-y-2">
                  {data.user_context.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-secondary rounded-xl px-4 py-3"
                    >
                      <Badge variant="outline" className="text-[10px] h-5 shrink-0 text-cb-purple border-cb-purple/20 rounded-md font-medium">
                        {c.source}
                      </Badge>
                      <span className="flex-1 text-xs text-foreground/80 leading-relaxed">
                        {c.text}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 rounded-lg text-cb-red hover:text-cb-red"
                        onClick={() => removeUserContext(i)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Input
                    value={ctxInput}
                    onChange={(e) => setCtxInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCtx()}
                    placeholder="ajouter un contexte..."
                    className="h-9 text-sm rounded-xl"
                  />
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={handleAddCtx}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </Section>

              {/* Scratchpad */}
              <Section title="Scratchpad" count={data.scratchpad.length} color="yellow">
                {data.reward_summary.total > 0 && (
                  <div className="flex gap-4 text-xs mb-3 text-muted-foreground">
                    <span>avg <strong className="text-foreground">{data.reward_summary.avg_score.toFixed(1)}</strong></span>
                    <span className="text-cb-green font-medium">+{data.reward_summary.positive}</span>
                    <span className="text-cb-red font-medium">-{data.reward_summary.negative}</span>
                  </div>
                )}
                <div className="space-y-2">
                  {data.scratchpad.map((n, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-secondary rounded-xl px-4 py-3"
                    >
                      <span className="flex-1 text-xs text-foreground/80 leading-relaxed">
                        {n.note}
                      </span>
                      <div className="flex gap-1 shrink-0 items-center">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-cb-green border-cb-green/20 hover:bg-cb-green-muted"
                          onClick={() => rewardNote(i, 1)}
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-cb-red border-cb-red/20 hover:bg-cb-red-muted"
                          onClick={() => rewardNote(i, -1)}
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center text-xs text-muted-foreground font-medium">
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
                <Section title="Memory Recall" count={recalls.length} color="cyan">
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
                <Section title="Summary" count={1} color="muted">
                  <p className="text-sm text-foreground/70 leading-relaxed">{data.summary}</p>
                </Section>
              )}
            </>
          )}

          {tab === "prompt" && promptPreview && (
            <div className="space-y-3">
              <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
                ~{promptPreview.token_estimate} tokens
              </Badge>
              {promptPreview.sections.map((s) => (
                <Collapsible key={s.id}>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-secondary/30 transition-colors cursor-pointer">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      {s.label}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="text-xs font-mono max-h-52 overflow-auto px-4 py-3 border-t border-border whitespace-pre-wrap break-words text-foreground/60 leading-relaxed">
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
    green: "text-cb-green border-cb-green/20 bg-cb-green-muted",
    blue: "text-cb-blue border-cb-blue/20 bg-cb-blue-muted",
    purple: "text-cb-purple border-cb-purple/20 bg-cb-purple-muted",
    yellow: "text-cb-yellow border-cb-yellow/20 bg-cb-yellow-muted",
    cyan: "text-cb-cyan border-cb-cyan/20 bg-cb-blue-muted",
    muted: "text-muted-foreground border-border bg-secondary/30",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-2xl border border-border overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer">
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="text-sm font-medium text-foreground">
            {title}
          </span>
          <Badge variant="outline" className={`ml-auto text-[10px] h-5 px-2 rounded-md font-medium ${colorMap[color] || ""}`}>
            {count}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-2 border-t border-border">
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

  const colorMap: Record<string, string> = {
    green: "text-cb-green border-cb-green/20 bg-cb-green-muted",
    cyan: "text-cb-cyan border-cb-cyan/20 bg-cb-blue-muted",
  };

  const borderColor = color === "green" ? "border-l-cb-green" : "border-l-cb-cyan";

  return (
    <div
      className={`rounded-xl bg-secondary border-l-3 overflow-hidden ${borderColor}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <Badge variant="outline" className={`text-[10px] h-5 px-2 shrink-0 rounded-md font-medium ${colorMap[color] || ""}`}>
          {item.score.toFixed(2)}
        </Badge>
        <span className="text-[11px] text-muted-foreground shrink-0 font-medium">
          {displayLabel}
        </span>
        {!expanded && (
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {displayText.slice(0, 60)}
          </span>
        )}
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-3 text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap break-words">
          {displayText}
        </div>
      )}
    </div>
  );
}
