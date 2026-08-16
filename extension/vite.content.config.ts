import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Content scripts, built as self-contained IIFEs.
 *
 * A manifest `content_scripts` entry cannot be an ES module, so these cannot
 * share a chunk with anything — each one has to inline every import. That is
 * why this is a separate build, and why it runs with `emptyOutDir: false`: it
 * writes into the directory the ESM pass just produced.
 *
 * Rollup will not emit two separate IIFE bundles from one build, so there is
 * one config per content script. Both come from this factory.
 */
export function contentConfig(entry: string) {
  return defineConfig({
    publicDir: false,
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: false,
      minify: false,
      target: "chrome102",
      lib: {
        entry: resolve(__dirname, `src/${entry}.ts`),
        formats: ["iife"],
        name: `finget_${entry}`,
        fileName: () => `${entry}.js`,
      },
    },
  });
}

export default contentConfig("content");
