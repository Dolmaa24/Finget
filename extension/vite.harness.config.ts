import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Dev-only server for harness/index.html. Never built, never shipped — the
 * extension's own `build` script does not reference this config.
 */
export default defineConfig({
  root: resolve(__dirname, "harness"),
  publicDir: false,
  server: { port: 5199, strictPort: true },
});
