import { useEffect, useRef, useState } from "react";

interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "var(--color-text-secondary)",
  INFO: "var(--color-blue)",
  WARNING: "var(--color-orange)",
  ERROR: "var(--color-red)",
  CRITICAL: "var(--color-red)",
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
    <div className="flex flex-col" style={{ height: "200px", borderTop: "0.5px solid var(--color-border)", background: "var(--color-bg-paper)" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 shrink-0" style={{ padding: "4px 14px", borderBottom: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center gap-1.5">
          <div
            className="rounded-full"
            style={{ width: "5px", height: "5px", background: connected ? "var(--color-green)" : "var(--color-red)" }}
          />
          <span className="font-mono" style={{ fontSize: "9px", color: "var(--color-text-bright)", letterSpacing: "0.05em" }}>
            logs
          </span>
        </div>

        <span className="font-mono" style={{ fontSize: "8px", color: "var(--color-text-secondary)" }}>
          {filtered.length}/{logs.length}
        </span>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="font-mono"
          style={{
            fontSize: "9px",
            color: "var(--color-text)",
            background: "var(--color-bg-secondary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: "2px",
            padding: "1px 16px 1px 4px",
            outline: "none",
          }}
        >
          {["ALL", "DEBUG", "INFO", "WARNING", "ERROR"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter..."
          className="font-mono"
          style={{
            fontSize: "9px",
            color: "var(--color-text)",
            background: "var(--color-bg-secondary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: "2px",
            padding: "1px 6px",
            width: "100px",
            outline: "none",
          }}
        />

        <label className="flex items-center gap-1 font-mono ml-auto" style={{ fontSize: "8px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            style={{ width: "10px", height: "10px" }}
          />
          auto-scroll
        </label>

        <button
          onClick={() => setLogs([])}
          className="font-mono"
          style={{ fontSize: "8px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
        >
          clear
        </button>
        <button
          onClick={onClose}
          style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
        >
          &times;
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto font-mono" style={{ fontSize: "10px", lineHeight: "18px", padding: "2px 14px" }}>
        {filtered.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)", fontStyle: "italic", padding: "12px 0", textAlign: "center", fontSize: "9px" }}>
            {!connected ? "connecting to log stream..." : "waiting for logs..."}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className="flex gap-2" style={{ padding: "0 2px" }}>
              <span style={{ color: "var(--color-text-secondary)", flexShrink: 0, width: "72px" }}>
                {entry.timestamp.split("T")[1]?.slice(0, 12) || entry.timestamp}
              </span>
              <span style={{ color: LEVEL_COLORS[entry.level] || "var(--color-text)", flexShrink: 0, width: "36px" }}>
                {entry.level.slice(0, 4)}
              </span>
              <span style={{ color: "rgba(167, 125, 255, 0.5)", flexShrink: 0, width: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.logger}
              </span>
              <span style={{ color: "var(--color-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
