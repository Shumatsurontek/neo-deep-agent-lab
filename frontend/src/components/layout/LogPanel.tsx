import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
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
  DEBUG: "text-muted-foreground",
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
    <div className="flex flex-col h-[220px] border-t border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0 px-5 py-2.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: connected ? "var(--color-cb-green)" : "var(--color-cb-red)" }}
          />
          <span className="text-sm font-semibold text-foreground">
            Logs
          </span>
          <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
            {filtered.length}/{logs.length}
          </Badge>
        </div>

        <Select value={levelFilter} onValueChange={(v) => { if (v) setLevelFilter(v); }}>
          <SelectTrigger className="h-8 w-28 text-xs rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ALL", "DEBUG", "INFO", "WARNING", "ERROR"].map((l) => (
              <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter..."
          className="h-8 w-36 text-xs rounded-xl"
        />

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-auto select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-border accent-cb-blue"
          />
          Auto-scroll
        </label>

        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => setLogs([])}>
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Log entries */}
      <ScrollArea className="flex-1">
        <div className="text-xs leading-6 px-5 py-2 font-mono">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-center py-6 text-sm font-sans">
              {!connected ? "connecting to log stream..." : "waiting for logs..."}
            </div>
          ) : (
            filtered.map((entry, i) => (
              <div key={i} className="flex gap-3 py-px">
                <span className="text-muted-foreground shrink-0 w-[76px]">
                  {entry.timestamp.split("T")[1]?.slice(0, 12) || entry.timestamp}
                </span>
                <span className={`shrink-0 w-10 font-semibold ${LEVEL_COLORS[entry.level] || "text-foreground"}`}>
                  {entry.level.slice(0, 4)}
                </span>
                <span className="text-cb-purple/50 shrink-0 w-[130px] truncate">
                  {entry.logger}
                </span>
                <span className="text-foreground/70 flex-1 truncate">
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
