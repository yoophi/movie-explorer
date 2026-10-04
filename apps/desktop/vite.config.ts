import path from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const port = Number.parseInt(process.env.DEV_PORT ?? "1420", 10);
const strictPort = process.env.DEV_STRICT_PORT === "true";
const explorerKitRoot = path.resolve(__dirname, "../../../explorer-kit");

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@yoophi/ui-radix", "@yoophi/collection-core", "@movie-explorer/ui", "@yoophi/explorer-core", "@yoophi/scan-client", "@yoophi/settings-core", "@yoophi/settings-ui"],
  },
  clearScreen: false,
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), explorerKitRoot],
    },
    port,
    strictPort,
    host: host || process.env.DEV_HOST || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
