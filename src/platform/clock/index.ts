import 'server-only';
import { cookies } from 'next/headers';
import { readClockOffset } from './signing';

/**
 * The request's "now" (blueprint 10 §3.1, time travel). Pages, route handlers and Server Actions read it
 * instead of `new Date()`; domain code takes `now` as a parameter. The job runner keeps real time.
 *
 * The test clock moves one browser's "now" through a signed cookie set by `/dev/clock`, so parallel e2e
 * tests never see each other's time. It's built in only in development and in builds made with
 * `TEST_CLOCK=1` (preview, staging): `next.config.ts` inlines `TEST_CLOCK_BUILD`, so a production build
 * without it reduces `requestNow()` to `new Date()`. Outside development it also needs `TEST_CLOCK_SECRET`.
 */

export const TEST_CLOCK_COOKIE = 'tnm_test_clock';
const DEV_SECRET = 'dev-test-clock';

/** The secret that signs the clock cookie, or null when the test clock is off. */
export function testClockSecret(): string | null {
  if (process.env.TEST_CLOCK_BUILD !== '1') return null;
  return process.env.TEST_CLOCK_SECRET || (process.env.NODE_ENV === 'development' ? DEV_SECRET : null);
}

export async function requestNow(): Promise<Date> {
  if (process.env.TEST_CLOCK_BUILD !== '1') return new Date();
  const secret = testClockSecret();
  if (!secret) return new Date();
  const offset = readClockOffset((await cookies()).get(TEST_CLOCK_COOKIE)?.value, secret);
  return new Date(Date.now() + offset);
}
