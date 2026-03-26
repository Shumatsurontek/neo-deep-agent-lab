import { useEffect } from "react";
import { useMiddlewareStore } from "../../stores/middleware";

export function MiddlewarePanel({ visible, onClose }: { visible: boolean; onClose: () => void }): React.ReactElement | null {
  const { items, load, toggle } = useMiddlewareStore();

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  if (!visible) return null;

  return (
    <div
      className="absolute right-0 top-full z-40 font-mono animate-fade-in"
      style={{
        width: "300px",
        background: "var(--color-bg-elevated)",
        border: "0.5px solid var(--color-border-secondary)",
        borderRadius: "3px",
        padding: "10px",
        marginTop: "4px",
        marginRight: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
        <span className="uppercase tracking-widest" style={{ fontSize: "8px", letterSpacing: "0.12em", color: "var(--color-text-bright)" }}>
          middleware stack
        </span>
        <button
          onClick={onClose}
          style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
        >
          &times;
        </button>
      </div>

      <div className="space-y-1">
        {items.map((mw) => (
          <div
            key={mw.name}
            className="flex items-center gap-2"
            style={{ padding: "3px 0" }}
          >
            <button
              onClick={() => toggle(mw.name, !mw.enabled)}
              className="relative shrink-0 transition-colors"
              style={{
                width: "22px",
                height: "12px",
                borderRadius: "6px",
                background: mw.enabled ? "rgba(124, 214, 100, 0.3)" : "var(--color-bg-secondary)",
                border: `0.5px solid ${mw.enabled ? "rgba(124, 214, 100, 0.4)" : "var(--color-border-secondary)"}`,
                cursor: "pointer",
              }}
            >
              <div
                className="rounded-full transition-transform"
                style={{
                  width: "8px",
                  height: "8px",
                  background: "var(--color-text-bright)",
                  position: "absolute",
                  top: "1.5px",
                  transform: mw.enabled ? "translateX(11px)" : "translateX(2px)",
                }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: "9px", color: mw.enabled ? "var(--color-text-bright)" : "var(--color-text-secondary)" }}>
                {mw.name.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: "8px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {mw.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>
          loading...
        </div>
      )}
    </div>
  );
}
