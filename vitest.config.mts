import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Unit and component tests.
 * Default environment is node. UI component tests opt into the DOM with a docblock at the top:
 *   /** @vitest-environment jsdom *\/
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
