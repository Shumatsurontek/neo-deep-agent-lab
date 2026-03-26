import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
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
      "/documents": BACKEND,
      // SSE endpoints need special proxy config to avoid buffering
      "/logs": {
        target: BACKEND,
        changeOrigin: true,
        headers: { Connection: "keep-alive" },
      },
    },
  },
});
