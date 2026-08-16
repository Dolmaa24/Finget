import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    // mongodb-memory-server can take a while to spin up the first time.
    testTimeout: 30000,
    hookTimeout: 60000,
    // Integration suites share one Mongo connection; run files serially.
    fileParallelism: false,
  },
});
