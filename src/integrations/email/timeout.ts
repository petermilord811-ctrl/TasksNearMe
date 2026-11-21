/**
 * How long an email provider gets to answer one send (sweep MN7). Notification emails go out one at a time inside the
 * job runner's lock, so a provider that hangs (Node's own limit is 300 s a request) held up offer expiry,
 * auto-approval, scheduled charges and transfers behind it. Twilio and web push already stop at 15 s.
 */
export const EMAIL_SEND_TIMEOUT_MS = 15_000;

/**
 * The provider didn't answer in time. It's thrown like a refusal, so callers retry it on their usual schedule (a
 * notification delivery 5, 30 and 120 minutes later). Resend may have taken the email after all: a retry carries the
 * same idempotency key, so it isn't sent twice.
 */
export class EmailTimeoutError extends Error {
  constructor(
    readonly provider: string,
    readonly timeoutMs: number,
  ) {
    super(`${provider} didn't answer within ${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`}`);
    this.name = 'EmailTimeoutError';
  }
}

/** The longest a send waits out a provider's "too many requests" before its one more try. */
export const RATE_LIMIT_MAX_WAIT_MS = 2_000;

/**
 * How long to wait after a 429: the provider's `retry-after` (seconds, as Resend sends it), at most
 * RATE_LIMIT_MAX_WAIT_MS; a second when it gives none (Postmark doesn't document one).
 */
export function rateLimitWaitMs(retryAfter: string | null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, RATE_LIMIT_MAX_WAIT_MS) : 1_000;
}

/**
 * One call to a provider, given up after `timeoutMs`. A 429 ("too many requests": Resend allows 10 a second for the
 * whole team, every key and environment together) is tried once more after the wait it asks for, so a burst (a city's
 * "we're open" emails going out) doesn't fail someone's sign-in code. The provider didn't take the email, so the
 * retry can't send it twice; a second 429 comes back to the caller like any refusal (launch rehearsal J-L4).
 */
export async function fetchWithTimeout(send: typeof fetch, url: string, init: RequestInit, provider: string, timeoutMs = EMAIL_SEND_TIMEOUT_MS, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<Response> {
  const once = async () => {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await send(url, { ...init, signal });
    } catch (error) {
      if (signal.aborted) throw new EmailTimeoutError(provider, timeoutMs);
      throw error;
    }
  };
  const first = await once();
  if (first.status !== 429) return first;
  await sleep(rateLimitWaitMs(first.headers.get('retry-after')));
  return once();
}
