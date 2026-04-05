import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat";
import { MessageBubble } from "./MessageBubble";
import { ArrowUp, Terminal } from "lucide-react";

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

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center w-full max-w-lg px-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-cb-blue/30 bg-cb-blue/5 mx-auto mb-8">
                <Terminal className="h-10 w-10 text-cb-blue" />
              </div>
              <h1 className="font-mono text-xl font-bold text-cb-blue mb-3 tracking-tight">
                NEO_DEEP_AGENT
              </h1>
              <p className="font-mono text-xs text-text-muted leading-relaxed mb-10 max-w-sm mx-auto">
                // interroge la base Neo en langage naturel
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                {[
                  "Quelles sont les tables disponibles ?",
                  "Combien d'utilisateurs actifs ?",
                  "Top 10 transactions ce mois",
                  "Schema de la table users",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(""); sendMessage(q); }}
                    className="group text-left font-mono text-xs text-text-muted p-5 rounded-lg border border-dashed border-border-default bg-surface-base hover:border-cb-blue/30 hover:bg-cb-blue/5 hover:text-cb-blue transition-all cursor-pointer"
                  >
                    <span className="text-cb-blue/40 group-hover:text-cb-blue mr-1 transition-colors">&gt;</span>
                    <span className="leading-snug">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-8 lg:px-12 py-8">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-dashed border-border-default bg-surface-dim">
        <div className="px-8 lg:px-12 py-5">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="query()..."
              rows={1}
              className="w-full resize-none min-h-[52px] max-h-[160px] font-mono text-sm bg-surface-base border border-dashed border-border-default rounded-lg px-5 pr-14 py-3.5 text-text-primary placeholder:text-text-dim focus:border-cb-blue focus:ring-1 focus:ring-cb-blue outline-none transition-all"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="absolute right-3 bottom-3 h-10 w-10 rounded-lg flex items-center justify-center bg-cb-blue text-surface-dim hover:bg-cb-blue-hover disabled:opacity-20 disabled:bg-text-dim transition-all font-bold"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
