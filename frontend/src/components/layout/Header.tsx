import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { ProviderSelect } from "../providers/ProviderSelect";
import { useHitlStore } from "../../stores/hitl";
import { useChatStore } from "../../stores/chat";
import { useUsageStore } from "../../stores/usage";
import { MiddlewarePanel } from "./MiddlewarePanel";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  Layers,
  ScrollText,
  Settings2,
  RotateCcw,
  Palette,
} from "lucide-react";

const TITLE_MAP: Record<string, string> = {
  "/": "// chat",
  "/documents": "// documents",
  "/finetune": "// fine_tune",
};

const THEMES = [
  { id: "default", label: "Green", color: "#00FF88" },
  { id: "theme-pink", label: "Pink", color: "#FF69B4" },
  { id: "theme-cyan", label: "Cyan", color: "#00D4FF" },
  { id: "theme-light", label: "Light", color: "#0052FF" },
];

export function Header({
  ctxVisible,
  onToggleCtx,
  logsVisible,
  onToggleLogs,
}: {
  ctxVisible: boolean;
  onToggleCtx: () => void;
  logsVisible?: boolean;
  onToggleLogs?: () => void;
}) {
  const { enabled, toggle } = useHitlStore();
  const { resetChat, isStreaming, status } = useChatStore();
  const { totalTokens, totalCost, requestCount } = useUsageStore();
  const [mwOpen, setMwOpen] = useState(false);
  const location = useLocation();

  const [currentTheme, setCurrentTheme] = useState(
    () => localStorage.getItem("neo-theme") || "default",
  );
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    THEMES.forEach((t) => document.documentElement.classList.remove(t.id));
    if (currentTheme !== "default") {
      document.documentElement.classList.add(currentTheme);
    }
    localStorage.setItem("neo-theme", currentTheme);
  }, [currentTheme]);

  const resolvedTitle =
    TITLE_MAP[location.pathname] || "// chat";

  return (
    <header className="flex h-14 items-center justify-between border-b border-dashed border-border-default bg-surface-dim px-6">
      {/* Left: Page title */}
      <h1 className="font-mono text-xs text-text-muted">{resolvedTitle}</h1>

      {/* Right: Controls */}
      <div className="flex items-center gap-4">
        {/* Provider select */}
        <ProviderSelect />

        <div className="w-px h-5 bg-border-default" />

        {/* HITL toggle */}
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] text-text-dim uppercase tracking-wider hidden lg:inline">
            HITL
          </span>
          <Switch checked={enabled} onCheckedChange={toggle} />
        </div>

        <div className="w-px h-5 bg-border-default" />

        {/* Middleware */}
        <button
          onClick={() => setMwOpen(!mwOpen)}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[11px] transition-colors ${
            mwOpen ? "text-cb-blue bg-cb-blue/10" : "text-text-dim hover:text-cb-blue"
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">MW</span>
        </button>
        <MiddlewarePanel visible={mwOpen} onClose={() => setMwOpen(false)} />

        {/* Context */}
        <button
          onClick={onToggleCtx}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[11px] transition-colors ${
            ctxVisible ? "text-cb-blue bg-cb-blue/10" : "text-text-dim hover:text-cb-blue"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Ctx</span>
        </button>

        {/* Logs */}
        {onToggleLogs && (
          <button
            onClick={onToggleLogs}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-mono text-[11px] transition-colors ${
              logsVisible ? "text-cb-blue bg-cb-blue/10" : "text-text-dim hover:text-cb-blue"
            }`}
          >
            <ScrollText className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Logs</span>
          </button>
        )}

        <div className="w-px h-5 bg-border-default" />

        {/* Status */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: status === "error" ? "#FF4444" : "#00FF88",
              opacity: status === "streaming" ? 1 : 0.4,
              animation: status === "streaming" ? "pulse-dot 1s ease-in-out infinite" : "none",
            }}
          />
          <Badge variant="outline" className="font-mono text-[11px] h-6 px-2.5 rounded-md border-dashed">
            {isStreaming ? "streaming" : "ready"}
          </Badge>
        </div>

        {requestCount > 0 && (
          <span className="font-mono text-[11px] text-text-dim">
            {totalTokens.toLocaleString()} tok · ${totalCost.toFixed(4)}
          </span>
        )}

        {/* Reset */}
        <button
          onClick={resetChat}
          className="p-1.5 rounded-md text-text-dim hover:text-cb-red transition-colors"
          title="Reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Theme picker */}
        <div className="relative">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] text-text-dim hover:text-cb-blue transition-colors"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
          {showPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 rounded-lg border border-dashed border-border-default bg-surface-base p-3 shadow-xl min-w-[120px]">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setCurrentTheme(t.id); setShowPicker(false); }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 font-mono text-[11px] transition-colors ${
                      currentTheme === t.id ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
