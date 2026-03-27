import { useEffect, useMemo, useRef, useState } from "react";
import type { RagDocument } from "../../types";
import { useDocumentsStore, type IndexingEvent } from "../../stores/documents";
import { ChunkViewerModal } from "./ChunkViewerModal";
import YooptaEditor, { createYooptaEditor } from "@yoopta/editor";
import Paragraph from "@yoopta/paragraph";
import { HeadingOne, HeadingTwo, HeadingThree } from "@yoopta/headings";
import { BulletedList, NumberedList, TodoList } from "@yoopta/lists";
import Code from "@yoopta/code";
import Blockquote from "@yoopta/blockquote";
import Table from "@yoopta/table";
import { Bold, Italic, Underline, Strike, CodeMark } from "@yoopta/marks";
import { html } from "@yoopta/exports";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { ScrollArea } from "../ui/scroll-area";
import { Upload, FileText, Trash2, Eye, Loader2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PLUGINS = [
  Paragraph,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  BulletedList,
  NumberedList,
  TodoList,
  Code,
  Blockquote,
  Table,
] as any[];

const MARKS = [Bold, Italic, Underline, Strike, CodeMark];

const ACCEPTED = ".pdf,.docx,.pptx,.xlsx,.html,.csv,.txt,.md,.eml,.msg,.xml";

export function DocumentPanel() {
  const {
    documents, loading, load, uploadStream, indexTextStream, remove,
    indexingEvents, indexingActive, clearEvents,
  } = useDocumentsStore();
  const [docName, setDocName] = useState("inline-document");
  const [error, setError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<RagDocument | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const editor = useMemo(() => createYooptaEditor(), []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [indexingEvents]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    clearEvents();
    try {
      await uploadStream(file);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleIndex = async () => {
    const htmlStr = html.serialize(editor, editor.getEditorValue());
    const div = document.createElement("div");
    div.innerHTML = htmlStr;
    const text = div.textContent || div.innerText || "";
    if (!text.trim()) return;

    setError(null);
    clearEvents();
    try {
      await indexTextStream(text.trim(), docName || "inline-document");
      editor.setEditorValue(editor.getEditorValue());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const lastProgress = indexingEvents.filter(
    (e) => e.type === "preparing" || e.type === "embedding",
  ).at(-1);
  const progressPct = lastProgress?.total
    ? Math.round(((lastProgress.current ?? 0) / lastProgress.total) * 100)
    : 0;
  const isDone = indexingEvents.some((e) => e.type === "done");

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-background">
      <div className="border-b border-border px-8 py-6">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Documents RAG</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Upload files or create content to index into the RAG pipeline.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 space-y-8 max-w-4xl">
          {error && (
            <div className="bg-cb-red-muted border border-cb-red/30 text-cb-red text-sm rounded-2xl px-5 py-4 font-medium">
              {error}
            </div>
          )}

          {/* Indexing Progress */}
          {indexingEvents.length > 0 && (
            <section className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-foreground">
                  {indexingActive ? "Indexing in progress" : isDone ? "Indexing complete" : "Indexing"}
                </span>
                {!indexingActive && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs rounded-xl" onClick={clearEvents}>
                    Clear
                  </Button>
                )}
              </div>

              {indexingActive && lastProgress?.total && (
                <div className="mb-4">
                  <Progress value={isDone ? 100 : progressPct} className="h-2 rounded-full" />
                  <div className="text-xs text-muted-foreground mt-2 font-medium">
                    {lastProgress.current}/{lastProgress.total} chunks — {isDone ? "100" : progressPct}%
                  </div>
                </div>
              )}

              <div className="max-h-44 overflow-y-auto space-y-1">
                {indexingEvents.map((evt, i) => (
                  <EventLine key={i} event={evt} />
                ))}
                <div ref={eventsEndRef} />
              </div>
            </section>
          )}

          {/* File Upload */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">Upload File</h2>
            <p className="text-sm text-muted-foreground">
              PDF, DOCX, PPTX, XLSX, HTML, CSV, TXT, MD, EML, MSG, XML
            </p>
            <div className="flex gap-3 items-center">
              <Input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                onChange={handleUpload}
                disabled={indexingActive}
                className="flex-1 text-sm rounded-xl file:mr-4 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-cb-blue file:text-white file:text-sm file:cursor-pointer file:font-medium"
              />
              {indexingActive && <Loader2 className="w-5 h-5 text-cb-blue animate-spin" />}
            </div>
          </section>

          {/* Yoopta Editor */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">Create Content</h2>
            <div className="flex gap-3 items-center">
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Document name"
                className="w-56 h-10 text-sm rounded-xl"
              />
              <Button
                size="sm"
                onClick={handleIndex}
                disabled={indexingActive}
                className="h-10 px-5 gap-2 rounded-xl bg-cb-blue text-white hover:bg-cb-blue-hover font-medium"
              >
                <Upload className="w-4 h-4" />
                {indexingActive ? "Indexing..." : "Index"}
              </Button>
            </div>
            <div className="border border-border rounded-2xl bg-surface p-5 min-h-[220px]">
              <YooptaEditor
                editor={editor}
                plugins={PLUGINS}
                marks={MARKS}
                placeholder="Write or paste content to index..."
              />
            </div>
          </section>

          {/* Document List */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              Indexed Documents{" "}
              <span className="text-muted-foreground font-normal">({documents.length})</span>
            </h2>
            {loading ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground py-6">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading...
              </div>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents indexed yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-4 bg-surface rounded-2xl px-5 py-4 border border-border hover:border-cb-blue/20 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setViewingDoc(doc)}
                        className="text-sm text-foreground font-medium truncate hover:text-cb-blue transition-colors cursor-pointer bg-transparent border-0 p-0 text-left"
                      >
                        {doc.name}
                      </button>
                      <div className="text-xs text-muted-foreground flex gap-4 mt-1">
                        <span>{doc.chunk_count} chunks</span>
                        <span>~{doc.token_count} tokens</span>
                        <span>{doc.mime_type}</span>
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-9 text-xs gap-2 rounded-xl" onClick={() => setViewingDoc(doc)}>
                      <Eye className="w-4 h-4" />
                      Chunks
                    </Button>
                    <Button variant="ghost" size="sm" className="h-9 text-xs gap-2 rounded-xl text-cb-red hover:text-cb-red" onClick={() => remove(doc.id)}>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>

      {viewingDoc && (
        <ChunkViewerModal
          document={viewingDoc}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}

const EVENT_COLORS: Record<string, string> = {
  parsing: "text-cb-blue",
  splitting: "text-cb-purple",
  preparing: "text-cb-yellow",
  embedding: "text-cb-cyan",
  done: "text-cb-green",
  error: "text-cb-red",
};

function EventLine({ event }: { event: IndexingEvent }) {
  return (
    <div className="flex items-center gap-3 text-xs leading-6">
      <span className={`uppercase shrink-0 w-[72px] tracking-wider text-[10px] font-semibold ${EVENT_COLORS[event.type] || "text-muted-foreground"}`}>
        {event.type}
      </span>
      <span className="text-foreground/70">{event.message}</span>
    </div>
  );
}
