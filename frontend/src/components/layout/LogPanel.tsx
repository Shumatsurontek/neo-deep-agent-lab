import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { X, Trash2 } from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "text-text-muted",
  INFO: "text-cb-blue",
  WARNING: "text-cb-yellow",
  ERROR: "text-cb-red",
  CRITICAL: "text-cb-red",
};

export function LogPanel({ visible, onClose }: { visible: boolean; onClose: () => void }): React.ReactElement | null {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) return;

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await fetch("/logs/stream", { signal: controller.signal });
        if (!res.ok || !res.body) return;

        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            try {
              const entry: LogEntry = JSON.parse(trimmed.slice(6));
              setLogs((prev) => {
                const next = [...prev, entry];
                return next.length > 500 ? next.slice(-500) : next;
              });
            } catch { /* skip malformed */ }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setConnected(false);
        }
      }
    })();

    return () => {
      controller.abort();
      abortRef.current = null;
      setConnected(false);
    };
  }, [visible]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  if (!visible) return null;

  const filtered = logs.filter((l) => {
    if (levelFilter !== "ALL" && l.level !== levelFilter) return false;
    if (filter && !l.message.toLowerCase().includes(filter.toLowerCase()) && !l.logger.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-[280px] border-t border-dashed border-border-default bg-surface-dim">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0 px-5 py-3 border-b border-dashed border-border-default">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: connected ? "#00FF88" : "#FF4444" }}
          />
          <span className="font-mono text-xs text-text-muted">
            // logs
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-dashed border-border-default text-text-muted">
            {filtered.length}/{logs.length}
          </span>
        </div>

        <Select value={levelFilter} onValueChange={(v) => { if (v) setLevelFilter(v); }}>
          <SelectTrigger className="h-7 w-24 font-mono text-[10px] rounded border-dashed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="font-mono text-xs">
            {["ALL", "DEBUG", "INFO", "WARNING", "ERROR"].map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter()..."
          className="h-7 w-36 font-mono text-[10px] bg-surface-base border border-dashed border-border-default rounded px-2.5 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none"
        />

        <label className="flex items-center gap-2 font-mono text-[10px] text-text-muted cursor-pointer ml-auto select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-3 h-3 rounded accent-cb-blue"
          />
          auto_scroll
        </label>

        <button className="p-1 rounded text-text-dim hover:text-cb-yellow transition-colors" onClick={() => setLogs([])}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 rounded text-text-dim hover:text-text-secondary transition-colors" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Log entries */}
      <ScrollArea className="flex-1">
        <div className="font-mono text-[11px] leading-6 px-5 py-2">
          {filtered.length === 0 ? (
            <div className="text-text-dim text-center py-6 text-xs">
              {!connected ? "// connecting to log stream..." : "// waiting for logs..."}
            </div>
          ) : (
            filtered.map((entry, i) => (
              <div key={i} className="flex gap-3 py-px">
                <span className="text-text-dim shrink-0 w-[76px]">
                  {entry.timestamp.split("T")[1]?.slice(0, 12) || entry.timestamp}
                </span>
                <span className={`shrink-0 w-10 font-semibold ${LEVEL_COLORS[entry.level] || "text-text-primary"}`}>
                  {entry.level.slice(0, 4)}
                </span>
                <span className="text-cb-purple/50 shrink-0 w-[130px] truncate">
                  {entry.logger}
                </span>
                <span className="text-text-secondary flex-1 truncate">
                  {entry.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
