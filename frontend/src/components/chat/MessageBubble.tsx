import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { Message } from "../../types";
import { ToolStep } from "./ToolStep";

export function MessageBubble({ message, isLast }: { message: Message; isLast?: boolean }): React.ReactElement {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-4 animate-fade-in">
        <div
          className="font-mono"
          style={{
            maxWidth: "480px",
            fontSize: "12px",
            fontWeight: 300,
            lineHeight: "170%",
            color: "var(--color-text-bright)",
            background: "var(--color-bg-secondary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: "3px",
            padding: "8px 12px",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.tools && message.tools.length > 0;
  const hasContent = !!message.content;

  return (
    <div className="mb-5 animate-fade-in">
      <div className="flex items-start gap-2.5">
        {/* Avatar — tiny monogram */}
        <div
          className="shrink-0 font-mono flex items-center justify-center"
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            border: "0.5px solid var(--color-border-secondary)",
            fontSize: "7px",
            color: "var(--color-purple)",
            marginTop: "2px",
          }}
        >
          N
        </div>

        <div className="flex-1 min-w-0" style={{ maxWidth: "640px" }}>
          {/* Tool steps */}
          {hasTools && (
            <div style={{ marginBottom: "4px" }}>
              {message.tools!.map((tool, i) => (
                <ToolStep key={i} tool={tool} />
              ))}
            </div>
          )}

          {/* Text content */}
          {hasContent && (
            <div
              className="prose"
              style={{ fontSize: "12px", fontWeight: 300, lineHeight: "185%", color: "var(--color-text)" }}
            >
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Metrics bar (TTFT / TPS) */}
          {message.metrics && (
            <div
              className="flex items-center gap-3 font-mono"
              style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginTop: "4px", paddingTop: "4px", borderTop: "0.5px solid var(--color-border)" }}
            >
              <span>
                ttft <span style={{ color: "var(--color-green)" }}>{message.metrics.ttft_ms.toFixed(0)}ms</span>
              </span>
              <span>
                tps <span style={{ color: "var(--color-blue)" }}>{message.metrics.tps.toFixed(1)}</span>
              </span>
              <span>
                tokens <span style={{ color: "var(--color-text)" }}>{message.metrics.total_tokens}</span>
              </span>
              <span>
                total <span style={{ color: "var(--color-text)" }}>{(message.metrics.elapsed_ms / 1000).toFixed(1)}s</span>
              </span>
            </div>
          )}

          {/* Streaming cursor */}
          {isLast && !hasContent && !hasTools && (
            <div className="flex items-center gap-1 py-1">
              <span
                className="rounded-full animate-pulse"
                style={{ width: "4px", height: "4px", background: "var(--color-text-secondary)" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
