import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestNow, testClockSecret } from './index';
import { signClockOffset } from './signing';

/** The request's cookie and headers, as `next/headers` would give them. */
const request = vi.hoisted(() => ({ cookie: undefined as string | undefined, headers: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'tnm_test_clock' && request.cookie ? { name, value: request.cookie } : undefined) }),
  headers: async () => ({ get: (name: string) => request.headers.get(name) ?? null }),
}));

afterEach(() => vi.unstubAllEnvs());

const DAY = 86_400_000;
const ahead = async () => (await requestNow()).getTime() - Date.now();

describe('the request clock', () => {
  it('is real time where the test clock is not built in', async () => {
    vi.stubEnv('TEST_CLOCK_BUILD', '0');
    const before = Date.now();
    const now = await requestNow();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime() - before).toBeLessThan(1_000);
    expect(testClockSecret()).toBeNull();
  });

  it('needs a secret outside development', () => {
    vi.stubEnv('TEST_CLOCK_BUILD', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TEST_CLOCK_SECRET', '');
    expect(testClockSecret()).toBeNull();
    vi.stubEnv('TEST_CLOCK_SECRET', 'staging secret');
    expect(testClockSecret()).toBe('staging secret');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_CLOCK_SECRET', '');
    expect(testClockSecret()).toBe('dev-test-clock');
  });

  it('moves with the development secret only for requests made on this machine', async () => {
    vi.stubEnv('TEST_CLOCK_BUILD', '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TEST_CLOCK_SECRET', '');
    request.cookie = signClockOffset(30 * DAY, 'dev-test-clock');
    request.headers = new Map([['host', 'localhost:3000'], ['x-forwarded-for', '::1']]);
    expect(await ahead()).toBeGreaterThan(29 * DAY);
    // Through the public dev address, a cookie signed with the secret in the source moves nothing.
    request.headers = new Map([['host', 'dev.tasksnearme.com'], ['x-forwarded-for', '203.0.113.9']]);
    expect(Math.abs(await ahead())).toBeLessThan(1_000);
    // With a secret of its own (preview, staging), a signed cookie counts from anywhere.
    vi.stubEnv('TEST_CLOCK_SECRET', 'staging secret');
    request.cookie = signClockOffset(30 * DAY, 'staging secret');
    expect(await ahead()).toBeGreaterThan(29 * DAY);
  });
});
