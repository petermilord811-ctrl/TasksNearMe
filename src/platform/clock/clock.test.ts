import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestNow, testClockSecret } from './index';

afterEach(() => vi.unstubAllEnvs());

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
});
