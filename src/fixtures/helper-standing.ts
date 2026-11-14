import type { AccountVerification, HelperStandingView, WelcomeGiftCard } from '@/contracts';

/**
 * The profile's first page (completion plan 6.5): the $50 welcome gift card in each state (blueprint 05 §2,
 * 2026-11-14: every helper whose phone, ID and background checks pass), the verification steps a new helper and a
 * verified helper see, and the account page's verification section for a helper and a client.
 */

const amountCents = 5000;

/** A new helper: the phone done, the ID check in review, the background check still locked. */
export const welcomeOpenCard: WelcomeGiftCard = {
  state: 'open',
  amountCents,
  checks: [
    { check: 'phone', state: 'done' },
    { check: 'identity', state: 'in_review' },
    { check: 'background', state: 'locked' },
  ],
};

/** One check to go: the background check is next. */
export const welcomeAlmostCard: WelcomeGiftCard = {
  ...welcomeOpenCard,
  checks: [
    { check: 'phone', state: 'done' },
    { check: 'identity', state: 'done' },
    { check: 'background', state: 'current' },
  ],
};

/** Computer help only: the background check comes with an in-home service. */
export const welcomeRemoteOnlyCard: WelcomeGiftCard = {
  ...welcomeOpenCard,
  checks: [
    { check: 'phone', state: 'done' },
    { check: 'identity', state: 'done' },
    { check: 'background', state: 'skipped' },
  ],
};

const allDone: WelcomeGiftCard['checks'] = [
  { check: 'phone', state: 'done' },
  { check: 'identity', state: 'done' },
  { check: 'background', state: 'done' },
];

/** Jordan, founding helper #4: earned, with our team's quick check. */
export const welcomeEarnedCard: WelcomeGiftCard = { state: 'earned', amountCents, checks: allDone, foundingNumber: 4 };

/** Earned in a busy month: in line until December's gift cards (Dec 1, midnight in Austin). */
export const welcomeQueuedCard: WelcomeGiftCard = { ...welcomeEarnedCard, queuedUntil: '2026-12-01T06:00:00.000Z' };

/** Sam: ready to pick, by Feb 25. */
export const welcomeReadyCard: WelcomeGiftCard = { state: 'ready', amountCents, checks: allDone, expiresAt: '2027-02-25T18:00:00.000Z' };

/** Sent. */
export const welcomeDeliveredCard: WelcomeGiftCard = { state: 'delivered', amountCents, checks: allDone };

export const newHelperStanding: HelperStandingView = {
  giftCard: welcomeOpenCard,
  steps: [
    { step: 'phone', state: 'done' },
    { step: 'identity', state: 'in_review' },
    { step: 'address', state: 'locked' },
    { step: 'payout', state: 'locked' },
    { step: 'background', state: 'locked' },
  ],
};

/** Sam: every step done, the gift card ready to pick. */
export const verifiedHelperStanding: HelperStandingView = {
  giftCard: welcomeReadyCard,
  steps: [
    { step: 'phone', state: 'done' },
    { step: 'identity', state: 'done' },
    { step: 'address', state: 'done' },
    { step: 'payout', state: 'done' },
    { step: 'background', state: 'done' },
  ],
};

/** No gift card (the program is off in this market, or our team turned it down): the checklist alone. */
export const noGiftCardHelperStanding: HelperStandingView = { steps: newHelperStanding.steps };

export const helperAccountVerification: AccountVerification = {
  role: 'helper',
  steps: [
    { step: 'phone', state: 'done' },
    { step: 'identity', state: 'done' },
    { step: 'address', state: 'in_review' },
    { step: 'payout', state: 'todo' },
    { step: 'background', state: 'locked' },
  ],
  badges: { idVerifiedAt: '2026-11-04T16:00:00.000Z', phoneVerified: true },
};

/** A client our team asked for an ID check. */
export const clientAccountVerification: AccountVerification = {
  role: 'client',
  steps: [
    { step: 'phone', state: 'done' },
    { step: 'identity', state: 'todo' },
  ],
  badges: { phoneVerified: true },
};
