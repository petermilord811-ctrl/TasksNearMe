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
    // Traced only on the retry. Recording every first attempt (screencast, DOM snapshots) cost CPU and memory on
    // every run; a failing test is always retried once, so it still leaves a trace.
    trace: 'on-first-retry',
  },
  webServer:
    target === 'build'
      ? // Answers once the e2e build is up: a normal build has no /dev and never gets there. Never reuses a server
        // already on the port: an orphaned `e2e:serve` from an earlier run served a stale build (missing CSS
        // chunks, old content), so a leftover server now fails the run instead.
        { command: 'npm run e2e:serve', url: `${baseURL}/dev/sign-in`, reuseExistingServer: false, timeout: 120_000 }
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
      // No trace: one test walks a few hundred previews, so a trace ran past 80 MB. A failure names the preview
      // and its error, and /dev/ui/<id> shows it.
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, reducedMotion: 'reduce', trace: 'off' },
    },
    {
      name: 'ui-desktop',
      testMatch: /ui-previews\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', trace: 'off' },
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
