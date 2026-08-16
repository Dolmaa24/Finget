import { defineConfig } from "vitest/config";

/**
 * The adapters are tested against captured markup rather than against live
 * retail sites: a test that depends on Amazon's current HTML would fail on
 * their schedule, not ours. happy-dom gives the selectors something real to
 * run against without a browser.
 */
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
