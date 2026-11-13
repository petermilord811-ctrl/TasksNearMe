import type { ActionResult, BotCheckConfig } from '@/contracts';

/** Bot checks (contracts/bot-check.ts): the stand-in config, and the answers when a check is turned down. */
export const standInBotCheck: BotCheckConfig = { provider: 'stand_in' };

export const botCheckResults = {
  /** Cloudflare (or the stand-in) didn't accept the answer. */
  refused: { ok: false, code: 'validation_failed', fieldErrors: { botCheck: ['invalid'] } },
  /** The answer timed out or was used already: the widget gets a new one. */
  expired: { ok: false, code: 'validation_failed', fieldErrors: { botCheck: ['expired'] } },
  /** Sent before the check finished. */
  required: { ok: false, code: 'validation_failed', fieldErrors: { botCheck: ['required'] } },
} satisfies Record<string, ActionResult>;
