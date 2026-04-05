import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/chat": BACKEND,
      "/resume": BACKEND,
      "/session": BACKEND,
      "/reset": BACKEND,
      "/context": BACKEND,
      "/search": BACKEND,
      "/scratchpad": BACKEND,
      "/providers": BACKEND,
      "/provider": BACKEND,
      "/hitl": BACKEND,
      "/middleware": BACKEND,
      "/history": BACKEND,
      "/health": BACKEND,
      "/prompt-preview": BACKEND,
      "/download": BACKEND,
      // SSE endpoints need special proxy config to avoid buffering
      "/documents/upload-stream": {
        target: BACKEND,
        changeOrigin: true,
        headers: { Connection: "keep-alive" },
      },
      "/documents/text-stream": {
        target: BACKEND,
        changeOrigin: true,
        headers: { Connection: "keep-alive" },
      },
      "/documents": BACKEND,
      "/finetune/start": {
        target: BACKEND,
        changeOrigin: true,
        headers: { Connection: "keep-alive" },
      },
      "/finetune": BACKEND,
      "/logs": {
        target: BACKEND,
        changeOrigin: true,
        headers: { Connection: "keep-alive" },
      },
    },
  },
});
