import type { ActionResult, PublicSupportHandlers, PublicSupportPageData } from '@/contracts';
import { standInBotCheck } from './bot-check';

/** The public contact form (completion plan 5.22, `routes.helpContact()`). */
export const publicSupportPageData: PublicSupportPageData = { botCheck: standInBotCheck };
/** Production without bot check keys: the form still shows (the server answers `unknown`). */
export const publicSupportNoBotCheckData: PublicSupportPageData = {};

export const publicSupportResults = {
  submitted: { ok: true, code: 'submitted' },
  invalid: { ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'], topic: ['required'], message: ['too_short'] } },
  rateLimited: { ok: false, code: 'rate_limited', retryAt: '2026-11-24T14:00:00.000Z' },
} satisfies Record<string, ActionResult>;

/** The address the "sent" state repeats (never a statement about an account). */
export const publicSupportSentEmail = 'maya@example.test';

export const fakePublicSupportHandlers: PublicSupportHandlers = {
  onSubmit: async () => publicSupportResults.submitted,
};
