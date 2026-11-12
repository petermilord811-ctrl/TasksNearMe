import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The test clock's cookie value: an offset in milliseconds and its HMAC, so nobody can move a server's
 * clock on preview or staging without the secret. Offsets are kept within 400 days.
 */

export const MAX_CLOCK_OFFSET_MS = 400 * 86_400_000;

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(`test-clock:${body}`).digest('base64url');
}

export function signClockOffset(offsetMs: number, secret: string): string {
  const body = String(Math.trunc(Math.max(-MAX_CLOCK_OFFSET_MS, Math.min(MAX_CLOCK_OFFSET_MS, offsetMs))));
  return `${body}.${mac(body, secret)}`;
}

/** The offset in a cookie value; 0 for a missing, malformed or forged one. */
export function readClockOffset(value: string | undefined, secret: string): number {
  if (!value) return 0;
  const [body, signature, ...rest] = value.split('.');
  if (!body || !signature || rest.length > 0 || !/^-?\d{1,11}$/.test(body)) return 0;
  const given = Buffer.from(signature);
  const expected = Buffer.from(mac(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 0;
  const offset = Number(body);
  return Math.abs(offset) <= MAX_CLOCK_OFFSET_MS ? offset : 0;
}
