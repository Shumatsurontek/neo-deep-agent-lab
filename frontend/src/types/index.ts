export interface ContextEntry {
  text: string;
  source: "user" | "agent";
  timestamp: number;
}

export interface ScratchpadNote {
  note: string;
  score: number;
  timestamp: number;
}

export interface RecalledMemory {
  text: string;
  score: number;
  source_thread: string;
  timestamp: number;
}

export interface RewardSummary {
  total: number;
  positive: number;
  negative: number;
  avg_score: number;
}

export interface ContextData {
  schema_cached: boolean;
  schema_tables: string[];
  user_context: ContextEntry[];
  scratchpad: ScratchpadNote[];
  summary: string | null;
  reward_summary: RewardSummary;
  last_recall: RecalledMemory[];
  last_rag_chunks: RecalledMemory[];
}

export interface PromptSection {
  id: string;
  label: string;
  content: string;
}

export interface PromptPreview {
  token_estimate: number;
  sections: PromptSection[];
}

export interface Provider {
  id: string;
  name: string;
  models: string[];
  available?: boolean;
}

export interface StreamMetrics {
  ttft_ms: number;
  tps: number;
  total_tokens: number;
  elapsed_ms: number;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  tools?: ToolStep[];
  metrics?: StreamMetrics;
}

export interface MiddlewareInfo {
  name: string;
  enabled: boolean;
  description: string;
}

export interface ToolStep {
  name: string;
  input?: string;
  output?: string;
  status: "running" | "done" | "error";
}

export interface SessionInfo {
  token: string;
  thread_id: string;
}

export interface HitlInterrupt {
  action_request: { action: string; args: Record<string, string> };
  config: { description: string };
}

export interface RagDocument {
  id: string;
  name: string;
  chunk_count: number;
  token_count: number;
  created_at: string;
  mime_type: string;
}

export interface RagChunk {
  index: number;
  text: string;
  source: string;
  token_estimate: number;
}
