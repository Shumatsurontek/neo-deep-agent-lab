import { useState } from "react";
import type { RecalledMemory } from "../../types";

export function RecallSection({ items }: { items: RecalledMemory[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!items.length) {
    return (
      <p style={{ fontSize: "10px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
        aucun souvenir rappele
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((r, i) => {
        const isExpanded = expanded === i;
        const preview = r.text.length > 120 ? r.text.slice(0, 120) + "…" : r.text;

        return (
          <div
            key={i}
            style={{
              background: "var(--color-bg-secondary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: "3px",
              padding: "6px 8px",
            }}
          >
            <div className="flex items-center gap-2" style={{ marginBottom: "4px" }}>
              <span
                className="font-mono"
                style={{
                  fontSize: "10px",
                  padding: "1px 5px",
                  borderRadius: "2px",
                  background: "rgba(255, 152, 0, 0.1)",
                  border: "0.5px solid rgba(255, 152, 0, 0.25)",
                  color: "var(--color-orange)",
                }}
              >
                {r.score.toFixed(2)}
              </span>
              <span
                className="font-mono"
                style={{ fontSize: "9px", color: "var(--color-text-secondary)" }}
              >
                {r.source_thread.startsWith("rag") ? "rag" : `thread:${r.source_thread.slice(0, 8)}`}
              </span>
              <button
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="ml-auto font-mono"
                style={{
                  fontSize: "9px",
                  color: "var(--color-purple)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isExpanded ? "collapse" : "expand"}
              </button>
            </div>
            <p
              className="font-mono"
              style={{
                fontSize: "10px",
                lineHeight: "160%",
                color: "var(--color-text)",
                whiteSpace: isExpanded ? "pre-wrap" : "normal",
                overflow: isExpanded ? "visible" : "hidden",
                maxHeight: isExpanded ? "none" : "40px",
              }}
            >
              {isExpanded ? r.text : preview}
            </p>
          </div>
        );
      })}
    </div>
  );
}
