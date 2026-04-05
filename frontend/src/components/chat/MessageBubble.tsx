import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { Message } from "../../types";
import { ToolStep } from "./ToolStep";
import { Terminal } from "lucide-react";

export function MessageBubble({ message, isLast }: { message: Message; isLast?: boolean }): React.ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-7 animate-fade-in">
        <div className="max-w-[600px] font-mono text-sm leading-relaxed text-text-primary bg-cb-blue/10 border border-dashed border-cb-blue/20 rounded-lg px-6 py-4 break-words">
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.tools && message.tools.length > 0;
  const hasContent = !!message.content;

  return (
    <div className="mb-10 animate-fade-in">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-cb-blue/10 border border-dashed border-cb-blue/20 mt-0.5">
          <Terminal className="w-4 h-4 text-cb-blue" />
        </div>

        <div className="flex-1 min-w-0 max-w-[720px]">
          {/* Tool steps */}
          {hasTools && (
            <div className="mb-5 space-y-3">
              {message.tools!.map((tool, i) => (
                <ToolStep key={i} tool={tool} />
              ))}
            </div>
          )}

          {/* Text content */}
          {hasContent && (
            <div className="prose text-sm leading-relaxed text-text-secondary">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Metrics bar */}
          {message.metrics && (
            <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-dashed border-border-default">
              <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                ttft <span className="text-cb-green">{message.metrics.ttft_ms.toFixed(0)}ms</span>
              </span>
              <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                tps <span className="text-cb-blue">{message.metrics.tps.toFixed(1)}</span>
              </span>
              <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                {message.metrics.total_tokens} tokens
              </span>
              <span className="font-mono text-[11px] px-2.5 py-1 rounded-md border border-dashed border-border-default text-text-muted">
                {(message.metrics.elapsed_ms / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {/* Streaming cursor */}
          {isLast && !hasContent && !hasTools && (
            <div className="flex items-center gap-2.5 py-4">
              <span className="w-2 h-2 rounded-full bg-cb-blue animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-cb-blue animate-pulse [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-cb-blue animate-pulse [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
