import { create } from "zustand";
import type { RagDocument } from "../types";
import { apiGet, apiDelete, apiPost, authHeadersSync } from "../lib/api";

interface DocumentsState {
  documents: RagDocument[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  upload: (file: File) => Promise<RagDocument>;
  indexText: (text: string, name?: string) => Promise<RagDocument>;
  remove: (id: string) => Promise<void>;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loading: false,
  error: null,

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

  indexText: async (text: string, name = "inline-document") => {
    const doc = await apiPost<RagDocument>("/documents/text", { text, name });
    set({ documents: [...get().documents, doc] });
    return doc;
  },

  remove: async (id: string) => {
    await apiDelete(`/documents/${id}`);
    set({ documents: get().documents.filter((d) => d.id !== id) });
  },
}));
