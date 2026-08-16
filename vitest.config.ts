import { defineConfig } from 'vitest/config';

/**
 * Frontend tests only. The backend is a separate CommonJS package with its own
 * vitest config and its own `npm test` — without this include, the root run
 * picks up `finget-backend/tests/**` and fails on missing globals.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'dist/**', 'finget-backend/**'],
  },
});
