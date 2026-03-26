import type { RecalledMemory } from "../../types";

export function RecallSection({ items }: { items: RecalledMemory[] }) {
  if (!items.length) {
    return <p className="text-xs text-text-secondary italic">aucun souvenir rappele</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((r, i) => (
        <div key={i} className="text-xs bg-bg-paper border border-border rounded p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-orange/20 text-orange font-mono text-[10px]">
              {r.score.toFixed(2)}
            </span>
            <span className="text-text-secondary text-[10px]">thread:{r.source_thread.slice(0, 8)}</span>
          </div>
          <p className="text-text leading-relaxed">{r.text}</p>
        </div>
      ))}
    </div>
  );
}
