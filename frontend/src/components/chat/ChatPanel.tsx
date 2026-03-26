import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat";
import { MessageBubble } from "./MessageBubble";

export function ChatPanel() {
  const { messages, isStreaming, sendMessage } = useChatStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center" style={{ maxWidth: "400px" }}>
              <div
                className="font-mono flex items-center justify-center mx-auto"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "var(--color-bg-secondary)",
                  fontSize: "16px",
                  color: "var(--color-purple)",
                  fontWeight: 600,
                  marginBottom: "20px",
                }}
              >
                N
              </div>
              <h2
                className="font-mono"
                style={{ fontSize: "14px", fontWeight: 300, color: "var(--color-text-bright)", marginBottom: "8px", letterSpacing: "0.03em" }}
              >
                Neo Deep Agent
              </h2>
              <p
                className="font-mono"
                style={{ fontSize: "11px", fontWeight: 300, color: "var(--color-text-secondary)", lineHeight: "180%", marginBottom: "20px" }}
              >
                Interroge la base Neo en langage naturel. L'agent genere du SQL,
                l'execute dans un sandbox, et repond en francais.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  "Quelles sont les tables disponibles ?",
                  "Combien d'utilisateurs actifs ?",
                  "Top 10 transactions ce mois",
                  "Schema de la table users",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(""); sendMessage(q); }}
                    className="text-left font-mono transition-all"
                    style={{
                      fontSize: "10px",
                      fontWeight: 300,
                      padding: "6px 10px",
                      borderRadius: "2px",
                      border: "0.5px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-purple)"; e.currentTarget.style.color = "var(--color-text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
          ))}
          {/* Streaming indicator handled by MessageBubble isLast */}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input bar — ultra minimal */}
      <div style={{ borderTop: "0.5px solid var(--color-border)", background: "var(--color-bg-paper)" }}>
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2"
          style={{ maxWidth: "720px", margin: "0 auto", padding: "10px 24px 12px" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Pose ta question... (Enter pour envoyer, Shift+Enter pour retour a la ligne)"
            rows={1}
            className="flex-1 font-mono resize-none"
            style={{
              fontSize: "12px",
              fontWeight: 300,
              color: "var(--color-text)",
              background: "var(--color-bg-secondary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: "3px",
              padding: "8px 12px",
              minHeight: "38px",
              maxHeight: "100px",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-purple)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="font-mono shrink-0 transition-opacity"
            style={{
              fontSize: "10px",
              fontWeight: 400,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-bg)",
              background: "var(--color-purple)",
              border: "none",
              borderRadius: "3px",
              padding: "9px 16px",
              cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
              opacity: isStreaming || !input.trim() ? 0.25 : 1,
            }}
          >
            {isStreaming ? "..." : "send"}
          </button>
        </form>
      </div>
    </div>
  );
}
