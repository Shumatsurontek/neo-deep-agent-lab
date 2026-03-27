import { useEffect, useState } from "react";
import type { RagChunk, RagDocument } from "../../types";
import { apiGet } from "../../lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Copy, Loader2 } from "lucide-react";

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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col p-0 gap-0 rounded-2xl">
        <DialogHeader className="px-6 py-5 border-b border-border shrink-0">
          <DialogTitle className="text-lg font-semibold">{doc.name}</DialogTitle>
          <div className="flex gap-3 mt-2">
            <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
              {doc.chunk_count} chunks
            </Badge>
            <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
              ~{doc.token_count} tokens
            </Badge>
            <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
              {doc.mime_type}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Chunk list */}
          <ScrollArea className="w-56 shrink-0 border-r border-border">
            <div className="py-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                chunks.map((chunk) => {
                  const isActive = selected === chunk.index;
                  return (
                    <button
                      key={chunk.index}
                      onClick={() => setSelected(chunk.index)}
                      className={`w-full text-left px-4 py-3 transition-all border-l-3 ${
                        isActive
                          ? "bg-cb-blue/5 border-l-cb-blue text-foreground"
                          : "border-l-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"
                      }`}
                    >
                      <div className="text-sm font-medium">chunk {chunk.index}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        ~{chunk.token_estimate} tokens
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-1">
                        {chunk.text.slice(0, 60)}...
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Chunk detail */}
          <div className="flex-1 overflow-hidden">
            {selected !== null ? (
              (() => {
                const chunk = chunks.find((c) => c.index === selected);
                if (!chunk) return null;
                return (
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                      <span className="text-sm font-semibold text-cb-blue">
                        Chunk {chunk.index}
                      </span>
                      <Badge variant="outline" className="text-[11px] h-6 px-2.5 font-medium rounded-lg">
                        ~{chunk.token_estimate} tokens
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-2 ml-auto rounded-xl"
                        onClick={() => navigator.clipboard.writeText(chunk.text)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/70 leading-relaxed p-5">
                        {chunk.text}
                      </pre>
                    </ScrollArea>
                  </div>
                );
              })()
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground min-h-[220px]">
                Select a chunk to view its content
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
