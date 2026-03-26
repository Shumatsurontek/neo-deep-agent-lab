import { create } from "zustand";
import type { RagDocument } from "../types";
import { apiGet, apiDelete, apiPost, authHeadersSync } from "../lib/api";

export interface IndexingEvent {
  type: "parsing" | "splitting" | "preparing" | "embedding" | "done" | "error";
  message: string;
  current?: number;
  total?: number;
  chunk_count?: number;
  sections?: number;
  document?: RagDocument;
}

interface DocumentsState {
  documents: RagDocument[];
  loading: boolean;
  error: string | null;
  /** Live indexing events from SSE stream */
  indexingEvents: IndexingEvent[];
  indexingActive: boolean;
  load: () => Promise<void>;
  upload: (file: File) => Promise<RagDocument | null>;
  uploadStream: (file: File) => Promise<RagDocument | null>;
  indexText: (text: string, name?: string) => Promise<RagDocument>;
  indexTextStream: (text: string, name?: string) => Promise<RagDocument | null>;
  remove: (id: string) => Promise<void>;
  clearEvents: () => void;
}

/** Parse SSE stream and call onEvent for each parsed event */
async function consumeSSE(
  response: Response,
  onEvent: (event: IndexingEvent) => void,
): Promise<RagDocument | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RagDocument | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(trimmed.slice(6)) as IndexingEvent;
        onEvent(data);
        if (data.type === "done" && data.document) {
          result = data.document;
        }
      } catch {
        /* skip malformed */
      }
    }
  }
  return result;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loading: false,
  error: null,
  indexingEvents: [],
  indexingActive: false,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const docs = await apiGet<RagDocument[]>("/documents");
      set({ documents: docs, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const auth = authHeadersSync();
    const headers: Record<string, string> = {};
    if (auth["Authorization"]) headers["Authorization"] = auth["Authorization"];

    const res = await fetch("/documents/upload", { method: "POST", headers, body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const doc: RagDocument = await res.json();
    set({ documents: [...get().documents, doc] });
    return doc;
  },

  uploadStream: async (file: File) => {
    set({ indexingEvents: [], indexingActive: true, error: null });

    const form = new FormData();
    form.append("file", file);
    const auth = authHeadersSync();
    const headers: Record<string, string> = {};
    if (auth["Authorization"]) headers["Authorization"] = auth["Authorization"];

    try {
      const res = await fetch("/documents/upload-stream", {
        method: "POST",
        headers,
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

      const doc = await consumeSSE(res, (event) => {
        set((s) => ({ indexingEvents: [...s.indexingEvents, event] }));
        if (event.type === "error") {
          set({ error: event.message });
        }
      });

      if (doc) {
        set((s) => ({ documents: [...s.documents, doc] }));
      }
      return doc;
    } finally {
      set({ indexingActive: false });
    }
  },

  indexText: async (text: string, name = "inline-document") => {
    const doc = await apiPost<RagDocument>("/documents/text", { text, name });
    set({ documents: [...get().documents, doc] });
    return doc;
  },

  indexTextStream: async (text: string, name = "inline-document") => {
    set({ indexingEvents: [], indexingActive: true, error: null });

    try {
      const res = await fetch("/documents/text-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, name }),
      });
      if (!res.ok) throw new Error(`Index failed: ${res.status}`);

      const doc = await consumeSSE(res, (event) => {
        set((s) => ({ indexingEvents: [...s.indexingEvents, event] }));
        if (event.type === "error") {
          set({ error: event.message });
        }
      });

      if (doc) {
        set((s) => ({ documents: [...s.documents, doc] }));
      }
      return doc;
    } finally {
      set({ indexingActive: false });
    }
  },

  remove: async (id: string) => {
    await apiDelete(`/documents/${id}`);
    set({ documents: get().documents.filter((d) => d.id !== id) });
  },

  clearEvents: () => set({ indexingEvents: [] }),
}));
