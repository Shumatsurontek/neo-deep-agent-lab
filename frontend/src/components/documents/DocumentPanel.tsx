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

  // Auto-scroll events feed
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

  // Compute progress percentage from events
  const lastProgress = indexingEvents.filter(
    (e) => e.type === "preparing" || e.type === "embedding",
  ).at(-1);
  const progressPct = lastProgress?.total
    ? Math.round(((lastProgress.current ?? 0) / lastProgress.total) * 100)
    : 0;
  const isDone = indexingEvents.some((e) => e.type === "done");

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-bg">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-mono text-text-bright">Documents RAG</h1>
        <p className="text-xs text-text-secondary mt-1">
          Upload files or create content to index into the RAG pipeline.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="bg-red/10 border border-red/30 text-red text-xs rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Indexing Progress Feed */}
        {indexingEvents.length > 0 && (
          <section
            style={{
              background: "var(--color-bg-secondary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: "4px",
              padding: "12px",
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
              <span
                className="font-mono uppercase tracking-widest"
                style={{ fontSize: "10px", letterSpacing: "0.12em", color: "var(--color-text-bright)" }}
              >
                {indexingActive ? "indexing in progress" : isDone ? "indexing complete" : "indexing"}
              </span>
              {!indexingActive && (
                <button
                  onClick={clearEvents}
                  className="font-mono"
                  style={{ fontSize: "10px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}
                >
                  clear
                </button>
              )}
            </div>

            {/* Progress bar */}
            {indexingActive && lastProgress?.total && (
              <div style={{ marginBottom: "8px" }}>
                <div
                  style={{
                    height: "4px",
                    background: "var(--color-bg)",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${isDone ? 100 : progressPct}%`,
                      background: isDone ? "var(--color-green)" : "var(--color-purple)",
                      transition: "width 0.3s ease",
                      borderRadius: "2px",
                    }}
                  />
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "4px" }}
                >
                  {lastProgress.current}/{lastProgress.total} chunks — {isDone ? "100" : progressPct}%
                </div>
              </div>
            )}

            {/* Event log */}
            <div
              style={{ maxHeight: "160px", overflowY: "auto" }}
              className="space-y-0.5"
            >
              {indexingEvents.map((evt, i) => (
                <EventLine key={i} event={evt} />
              ))}
              <div ref={eventsEndRef} />
            </div>
          </section>
        )}

        {/* File Upload */}
        <section className="space-y-2">
          <h2 className="text-sm font-mono text-text-bright">Upload File</h2>
          <p className="text-[10px] text-text-secondary">
            PDF, DOCX, PPTX, XLSX, HTML, CSV, TXT, MD, EML, MSG, XML
          </p>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              onChange={handleUpload}
              disabled={indexingActive}
              className="flex-1 text-xs text-text file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-purple/20 file:text-purple file:font-mono file:text-xs file:cursor-pointer hover:file:bg-purple/30"
            />
            {indexingActive && <span className="text-xs text-purple animate-pulse font-mono">indexing...</span>}
          </div>
        </section>

        {/* Yoopta Editor */}
        <section className="space-y-2">
          <h2 className="text-sm font-mono text-text-bright">Create Content</h2>
          <div className="flex gap-2 items-center">
            <input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Document name"
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-purple w-48"
            />
            <button
              onClick={handleIndex}
              disabled={indexingActive}
              className="px-3 py-1 bg-purple/20 text-purple rounded hover:bg-purple/30 font-mono text-xs disabled:opacity-50"
            >
              {indexingActive ? "indexing..." : "Index"}
            </button>
          </div>
          <div className="border border-border rounded bg-bg-secondary p-3 min-h-[200px]">
            <YooptaEditor
              editor={editor}
              plugins={PLUGINS}
              marks={MARKS}
              placeholder="Write or paste content to index..."
            />
          </div>
        </section>

        {/* Document List */}
        <section className="space-y-2">
          <h2 className="text-sm font-mono text-text-bright">
            Indexed Documents{" "}
            <span className="text-text-secondary">({documents.length})</span>
          </h2>
          {loading ? (
            <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="text-xs text-text-secondary italic">No documents indexed yet.</p>
          ) : (
            <div className="space-y-1">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 bg-bg-secondary rounded px-3 py-2 border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setViewingDoc(doc)}
                      className="text-xs text-text-bright font-mono truncate hover:text-purple transition-colors cursor-pointer"
                      style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}
                    >
                      {doc.name}
                    </button>
                    <div className="text-[10px] text-text-secondary flex gap-3 mt-0.5">
                      <span>{doc.chunk_count} chunks</span>
                      <span>~{doc.token_count} tokens</span>
                      <span>{doc.mime_type}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingDoc(doc)}
                    className="text-purple hover:opacity-80 text-xs font-mono shrink-0"
                  >
                    chunks
                  </button>
                  <button
                    onClick={() => remove(doc.id)}
                    className="text-red hover:opacity-80 text-xs font-mono shrink-0"
                  >
                    delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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
  parsing: "var(--color-blue)",
  splitting: "var(--color-purple)",
  preparing: "var(--color-yellow)",
  embedding: "var(--color-orange)",
  done: "var(--color-green)",
  error: "var(--color-red)",
};

function EventLine({ event }: { event: IndexingEvent }) {
  const color = EVENT_COLORS[event.type] || "var(--color-text-secondary)";
  return (
    <div className="flex items-center gap-2 font-mono" style={{ fontSize: "11px", lineHeight: "20px" }}>
      <span
        className="uppercase shrink-0"
        style={{
          fontSize: "9px",
          width: "64px",
          letterSpacing: "0.08em",
          color,
          fontWeight: 500,
        }}
      >
        {event.type}
      </span>
      <span style={{ color: "var(--color-text)" }}>{event.message}</span>
    </div>
  );
}
