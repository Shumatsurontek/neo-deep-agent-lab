import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { Message } from "../../types";
import { ToolStep } from "./ToolStep";
import { Badge } from "../ui/badge";

export function MessageBubble({ message, isLast }: { message: Message; isLast?: boolean }): React.ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-6 animate-fade-in">
        <div className="max-w-[480px] text-sm leading-relaxed text-foreground bg-cb-blue/10 border border-cb-blue/15 rounded-2xl rounded-br-md px-5 py-3.5">
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.tools && message.tools.length > 0;
  const hasContent = !!message.content;

  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="shrink-0 w-8 h-8 rounded-xl bg-cb-blue flex items-center justify-center text-white text-xs font-bold mt-0.5">
          N
        </div>

        <div className="flex-1 min-w-0 max-w-[660px]">
          {/* Tool steps */}
          {hasTools && (
            <div className="mb-4 space-y-2">
              {message.tools!.map((tool, i) => (
                <ToolStep key={i} tool={tool} />
              ))}
            </div>
          )}

          {/* Text content */}
          {hasContent && (
            <div className="prose text-sm leading-relaxed text-foreground/85">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Metrics bar */}
          {message.metrics && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
              <Badge variant="outline" className="text-[11px] h-6 gap-1.5 font-medium rounded-lg">
                ttft <span className="text-cb-green">{message.metrics.ttft_ms.toFixed(0)}ms</span>
              </Badge>
              <Badge variant="outline" className="text-[11px] h-6 gap-1.5 font-medium rounded-lg">
                tps <span className="text-cb-blue">{message.metrics.tps.toFixed(1)}</span>
              </Badge>
              <Badge variant="outline" className="text-[11px] h-6 gap-1.5 font-medium rounded-lg">
                {message.metrics.total_tokens} tokens
              </Badge>
              <Badge variant="outline" className="text-[11px] h-6 gap-1.5 font-medium rounded-lg">
                {(message.metrics.elapsed_ms / 1000).toFixed(1)}s
              </Badge>
            </div>
          )}

          {/* Streaming cursor */}
          {isLast && !hasContent && !hasTools && (
            <div className="flex items-center gap-2 py-3">
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
