import { create } from "zustand";
import type { FineTuneConfig, FineTuneEvent, FineTuneJob, TrainedModel } from "../types";
import { apiGet, apiPost, authHeaders } from "../lib/api";

interface LossPoint {
  step: number;
  loss: number;
}

interface InferMessage {
  role: "user" | "assistant";
  content: string;
}

interface FineTuneState {
  jobs: FineTuneJob[];
  activeJob: FineTuneJob | null;
  events: FineTuneEvent[];
  isTraining: boolean;
  config: FineTuneConfig;
  lossHistory: LossPoint[];

  // Inference state
  trainedModels: TrainedModel[];
  selectedModelPath: string | null;
  servingUrl: string | null;
  isServing: boolean;
  inferMessages: InferMessage[];
  isInferring: boolean;

  updateConfig: (partial: Partial<FineTuneConfig>) => void;
  startJob: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  loadJobs: () => Promise<void>;
  clearEvents: () => void;

  // Inference methods
  selectModel: (path: string) => void;
  loadModels: () => Promise<void>;
  pushModel: () => Promise<string | null>;
  deployModel: () => Promise<void>;
  sendInference: (prompt: string) => Promise<void>;
}

const DEFAULT_CONFIG: FineTuneConfig = {
  model: "unsloth/Qwen3.5-2B",
  dataset: "gretelai/synthetic_text_to_sql",
  gpu: "L40S",
  num_epochs: 3,
  learning_rate: 2e-4,
  batch_size: 4,
  max_seq_length: 2048,
  lora_r: 16,
  lora_alpha: 32,
  dataset_max_samples: 10000,
  wandb_api_key: "",
  hf_token: "",
  hf_push: false,
  hf_repo: "",
};

async function consumeSSE(
  response: Response,
  onEvent: (event: FineTuneEvent) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        const data = JSON.parse(trimmed.slice(6)) as FineTuneEvent;
        onEvent(data);
      } catch {
        /* skip malformed */
      }
    }
  }
}

export const useFineTuneStore = create<FineTuneState>((set, get) => ({
  jobs: [],
  activeJob: null,
  events: [],
  isTraining: false,
  config: { ...DEFAULT_CONFIG },
  lossHistory: [],
  trainedModels: [],
  selectedModelPath: null,
  servingUrl: null,
  isServing: false,
  inferMessages: [],
  isInferring: false,

  updateConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
  },

  startJob: async () => {
    const { config } = get();
    set({ isTraining: true, events: [], lossHistory: [], activeJob: null });

    try {
      const headers = await authHeaders();
      const res = await fetch("/finetune/start", {
        method: "POST",
        headers,
        body: JSON.stringify({ config }),
      });

      if (!res.ok) {
        const err = await res.text();
        set({
          isTraining: false,
          events: [{ type: "finetune-error", message: err }],
        });
        return;
      }

      await consumeSSE(res, (event) => {
        set((s) => {
          const events = [...s.events, event];
          const lossHistory = [...s.lossHistory];
          let activeJob = s.activeJob;

          if (event.type === "finetune-start" && event.job) {
            activeJob = event.job;
          }

          if (activeJob) {
            if (event.step !== undefined) activeJob = { ...activeJob, current_step: event.step };
            if (event.total_steps !== undefined) activeJob = { ...activeJob, total_steps: event.total_steps };
            if (event.loss !== undefined && event.loss !== null) activeJob = { ...activeJob, current_loss: event.loss };
            if (event.type === "finetune-done") activeJob = { ...activeJob, status: "completed" };
            if (event.type === "finetune-error") activeJob = { ...activeJob, status: "failed", error: event.message ?? null };
          }

          if (event.type === "finetune-progress" && event.loss != null && event.step != null) {
            lossHistory.push({ step: event.step, loss: event.loss });
          }

          const isDone = event.type === "finetune-done" || event.type === "finetune-error";

          return { events, lossHistory, activeJob, isTraining: !isDone };
        });
      });
    } catch (err) {
      set({
        isTraining: false,
        events: [{ type: "finetune-error", message: String(err) }],
      });
    }
  },

  cancelJob: async (jobId) => {
    await apiPost(`/finetune/cancel/${jobId}`);
    set((s) => ({
      isTraining: false,
      activeJob: s.activeJob ? { ...s.activeJob, status: "cancelled" } : null,
    }));
  },

  loadJobs: async () => {
    try {
      const jobs = await apiGet<FineTuneJob[]>("/finetune/jobs");
      set({ jobs });
    } catch { /* ignore */ }
  },

  clearEvents: () => set({ events: [], lossHistory: [] }),

  selectModel: (path) => set({ selectedModelPath: path }),

  pushModel: async () => {
    const { selectedModelPath, config } = get();
    if (!selectedModelPath || !config.hf_token || !config.hf_repo) return null;
    try {
      const result = await apiPost<{ url?: string; error?: string }>("/finetune/push", {
        model_path: selectedModelPath,
        hf_repo: config.hf_repo,
        hf_token: config.hf_token,
        base_model: config.model,
        dataset: config.dataset,
      });
      return result.url ?? result.error ?? null;
    } catch (err) {
      return String(err);
    }
  },

  loadModels: async () => {
    try {
      const models = await apiGet<TrainedModel[]>("/finetune/models");
      set((s) => ({
        trainedModels: models,
        // Auto-select first model if none selected
        selectedModelPath: s.selectedModelPath ?? models[0]?.path ?? null,
      }));
    } catch { /* ignore */ }
  },

  deployModel: async () => {
    const { selectedModelPath } = get();
    set({ isServing: true });
    try {
      const result = await apiPost<{ url?: string; error?: string }>(
        "/finetune/serve",
        { model_path: selectedModelPath ?? "" },
      );
      if (result.url) {
        set({ servingUrl: result.url, isServing: false });
      } else {
        set({ isServing: false });
      }
    } catch {
      set({ isServing: false });
    }
  },

  sendInference: async (prompt) => {
    const { servingUrl } = get();
    if (!servingUrl) return;

    const userMsg: InferMessage = { role: "user", content: prompt };
    set((s) => ({
      inferMessages: [...s.inferMessages, userMsg],
      isInferring: true,
    }));

    try {
      const result = await apiPost<{
        choices?: Array<{ message: { content: string } }>;
        error?: string;
      }>("/finetune/infer", {
        messages: [
          { role: "system", content: "You are a SQL expert. Given a database schema and a natural language question, generate the correct SQL query." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 512,
      });

      const content = result.choices?.[0]?.message?.content ?? result.error ?? "No response";
      const assistantMsg: InferMessage = { role: "assistant", content };
      set((s) => ({
        inferMessages: [...s.inferMessages, assistantMsg],
        isInferring: false,
      }));
    } catch (err) {
      set((s) => ({
        inferMessages: [...s.inferMessages, { role: "assistant", content: `Error: ${err}` }],
        isInferring: false,
      }));
    }
  },
}));
