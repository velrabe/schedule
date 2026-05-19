import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Base path for GitHub Pages. If you deploy to a custom domain, leave it as "/".
// If you deploy to https://<user>.github.io/<repo>/, set VITE_BASE_PATH to "/<repo>/".
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [preact()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2020",
  },
});
