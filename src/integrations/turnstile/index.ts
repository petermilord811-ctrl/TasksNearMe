import { BOT_CHECK_STAND_IN_TOKEN, type BotCheckAction, type BotCheckConfig } from '@/contracts';
import { turnstileFromEnv } from './turnstile';
import { devHelpersOn } from '@/shared/dev-helpers';

/**
 * Bot checks on abuse-prone forms (blueprint 07 §2 and §8, 06 §4: sign-in codes, sign-up, posting). Cloudflare
 * Turnstile when its keys are set (`./turnstile.ts`, siteverify over REST, no SDK). Outside production builds a
 * stand-in serves instead: on its own without keys, and beside Turnstile for a browser with the
 * `tnm_turnstile_stand_in=1` cookie (tests). Production without keys refuses every check rather than wave bots
 * through (decisions.md, 2026-11-13).
 */

export type BotCheckFailure = 'missing' | 'invalid' | 'expired' | 'unconfigured';
export type BotCheckResult = { ok: true; degraded?: boolean } | { ok: false; reason: BotCheckFailure };

export interface BotCheckRequest {
  /** The widget's answer, from the form. */
  token: string | undefined;
  action: BotCheckAction;
  /** The person's address (for Cloudflare's own signals), when known. */
  ip: string | null;
}

export interface BotChecker {
  readonly name: 'turnstile' | 'stand-in' | 'unconfigured';
  verify(request: BotCheckRequest): Promise<BotCheckResult>;
}

type Env = Record<string, string | undefined>;

/** The cookie a development or test browser sets to use the stand-in even where real keys are set. */
export const TURNSTILE_STAND_IN_COOKIE = 'tnm_turnstile_stand_in';
/** What the stand-in widget answers (contracts/bot-check.ts). Any other token fails, so tests can show the error. */
export const STAND_IN_PASS_TOKEN = BOT_CHECK_STAND_IN_TOKEN;

export function standInBotCheckAllowed(env: Env = process.env): boolean {
  return devHelpersOn(env);
}

export const standInBotChecker: BotChecker = {
  name: 'stand-in',
  async verify({ token }) {
    if (!token) return { ok: false, reason: 'missing' };
    return token === STAND_IN_PASS_TOKEN ? { ok: true } : { ok: false, reason: 'invalid' };
  },
};

const unconfigured: BotChecker = {
  name: 'unconfigured',
  async verify() {
    console.error('[turnstile] Bot checks need Turnstile in production: set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.');
    return { ok: false, reason: 'unconfigured' };
  },
};

function standInWanted(env: Env, standInCookie: string | undefined): boolean {
  if (!standInBotCheckAllowed(env)) return false;
  return !turnstileFromEnv(env) || standInCookie === '1';
}

/** The checker for this request. `standInCookie` is the request's `tnm_turnstile_stand_in` cookie. */
export function createBotChecker(standInCookie: string | undefined, env: Env = process.env, fetchImpl: typeof fetch = fetch): BotChecker {
  if (standInWanted(env, standInCookie)) return standInBotChecker;
  return turnstileFromEnv(env, fetchImpl) ?? unconfigured;
}

/** What the page tells the form's widget: Turnstile's site key, the stand-in, or nothing (production, no keys). */
export function botCheckConfig(standInCookie: string | undefined, env: Env = process.env): BotCheckConfig | undefined {
  if (standInWanted(env, standInCookie)) return { provider: 'stand_in' };
  const siteKey = env.TURNSTILE_SITE_KEY;
  return siteKey && turnstileFromEnv(env) ? { provider: 'turnstile', siteKey } : undefined;
}
