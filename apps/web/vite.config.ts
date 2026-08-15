import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverOrigin =
  process.env.GETTYSBURG_SERVER_ORIGIN ?? "http://127.0.0.1:2567";

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.GETTYSBURG_WEB_HOST ?? "127.0.0.1",
    port: Number(process.env.GETTYSBURG_WEB_PORT ?? "5173"),
    proxy: {
      "/healthz": serverOrigin,
      "/matchmake": serverOrigin,
      "/readyz": serverOrigin,
      "^/[A-Za-z0-9_-]{8,}/[A-Za-z0-9_-]{8,}(?:\\?|$)": {
        target: serverOrigin,
        ws: true,
      },
    },
    strictPort: true,
  },
});
