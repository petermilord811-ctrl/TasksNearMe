import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The Stripe check (tests/stripe): the money paths against Stripe's test mode, on the local test database. Opt-in and
 * never in CI: `STRIPE_TEST_CHECK=1 npm run test:stripe` (test keys in .env.stripe-test), or `STRIPE_TEST_CHECK=dry`
 * for the in-memory dry run. Its guard (tests/stripe/guard.ts) refuses live keys and the app's own database.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/stripe/**/*.check.ts'],
    environment: 'node',
    globalSetup: ['./tests/stripe/global-setup.ts'],
    setupFiles: ['./tests/stripe/setup-keys.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 300_000,
  },
});
