import { defineConfig, devices } from '@playwright/test';

/**
 * E2E_TARGET=build runs against the e2e production build (`npm run e2e:build`, then `npm run e2e:serve` on :3300;
 * src/shared/dev-helpers.ts) instead of the dev server. `next start` holds about 0.5 GB and compiles nothing,
 * where the dev server's Turbopack grows to 2–6 GB over an e2e run, past what the 7.7 GB VPS can give it. The
 * gate uses it (scripts/gate.mjs). The UI previews need the dev server.
 */
const target = process.env.E2E_TARGET === 'build' ? 'build' : 'dev';
const PORT = Number(process.env.PORT ?? (target === 'build' ? 3300 : 3000));
const baseURL = `http://localhost:${PORT}`;

/**
 * Projects:
 *   ui-mobile / ui-desktop  → tests/ui-previews (every registered UI preview: render, axe, screenshot)
 *   app-mobile / app-desktop → tests/e2e (app flows, added by Claude as screens get wired)
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  timeout: 120_000,
  // One dev server compiles routes on demand; more workers only queue behind it and time out.
  workers: process.env.CI ? 2 : 4,
  // The dev server compiles routes on demand and occasionally serves one transient error while
  // doing so; one retry absorbs that, and retried tests still show as flaky in the report.
  retries: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer:
    target === 'build'
      ? // Answers once the e2e build is up: a normal build has no /dev and never gets there.
        { command: 'npm run e2e:serve', url: `${baseURL}/dev/sign-in`, reuseExistingServer: !process.env.CI, timeout: 120_000 }
      : {
          command: 'npm run dev',
          // The preview gallery needs no database, so the UI harness can start without one.
          url: `${baseURL}/dev/ui`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
  projects: [
    {
      name: 'ui-mobile',
      testMatch: /ui-previews\/.*\.spec\.ts/,
      // Settled states: screenshots and axe see final frames, not animations in flight.
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' },
    },
    {
      name: 'ui-desktop',
      testMatch: /ui-previews\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' },
    },
    {
      // Reseeds the dev database before the app flows, and again after them (tests/e2e/support/reset.ts).
      name: 'e2e-setup',
      testMatch: /e2e\/global\.setup\.ts/,
      teardown: 'e2e-teardown',
    },
    {
      name: 'e2e-teardown',
      testMatch: /e2e\/global\.teardown\.ts/,
    },
    {
      name: 'app-mobile',
      testMatch: /e2e\/.*\.spec\.ts/,
      dependencies: ['e2e-setup'],
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'app-desktop',
      testMatch: /e2e\/.*\.spec\.ts/,
      dependencies: ['e2e-setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
