import { useState } from "react";
import type { RecalledMemory } from "../../types";
import { Badge } from "../ui/badge";

export function RecallSection({ items }: { items: RecalledMemory[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        aucun souvenir rappele
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((r, i) => {
        const isExpanded = expanded === i;
        const preview = r.text.length > 120 ? r.text.slice(0, 120) + "\u2026" : r.text;

        return (
          <div
            key={i}
            className="bg-secondary rounded-xl px-4 py-3 border border-border"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <Badge variant="outline" className="text-[10px] h-5 px-2 text-cb-cyan border-cb-cyan/20 bg-cb-blue-muted rounded-md font-medium">
                {r.score.toFixed(2)}
              </Badge>
              <span className="text-[11px] text-muted-foreground font-medium">
                {r.source_thread.startsWith("rag") ? "rag" : `thread:${r.source_thread.slice(0, 8)}`}
              </span>
              <button
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="ml-auto text-[11px] text-cb-blue hover:text-cb-blue/80 bg-transparent border-0 cursor-pointer font-medium"
              >
                {isExpanded ? "collapse" : "expand"}
              </button>
            </div>
            <p
              className={`text-xs leading-relaxed text-foreground/70 ${
                isExpanded ? "whitespace-pre-wrap" : "overflow-hidden max-h-12"
              }`}
            >
              {isExpanded ? r.text : preview}
            </p>
          </div>
        );
      })}
    </div>
  );
}
