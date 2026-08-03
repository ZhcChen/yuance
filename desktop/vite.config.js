import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  base: "/",
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  server: {
    host: "127.0.0.1",
    port: 4273,
    strictPort: true,
  },
  build: {
    modulePreload: { polyfill: false },
    outDir: "../../renderer-dist",
    emptyOutDir: true,
    manifest: false,
    sourcemap: false,
  },
});
