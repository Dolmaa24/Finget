import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the ESM half of the extension: the service worker and the popup.
 *
 * The content scripts need a different format entirely (no ESM in a manifest
 * `content_scripts` entry), so they get their own config and a second `vite
 * build` pass. See vite.content.config.ts.
 */
export default defineConfig({
  root: resolve(__dirname, "src"),
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    // Chrome's extension review reads the source; unminified output makes the
    // "what does this thing do" question answerable.
    minify: false,
    target: "chrome102",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        popup: resolve(__dirname, "src/popup.html"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
