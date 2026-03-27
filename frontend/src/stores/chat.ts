import { create } from "zustand";
import type { Message, StreamMetrics, ToolStep } from "../types";
import { streamSSE, type SSEEvent } from "../lib/sse";
import { apiGet, apiPost, setToken } from "../lib/api";
import { useHitlStore } from "./hitl";
import { useUsageStore } from "./usage";

interface ChatStore {
  messages: Message[];
  isStreaming: boolean;
  status: "ready" | "streaming" | "error";

  sendMessage: (text: string) => void;
  resumeHitl: (decisions: unknown[]) => void;
  resetChat: () => Promise<void>;
  loadHistory: () => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => {
  let abortController: AbortController | null = null;

  function handleEvent(event: SSEEvent) {
    set((s) => {
      const msgs = [...s.messages];
      const lastIdx = msgs.length - 1;

      switch (event.type) {
        case "text-delta": {
          const last = msgs[lastIdx];
          if (last && last.role === "assistant") {
            msgs[lastIdx] = { ...last, content: last.content + (event.content as string) };
          } else {
            msgs.push({ role: "assistant", content: event.content as string, tools: [] });
          }
          break;
        }
        case "tool-call-start": {
          const last = msgs[lastIdx];
          if (last && last.role === "assistant") {
            const tools = [...(last.tools ?? [])];
            const inputRaw = event.tool_input;
            const inputStr = typeof inputRaw === "object" ? JSON.stringify(inputRaw) : (inputRaw as string | undefined);
            tools.push({ name: event.tool_name as string, status: "running", input: inputStr });
            msgs[lastIdx] = { ...last, tools };
          }
          break;
        }
        case "tool-call-end": {
          const last = msgs[lastIdx];
          if (last && last.role === "assistant") {
            const tools = [...(last.tools ?? [])];
            const toolName = event.tool_name as string;
            // Match by name (find last running tool with this name)
            let idx = -1;
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i]!.status === "running" && tools[i]!.name === toolName) {
                idx = i;
                break;
              }
            }
            // Fallback: match any running tool
            if (idx < 0) {
              idx = tools.findLastIndex((t) => t.status === "running");
            }
            if (idx >= 0) {
              const inputRaw = event.tool_input;
              const inputStr = typeof inputRaw === "object" ? JSON.stringify(inputRaw) : (inputRaw as string | undefined);
              tools[idx] = {
                ...tools[idx]!,
                status: "done" as ToolStep["status"],
                output: event.tool_output as string | undefined,
                input: inputStr || tools[idx]!.input,
              };
              msgs[lastIdx] = { ...last, tools };
            }
          }
          break;
        }
        case "interrupt-request": {
          // HITL: show approval modal
          const actions = event.action_requests as Record<string, unknown>[] | undefined;
          if (actions?.length) {
            const action = actions[0]!;
            const args = action.args as Record<string, string> | undefined;
            const query = args?.query || JSON.stringify(args);
            const configs = event.review_configs as Record<string, string>[] | undefined;
            const desc = configs?.[0]?.description || "SQL execution requires approval";
            useHitlStore.getState().setPending(query, desc, action);
          }
          break;
        }
        case "metrics": {
          const last = msgs[lastIdx];
          if (last && last.role === "assistant") {
            const metrics: StreamMetrics = {
              ttft_ms: event.ttft_ms as number,
              tps: event.tps as number,
              total_tokens: event.total_tokens as number,
              elapsed_ms: event.elapsed_ms as number,
            };
            msgs[lastIdx] = { ...last, metrics };
          }
          useUsageStore.getState().addMetrics(
            event.total_tokens as number,
            (event.estimated_cost as number) ?? 0,
          );
          break;
        }
        case "error": {
          const last = msgs[lastIdx];
          if (last && last.role === "assistant") {
            msgs[lastIdx] = { ...last, content: last.content + `\n\n**Erreur:** ${event.message}` };
          } else {
            msgs.push({ role: "assistant", content: `**Erreur:** ${event.message}` });
          }
          break;
        }
      }

      return { messages: msgs };
    });
  }

  function startStream(url: string, body: unknown, appendNew = true) {
    if (appendNew) {
      // Add placeholder assistant message
      set((s) => ({
        messages: [...s.messages, { role: "assistant", content: "", tools: [] }],
        isStreaming: true,
        status: "streaming",
      }));
    } else {
      set({ isStreaming: true, status: "streaming" });
    }

    abortController = streamSSE(
      url,
      body,
      handleEvent,
      () => set({ isStreaming: false, status: "ready" }),
      (err) => {
        console.error("SSE error:", err);
        set({ isStreaming: false, status: "error" });
      },
    );
  }

  return {
    messages: [],
    isStreaming: false,
    status: "ready",

    sendMessage: (text: string) => {
      if (get().isStreaming) return;
      set((s) => ({
        messages: [...s.messages, { role: "user", content: text }],
      }));
      startStream("/chat", { message: text });
    },

    resumeHitl: (decisions: unknown[]) => {
      // Don't create a new assistant message — append to the interrupted one
      startStream("/resume", { decisions }, false);
    },

    resetChat: async () => {
      abortController?.abort();
      try {
        const data = await apiPost<{ token: string; thread_id: string }>("/reset");
        if (data.token) setToken(data.token);
      } catch { /* ignore */ }
      set({ messages: [], isStreaming: false, status: "ready" });
      useUsageStore.getState().reset();
    },

    loadHistory: async () => {
      try {
        const data = await apiGet<{ messages: RawHistoryMessage[] }>("/history");
        if (!data.messages?.length) return;

        // Reconstruct grouped messages from backend format
        const messages: Message[] = [];
        let currentAssistant: Message | null = null;
        const pendingTools: Record<string, { name: string; input?: string }> = {};

        for (const msg of data.messages) {
          if (msg.role === "user") {
            if (currentAssistant) {
              messages.push(currentAssistant);
              currentAssistant = null;
            }
            messages.push({ role: "user", content: msg.content || "" });
          } else if (msg.role === "tool_call") {
            if (!currentAssistant) {
              currentAssistant = { role: "assistant", content: "", tools: [] };
            }
            const inputStr = typeof msg.tool_input === "object"
              ? JSON.stringify(msg.tool_input) : (msg.tool_input as string | undefined);
            const step: ToolStep = { name: msg.tool_name || "unknown", status: "running", input: inputStr };
            currentAssistant.tools = currentAssistant.tools || [];
            currentAssistant.tools.push(step);
            if (msg.tool_call_id) {
              pendingTools[msg.tool_call_id] = { name: msg.tool_name || "unknown", input: inputStr };
            }
          } else if (msg.role === "tool_result") {
            if (!currentAssistant) {
              currentAssistant = { role: "assistant", content: "", tools: [] };
            }
            const tools = currentAssistant.tools || [];
            const pending = msg.tool_call_id ? pendingTools[msg.tool_call_id] : undefined;
            if (pending) {
              // Find matching running tool
              const idx = tools.findIndex(
                (t) => t.status === "running" && t.name === pending.name,
              );
              if (idx >= 0) {
                tools[idx] = { ...tools[idx]!, status: "done", output: msg.tool_output };
              }
              if (msg.tool_call_id) delete pendingTools[msg.tool_call_id];
            } else {
              // Orphan result
              tools.push({
                name: msg.tool_name || "unknown",
                status: "done",
                output: msg.tool_output,
              });
            }
            currentAssistant.tools = tools;
          } else if (msg.role === "assistant") {
            if (!currentAssistant) {
              currentAssistant = { role: "assistant", content: "", tools: [] };
            }
            currentAssistant.content = msg.content || "";
            // Finalize any remaining running tools
            if (currentAssistant.tools) {
              currentAssistant.tools = currentAssistant.tools.map((t) =>
                t.status === "running" ? { ...t, status: "done" as const } : t,
              );
            }
            messages.push(currentAssistant);
            currentAssistant = null;
          }
        }
        if (currentAssistant) messages.push(currentAssistant);

        set({ messages });
      } catch { /* ignore */ }
    },
  };
});

/** Raw message format from backend /history endpoint */
interface RawHistoryMessage {
  role: string;
  content?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: string;
  tool_call_id?: string;
}
