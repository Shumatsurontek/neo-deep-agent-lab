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
  model?: string;
  estimated_cost?: number;
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

/* ── Fine-tuning ── */

export interface FineTuneConfig {
  model: string;
  dataset: string;
  gpu: string;
  num_epochs: number;
  learning_rate: number;
  batch_size: number;
  max_seq_length: number;
  lora_r: number;
  lora_alpha: number;
  dataset_max_samples: number;
  wandb_api_key: string;
  hf_token: string;
  hf_push: boolean;
  hf_repo: string;
}

export interface TrainedModel {
  name: string;
  path: string;
  size_mb: number;
}

export interface FineTuneJob {
  id: string;
  config: FineTuneConfig;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  model_path: string | null;
  current_step: number;
  total_steps: number;
  current_loss: number | null;
}

export interface FineTuneEvent {
  type:
    | "finetune-start"
    | "finetune-progress"
    | "finetune-validation"
    | "finetune-saving"
    | "finetune-done"
    | "finetune-error";
  step?: number;
  total_steps?: number;
  loss?: number;
  learning_rate?: number;
  val_loss?: number;
  epoch?: number;
  message?: string;
  model_path?: string;
  final_loss?: number;
  job?: FineTuneJob;
}
