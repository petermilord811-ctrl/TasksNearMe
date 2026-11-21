import { describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, rateLimitWaitMs, RATE_LIMIT_MAX_WAIT_MS } from './timeout';

/** A provider that answers each call with the next status in line (its retry-after header, if any). */
function provider(...answers: Array<{ status: number; retryAfter?: string }>) {
  return vi.fn(async () => {
    const next = answers.shift() ?? { status: 200 };
    return new Response(null, { status: next.status, headers: next.retryAfter === undefined ? {} : { 'retry-after': next.retryAfter } });
  });
}

describe('rateLimitWaitMs', () => {
  it('waits what the provider asks, at most two seconds, and a second when it says nothing', () => {
    expect(rateLimitWaitMs('0')).toBe(0);
    expect(rateLimitWaitMs('0.5')).toBe(500);
    expect(rateLimitWaitMs('30')).toBe(RATE_LIMIT_MAX_WAIT_MS);
    expect(rateLimitWaitMs(null)).toBe(1_000);
    expect(rateLimitWaitMs('Sat, 21 Nov 2026 13:00:00 GMT')).toBe(1_000);
  });
});

describe('fetchWithTimeout and "too many requests" (launch rehearsal J-L4)', () => {
  it('tries a 429 once more after the wait it asks for', async () => {
    const send = provider({ status: 429, retryAfter: '1' }, { status: 200 });
    const sleep = vi.fn(async () => undefined);
    const response = await fetchWithTimeout(send as unknown as typeof fetch, 'https://api.example.test/emails', { method: 'POST' }, 'Resend', 15_000, sleep);
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('hands a second 429 back to the caller, which retries on its own schedule', async () => {
    const send = provider({ status: 429 }, { status: 429 });
    const response = await fetchWithTimeout(send as unknown as typeof fetch, 'https://api.example.test/emails', { method: 'POST' }, 'Postmark', 15_000, async () => undefined);
    expect(response.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends once when the provider takes it, and never waits', async () => {
    const send = provider({ status: 200 });
    const sleep = vi.fn(async () => undefined);
    expect((await fetchWithTimeout(send as unknown as typeof fetch, 'https://api.example.test/emails', { method: 'POST' }, 'Resend', 15_000, sleep)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
