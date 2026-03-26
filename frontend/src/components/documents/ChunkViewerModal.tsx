import { useEffect, useState } from "react";
import type { RagChunk, RagDocument } from "../../types";
import { apiGet } from "../../lib/api";

interface Props {
  document: RagDocument;
  onClose: () => void;
}

export function ChunkViewerModal({ document: doc, onClose }: Props) {
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<{ chunks: RagChunk[] }>(
          `/documents/${doc.id}/chunks`,
        );
        setChunks(data.chunks);
      } catch (err) {
        console.error("Failed to load chunks:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [doc.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          width: "min(900px, 90vw)",
          maxHeight: "80vh",
          background: "var(--color-bg-elevated)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "6px",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--color-border)",
          }}
        >
          <div>
            <div
              className="font-mono"
              style={{ fontSize: "13px", color: "var(--color-text-bright)" }}
            >
              {doc.name}
            </div>
            <div
              className="font-mono flex gap-3"
              style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}
            >
              <span>{doc.chunk_count} chunks</span>
              <span>~{doc.token_count} tokens</span>
              <span>{doc.mime_type}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: "18px",
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chunk list */}
          <div
            className="shrink-0 overflow-y-auto"
            style={{
              width: "200px",
              borderRight: "0.5px solid var(--color-border)",
              padding: "8px 0",
            }}
          >
            {loading ? (
              <div
                className="font-mono"
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  padding: "12px",
                  textAlign: "center",
                }}
              >
                Loading chunks...
              </div>
            ) : (
              chunks.map((chunk) => (
                <button
                  key={chunk.index}
                  onClick={() => setSelected(chunk.index)}
                  className="w-full text-left font-mono transition-colors"
                  style={{
                    fontSize: "11px",
                    padding: "6px 12px",
                    color:
                      selected === chunk.index
                        ? "var(--color-purple)"
                        : "var(--color-text-secondary)",
                    background:
                      selected === chunk.index
                        ? "rgba(167, 125, 255, 0.08)"
                        : "transparent",
                    border: "none",
                    cursor: "pointer",
                    borderLeft:
                      selected === chunk.index
                        ? "2px solid var(--color-purple)"
                        : "2px solid transparent",
                  }}
                >
                  <div style={{ fontWeight: 500, color: selected === chunk.index ? "var(--color-text-bright)" : "var(--color-text)" }}>
                    chunk {chunk.index}
                  </div>
                  <div
                    style={{
                      fontSize: "9px",
                      color: "var(--color-text-secondary)",
                      marginTop: "1px",
                    }}
                  >
                    ~{chunk.token_estimate} tokens
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--color-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginTop: "2px",
                      maxWidth: "170px",
                    }}
                  >
                    {chunk.text.slice(0, 60)}...
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Chunk detail */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "12px 16px" }}>
            {selected !== null ? (
              (() => {
                const chunk = chunks.find((c) => c.index === selected);
                if (!chunk) return null;
                return (
                  <div>
                    <div className="flex items-center gap-3" style={{ marginBottom: "8px" }}>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: "12px",
                          color: "var(--color-purple)",
                          fontWeight: 500,
                        }}
                      >
                        Chunk {chunk.index}
                      </span>
                      <span
                        className="font-mono"
                        style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}
                      >
                        ~{chunk.token_estimate} tokens
                      </span>
                      <button
                        className="font-mono ml-auto"
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-secondary)",
                          padding: "3px 8px",
                          border: "0.5px solid var(--color-border)",
                          borderRadius: "2px",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => navigator.clipboard.writeText(chunk.text)}
                      >
                        copy
                      </button>
                    </div>
                    <pre
                      className="font-mono whitespace-pre-wrap"
                      style={{
                        fontSize: "12px",
                        lineHeight: "180%",
                        color: "var(--color-text)",
                        background: "var(--color-bg)",
                        border: "0.5px solid var(--color-border)",
                        borderRadius: "3px",
                        padding: "12px",
                        maxHeight: "calc(80vh - 150px)",
                        overflowY: "auto",
                      }}
                    >
                      {chunk.text}
                    </pre>
                  </div>
                );
              })()
            ) : (
              <div
                className="flex items-center justify-center h-full font-mono"
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  minHeight: "200px",
                }}
              >
                Select a chunk to view its content
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
