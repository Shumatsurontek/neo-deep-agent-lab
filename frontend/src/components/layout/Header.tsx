import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ProviderSelect } from "../providers/ProviderSelect";
import { useHitlStore } from "../../stores/hitl";
import { useChatStore } from "../../stores/chat";
import { MiddlewarePanel } from "./MiddlewarePanel";

export function Header({
  ctxVisible,
  onToggleCtx,
  sidebarVisible,
  onToggleSidebar,
  logsVisible,
  onToggleLogs,
}: {
  ctxVisible: boolean;
  onToggleCtx: () => void;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  logsVisible?: boolean;
  onToggleLogs?: () => void;
}) {
  const { enabled, toggle } = useHitlStore();
  const { resetChat, isStreaming, status } = useChatStore();
  const [mwOpen, setMwOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const onDocs = location.pathname === "/documents";

  return (
    <header
      className="flex items-center justify-between"
      style={{
        padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border)",
        background: "var(--color-bg-paper)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="font-mono flex items-center justify-center"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            border: "0.5px solid var(--color-border-secondary)",
            fontSize: "13px",
            color: "var(--color-purple)",
            fontWeight: 600,
          }}
        >
          N
        </div>
        <div className="hidden sm:block">
          <div className="font-mono" style={{ fontSize: "13px", fontWeight: 400, color: "var(--color-text-bright)", letterSpacing: "0.02em" }}>
            Neo Deep Agent
          </div>
          <div className="font-mono" style={{ fontSize: "10px", color: "var(--color-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            sql sandbox // modal
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <HeaderBtn active={!!sidebarVisible} onClick={onToggleSidebar}>threads</HeaderBtn>
        )}

        <HeaderBtn active={onDocs} onClick={() => navigate(onDocs ? "/" : "/documents")}>
          {onDocs ? "chat" : "docs"}
        </HeaderBtn>

        <Separator />
        <ProviderSelect />
        <Separator />

        {/* HITL toggle */}
        <div className="flex items-center gap-1.5" title="Human-in-the-Loop">
          <span className="font-mono uppercase" style={{ fontSize: "10px", color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}>
            hitl
          </span>
          <button
            onClick={toggle}
            className="relative transition-colors"
            style={{
              width: "32px",
              height: "16px",
              borderRadius: "8px",
              background: enabled ? "rgba(124, 214, 100, 0.3)" : "var(--color-bg-secondary)",
              border: `0.5px solid ${enabled ? "rgba(124, 214, 100, 0.4)" : "var(--color-border-secondary)"}`,
              cursor: "pointer",
            }}
          >
            <div
              className="rounded-full transition-transform"
              style={{
                width: "12px",
                height: "12px",
                background: "var(--color-text-bright)",
                position: "absolute",
                top: "1.5px",
                transform: enabled ? "translateX(17px)" : "translateX(2px)",
              }}
            />
          </button>
        </div>

        {/* Middleware panel */}
        <div className="relative">
          <HeaderBtn active={mwOpen} onClick={() => setMwOpen(!mwOpen)}>mw</HeaderBtn>
          <MiddlewarePanel visible={mwOpen} onClose={() => setMwOpen(false)} />
        </div>

        <HeaderBtn active={ctxVisible} onClick={onToggleCtx}>ctx</HeaderBtn>

        {onToggleLogs && (
          <HeaderBtn active={!!logsVisible} onClick={onToggleLogs}>logs</HeaderBtn>
        )}

        <Separator />

        {/* Status dot */}
        <div className="flex items-center gap-1.5">
          <div
            className="rounded-full"
            style={{
              width: "6px",
              height: "6px",
              background: status === "streaming" ? "var(--color-green)" : status === "error" ? "var(--color-red)" : "rgba(124, 214, 100, 0.5)",
              animation: status === "streaming" ? "pulse-dot 1s ease-in-out infinite" : "none",
            }}
          />
          <span className="font-mono" style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
            {isStreaming ? "streaming" : "ready"}
          </span>
        </div>

        <button
          onClick={resetChat}
          className="font-mono uppercase tracking-wider transition-colors"
          style={{
            fontSize: "10px",
            letterSpacing: "0.08em",
            color: "var(--color-text-secondary)",
            padding: "4px 10px",
            border: "0.5px solid var(--color-border)",
            borderRadius: "3px",
            background: "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-red)"; e.currentTarget.style.borderColor = "var(--color-red)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
        >
          reset
        </button>
      </div>
    </header>
  );
}

function Separator() {
  return <div style={{ width: "0.5px", height: "14px", background: "var(--color-border)", margin: "0 3px" }} />;
}

function HeaderBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="font-mono uppercase tracking-wider transition-all"
      style={{
        fontSize: "10px",
        letterSpacing: "0.08em",
        padding: "4px 10px",
        borderRadius: "3px",
        border: `0.5px solid ${active ? "rgba(167, 125, 255, 0.4)" : "var(--color-border)"}`,
        color: active ? "var(--color-purple)" : "var(--color-text-secondary)",
        background: active ? "rgba(167, 125, 255, 0.06)" : "transparent",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active) { e.currentTarget.style.color = "var(--color-text)"; e.currentTarget.style.borderColor = "var(--color-border-secondary)"; }
      }}
      onMouseLeave={(e) => {
        if (!active) { e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.borderColor = "var(--color-border)"; }
      }}
    >
      {children}
    </button>
  );
}
