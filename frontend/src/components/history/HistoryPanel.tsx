import { useEffect } from "react";
import { useHistoryStore } from "../../stores/history";
import { useChatStore } from "../../stores/chat";
import { useSessionStore } from "../../stores/session";
import { setToken, initSession } from "../../lib/api";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { X, MessageSquare, Clock } from "lucide-react";

export function HistoryPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { threads, loading, load } = useHistoryStore();
  const currentThread = useSessionStore((s) => s.threadId);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  if (!visible) return null;

  const handleLoadThread = async (threadId: string) => {
    if (threadId === currentThread) {
      onClose();
      return;
    }
    // Create a new session pointing to the old thread
    // This is read-only replay — user would need to fork to continue
    try {
      // Set the thread and reload history
      setToken(""); // Clear token to use default session
      const { token } = await initSession();
      setToken(token);
      // Force the session store to use this thread
      useSessionStore.setState({ threadId: threadId });
      await useChatStore.getState().loadHistory();
      onClose();
    } catch (err) {
      console.error("Failed to load thread:", err);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);
    if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    const diffD = diffH / 24;
    if (diffD < 7) return `${Math.round(diffD)}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="w-72 border-l border-border bg-surface shrink-0 flex flex-col animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">History</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 rounded-lg">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && (
            <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
          )}
          {!loading && threads.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">No history yet</div>
          )}
          {threads.map((t) => (
            <button
              key={t.thread_id}
              onClick={() => handleLoadThread(t.thread_id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                t.thread_id === currentThread
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate leading-snug">{t.first_message}</div>
                  <div className="text-[11px] text-text-dim mt-1 flex items-center gap-2">
                    <span>{t.message_count} msgs</span>
                    {t.created_at && <span>· {formatDate(t.created_at)}</span>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
