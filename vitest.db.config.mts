import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests against the local Postgres test database (TEST_DATABASE_URL).
 * Run with `npm run test:db` (needs `npm run db:up`). Not part of `npm run check`, so
 * Codex's worktree and machines without Docker can still run the unit tests.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./tests/integration/global-setup.ts'],
    setupFiles: ['./tests/integration/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
