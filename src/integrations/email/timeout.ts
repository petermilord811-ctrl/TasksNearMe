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

/** One call to a provider, given up after `timeoutMs`. */
export async function fetchWithTimeout(send: typeof fetch, url: string, init: RequestInit, provider: string, timeoutMs = EMAIL_SEND_TIMEOUT_MS): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await send(url, { ...init, signal });
  } catch (error) {
    if (signal.aborted) throw new EmailTimeoutError(provider, timeoutMs);
    throw error;
  }
}
