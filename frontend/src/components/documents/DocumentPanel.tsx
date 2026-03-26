import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentsStore } from "../../stores/documents";
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
  const { documents, loading, load, upload, indexText, remove } = useDocumentsStore();
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [docName, setDocName] = useState("inline-document");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useMemo(() => createYooptaEditor(), []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await upload(file);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleIndex = async () => {
    const htmlStr = html.serialize(editor, editor.getEditorValue());
    const div = document.createElement("div");
    div.innerHTML = htmlStr;
    const text = div.textContent || div.innerText || "";
    if (!text.trim()) return;

    setIndexing(true);
    setError(null);
    try {
      await indexText(text.trim(), docName || "inline-document");
      // Reset editor
      editor.setEditorValue(editor.getEditorValue());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg">
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
              className="flex-1 text-xs text-text file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-purple/20 file:text-purple file:font-mono file:text-xs file:cursor-pointer hover:file:bg-purple/30"
            />
            {uploading && <span className="text-xs text-purple animate-pulse font-mono">uploading...</span>}
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
              disabled={indexing}
              className="px-3 py-1 bg-purple/20 text-purple rounded hover:bg-purple/30 font-mono text-xs disabled:opacity-50"
            >
              {indexing ? "indexing..." : "Index"}
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
                    <div className="text-xs text-text-bright font-mono truncate">{doc.name}</div>
                    <div className="text-[10px] text-text-secondary flex gap-3 mt-0.5">
                      <span>{doc.chunk_count} chunks</span>
                      <span>~{doc.token_count} tokens</span>
                      <span>{doc.mime_type}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
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
    </div>
  );
}
