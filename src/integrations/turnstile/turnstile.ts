import { randomUUID } from 'node:crypto';
import type { BotChecker, BotCheckResult } from './index';

/**
 * Cloudflare Turnstile's server-side check (siteverify): POST the widget's token with the secret key, once
 * per token. Tokens last 300 seconds, are single-use and at most 2048 characters
 * (developers.cloudflare.com/turnstile/get-started/server-side-validation).
 *
 * - `invalid-input-response`: a bad or forged token → `invalid`.
 * - `timeout-or-duplicate`: expired or already used → `expired` (the widget gets a new token).
 * - `missing-input-secret` / `invalid-input-secret` / `bad-request`: our setup is wrong → thrown, so it shows
 *   in the logs and the person sees "something went wrong" instead of a bot warning.
 * - `internal-error`, 5xx and timeouts: retried once with the same idempotency key, then let through and
 *   logged (`degraded`). Rate limits still apply, and a Cloudflare outage shouldn't stop every sign-in.
 */

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;
export const TOKEN_MAX_LENGTH = 2048;

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
  action?: string;
  hostname?: string;
}

type Env = Record<string, string | undefined>;

export class TurnstileSetupError extends Error {}

export function createTurnstileChecker(secretKey: string, fetchImpl: typeof fetch = fetch): BotChecker {
  async function siteverify(token: string, ip: string | null, idempotencyKey: string): Promise<SiteverifyResponse | 'unreachable'> {
    try {
      const body = new URLSearchParams({ secret: secretKey, response: token, idempotency_key: idempotencyKey });
      if (ip) body.set('remoteip', ip);
      const response = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status >= 500) return 'unreachable';
      return (await response.json()) as SiteverifyResponse;
    } catch {
      return 'unreachable';
    }
  }

  return {
    name: 'turnstile',
    async verify({ token, action, ip }): Promise<BotCheckResult> {
      if (!token) return { ok: false, reason: 'missing' };
      if (token.length > TOKEN_MAX_LENGTH) return { ok: false, reason: 'invalid' };
      const key = randomUUID();
      let answer = await siteverify(token, ip, key);
      const retry = answer === 'unreachable' || answer['error-codes']?.includes('internal-error');
      if (retry) answer = await siteverify(token, ip, key);
      if (answer === 'unreachable' || answer['error-codes']?.includes('internal-error')) {
        console.warn('[turnstile] siteverify unavailable; letting the request through', { action });
        return { ok: true, degraded: true };
      }
      if (answer.success === true) {
        // The widget names the form it ran on; a token from another form doesn't count here.
        if (answer.action && answer.action !== action) return { ok: false, reason: 'invalid' };
        return { ok: true };
      }
      const codes = answer['error-codes'] ?? [];
      if (codes.some((code) => code === 'missing-input-secret' || code === 'invalid-input-secret' || code === 'bad-request')) {
        throw new TurnstileSetupError(`Turnstile refused our request (${codes.join(', ')}): check TURNSTILE_SECRET_KEY.`);
      }
      if (codes.includes('timeout-or-duplicate')) return { ok: false, reason: 'expired' };
      if (codes.includes('missing-input-response')) return { ok: false, reason: 'missing' };
      return { ok: false, reason: 'invalid' };
    },
  };
}

/**
 * Turnstile when both keys are set (`TURNSTILE_SITE_KEY` for the widget, `TURNSTILE_SECRET_KEY` here). One key
 * without the other is a setup mistake, refused rather than quietly falling back to the stand-in.
 */
export function turnstileFromEnv(env: Env = process.env, fetchImpl: typeof fetch = fetch): BotChecker | null {
  const siteKey = env.TURNSTILE_SITE_KEY;
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!siteKey && !secretKey) return null;
  if (!siteKey) throw new TurnstileSetupError('TURNSTILE_SECRET_KEY is set without TURNSTILE_SITE_KEY (the widget needs it).');
  if (!secretKey) throw new TurnstileSetupError('TURNSTILE_SITE_KEY is set without TURNSTILE_SECRET_KEY (siteverify needs it).');
  return createTurnstileChecker(secretKey, fetchImpl);
}
