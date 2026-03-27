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
      className="fixed right-4 top-16 z-50 animate-fade-in w-[340px] bg-card border border-border rounded-2xl p-5 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">
          Middleware Stack
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-secondary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        {items.map((mw) => (
          <div
            key={mw.name}
            className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors"
          >
            <Switch
              checked={mw.enabled}
              onCheckedChange={(v) => toggle(mw.name, v)}
            />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${mw.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                {mw.name.replace(/_/g, " ")}
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {mw.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6">
          loading...
        </div>
      )}
    </div>
  );
}
