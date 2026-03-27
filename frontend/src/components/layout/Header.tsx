import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ProviderSelect } from "../providers/ProviderSelect";
import { useHitlStore } from "../../stores/hitl";
import { useChatStore } from "../../stores/chat";
import { useUsageStore } from "../../stores/usage";
import { MiddlewarePanel } from "./MiddlewarePanel";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  MessageSquare,
  FileText,
  Layers,
  PanelLeft,
  ScrollText,
  Settings2,
  RotateCcw,
  Clock,
} from "lucide-react";

export function Header({
  ctxVisible,
  onToggleCtx,
  sidebarVisible,
  onToggleSidebar,
  logsVisible,
  onToggleLogs,
  historyVisible,
  onToggleHistory,
}: {
  ctxVisible: boolean;
  onToggleCtx: () => void;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  logsVisible?: boolean;
  onToggleLogs?: () => void;
  historyVisible?: boolean;
  onToggleHistory?: () => void;
}) {
  const { enabled, toggle } = useHitlStore();
  const { resetChat, isStreaming, status } = useChatStore();
  const { totalTokens, totalCost, requestCount } = useUsageStore();
  const [mwOpen, setMwOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const onDocs = location.pathname === "/documents";

  return (
    <header className="flex items-center h-14 px-5 border-b border-border bg-surface shrink-0">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cb-blue flex items-center justify-center text-white text-sm font-bold">
            N
          </div>
          <div className="hidden sm:block">
            <div className="text-[15px] font-semibold text-foreground tracking-tight leading-none">
              Neo Deep Agent
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 tracking-wide uppercase">
              sql sandbox
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center h-8 bg-secondary rounded-xl p-0.5">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-all ${
                sidebarVisible
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PanelLeft className="w-3.5 h-3.5" />
              Threads
            </button>
          )}
          {onToggleHistory && (
            <button
              onClick={onToggleHistory}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-all ${
                historyVisible
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              History
            </button>
          )}
          <button
            onClick={() => navigate(onDocs ? "/" : "/documents")}
            className={`flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-all ${
              onDocs
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {onDocs ? <MessageSquare className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            {onDocs ? "Chat" : "Docs"}
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <ProviderSelect />

        <div className="w-px h-5 bg-border mx-1" />

        {/* HITL */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase hidden lg:inline">
            HITL
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={toggle}
          />
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Toolbar buttons */}
        <Button
          variant={mwOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMwOpen(!mwOpen)}
          className="h-9 px-3 text-xs gap-2 rounded-xl"
        >
          <Settings2 className="w-4 h-4" />
          <span className="hidden xl:inline">Middleware</span>
        </Button>
        <MiddlewarePanel visible={mwOpen} onClose={() => setMwOpen(false)} />

        <Button
          variant={ctxVisible ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleCtx}
          className="h-9 px-3 text-xs gap-2 rounded-xl"
        >
          <Layers className="w-4 h-4" />
          <span className="hidden xl:inline">Context</span>
        </Button>

        {onToggleLogs && (
          <Button
            variant={logsVisible ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleLogs}
            className="h-9 px-3 text-xs gap-2 rounded-xl"
          >
            <ScrollText className="w-4 h-4" />
            <span className="hidden xl:inline">Logs</span>
          </Button>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        {/* Status + Reset */}
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: status === "streaming" ? "var(--color-cb-green)" : status === "error" ? "var(--color-cb-red)" : "var(--color-cb-green)",
              opacity: status === "streaming" ? 1 : 0.4,
              animation: status === "streaming" ? "pulse-dot 1s ease-in-out infinite" : "none",
            }}
          />
          <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
            {isStreaming ? "streaming" : "ready"}
          </Badge>
        </div>

        {requestCount > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{totalTokens.toLocaleString()} tok</span>
            <span>·</span>
            <span>${totalCost.toFixed(4)}</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={resetChat}
          className="h-9 w-9 px-0 rounded-xl text-muted-foreground hover:text-cb-red"
          title="Reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      </div>
    </header>
  );
}
