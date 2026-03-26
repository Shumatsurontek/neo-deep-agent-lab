import { authHeaders } from "./api";

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

export type SSEHandler = (event: SSEEvent) => void;

/**
 * Stream SSE from a POST endpoint. Calls `onEvent` for each parsed event.
 * Returns an AbortController to cancel the stream.
 */
export function streamSSE(
  url: string,
  body: unknown,
  onEvent: SSEHandler,
  onDone?: () => void,
  onError?: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        onError?.(new Error(`SSE fetch failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
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
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            onEvent(JSON.parse(payload));
          } catch {
            // skip malformed JSON
          }
        }
      }

      // process remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        const payload = buffer.trim().slice(6);
        if (payload !== "[DONE]") {
          try { onEvent(JSON.parse(payload)); } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError?.(err as Error);
      }
    } finally {
      onDone?.();
    }
  })();

  return controller;
}
