import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
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
  webServer: {
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
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'ui-desktop',
      testMatch: /ui-previews\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Reseeds the dev database before the app flows (see tests/e2e/global.setup.ts).
      name: 'e2e-setup',
      testMatch: /e2e\/global\.setup\.ts/,
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
