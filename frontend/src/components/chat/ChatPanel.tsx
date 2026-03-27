import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../../stores/chat";
import { MessageBubble } from "./MessageBubble";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { ArrowUp, Sparkles } from "lucide-react";

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
              <div className="w-16 h-16 rounded-2xl bg-cb-blue flex items-center justify-center text-white text-2xl font-bold mx-auto mb-8">
                N
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-3 tracking-tight">
                Neo Deep Agent
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed mb-10 max-w-sm mx-auto">
                Interroge la base Neo en langage naturel. L&apos;agent genere du SQL,
                l&apos;execute dans un sandbox, et repond en francais.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                {[
                  "Quelles sont les tables disponibles ?",
                  "Combien d'utilisateurs actifs ?",
                  "Top 10 transactions ce mois",
                  "Schema de la table users",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(""); sendMessage(q); }}
                    className="group text-left text-sm text-muted-foreground p-4 rounded-2xl border border-border bg-surface hover:border-cb-blue/30 hover:bg-cb-blue/5 hover:text-foreground transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 mb-2 text-cb-blue/40 group-hover:text-cb-blue transition-colors" />
                    <span className="leading-snug">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-6 lg:px-10 py-6">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar — fixed at bottom, always full width */}
      <div className="shrink-0 border-t border-border bg-surface">
        <div className="px-6 lg:px-10 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Pose ta question..."
              rows={1}
              className="w-full resize-none min-h-[52px] max-h-[160px] text-sm bg-secondary border-border rounded-2xl pl-5 pr-14 py-3.5 focus-visible:ring-2 focus-visible:ring-cb-blue/30 focus-visible:border-cb-blue/40"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isStreaming || !input.trim()}
              className="absolute right-3 bottom-3 h-9 w-9 rounded-xl bg-cb-blue text-white hover:bg-cb-blue-hover disabled:opacity-20 disabled:bg-muted-foreground transition-all"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
