import { useEffect, useRef } from "react";
import { useMiddlewareStore } from "../../stores/middleware";
import { Switch } from "../ui/switch";
import { X } from "lucide-react";

export function MiddlewarePanel({ visible, onClose }: { visible: boolean; onClose: () => void }): React.ReactElement | null {
  const { items, load, toggle } = useMiddlewareStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="fixed right-4 top-16 z-50 animate-fade-in w-[340px] bg-surface-base border border-dashed border-border-default rounded-lg p-5 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-5">
        <span className="font-mono text-xs text-text-muted">
          // middleware_stack
        </span>
        <button
          onClick={onClose}
          className="text-text-dim hover:text-text-secondary transition-colors p-1 rounded hover:bg-surface-raised"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {items.map((mw) => (
          <div
            key={mw.name}
            className="flex items-center gap-4 px-4 py-3 rounded-md hover:bg-surface-raised transition-colors"
          >
            <Switch
              checked={mw.enabled}
              onCheckedChange={(v) => toggle(mw.name, v)}
            />
            <div className="flex-1 min-w-0">
              <div className={`font-mono text-xs ${mw.enabled ? "text-text-primary" : "text-text-muted"}`}>
                {mw.name.replace(/_/g, " ")}
              </div>
              <div className="font-mono text-[10px] text-text-dim truncate mt-0.5">
                {mw.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="font-mono text-xs text-text-dim text-center py-6">
          // loading...
        </div>
      )}
    </div>
  );
}
