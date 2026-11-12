import { expect, type Page } from '@playwright/test';

/**
 * The test clock (`/dev/clock`, src/platform/clock): moves "now" for this page's browser context only, so
 * parallel tests keep real time. Always reset it at the end of a test.
 */

const headers = () => ({ 'x-test-clock-secret': process.env.TEST_CLOCK_SECRET ?? 'dev-test-clock' });

export async function moveClock(page: Page, offsetMs: number): Promise<void> {
  const response = await page.request.post('/dev/clock', { data: { offsetMs }, headers: headers() });
  expect(response.ok(), `the test clock answered ${response.status()}`).toBe(true);
}

export async function resetClock(page: Page): Promise<void> {
  await page.request.delete('/dev/clock', { headers: headers() });
}
