import type { AccountVerification, FoundingHelperCard, HelperStandingView } from '@/contracts';

/**
 * The profile's first page (completion plan 6.5): the founding-helper gift card in each state, the verification
 * steps a new helper and a verified helper see, and the account page's verification section for a helper and
 * a client. The welcome program's canonical values: $50, first 100 verified helpers, a $40 task within 60 days.
 */

const welcome = { amountCents: 5000, cohortSize: 100, minTaskPriceCents: 4000, windowDays: 60 } as const;

/** A new helper: 37 spots left, the phone done, the ID check in review, three steps to go. */
export const foundingOpenCard: FoundingHelperCard = {
  ...welcome,
  state: 'open',
  spotsLeft: 37,
  stillNeeded: ['identity', 'address', 'payout', 'background'],
  progress: { done: 1, total: 5 },
};

/** Sam: founding helper #12, the first $40 task still to do by Jan 2. */
export const foundingYoursCard: FoundingHelperCard = {
  ...welcome,
  state: 'yours',
  number: 12,
  spotsLeft: 36,
  claimBy: '2027-01-02T18:00:00.000Z',
  stillNeeded: [],
  progress: { done: 5, total: 5 },
};

/** Jordan: #4, the gift card on its way. */
export const foundingEarnedCard: FoundingHelperCard = { ...foundingYoursCard, state: 'earned', number: 4 };

/** The last spot is about to go (one left). */
export const foundingLastSpotCard: FoundingHelperCard = { ...foundingOpenCard, spotsLeft: 1, stillNeeded: ['background'], progress: { done: 4, total: 5 } };

export const newHelperStanding: HelperStandingView = {
  founding: foundingOpenCard,
  steps: [
    { step: 'phone', state: 'done' },
    { step: 'identity', state: 'in_review' },
    { step: 'address', state: 'locked' },
    { step: 'payout', state: 'locked' },
    { step: 'background', state: 'locked' },
  ],
};

/** Sam: every step done (a yard and furniture helper who doesn't need the background check). */
export const verifiedHelperStanding: HelperStandingView = {
  founding: foundingYoursCard,
  steps: [
    { step: 'phone', state: 'done' },
    { step: 'identity', state: 'done' },
    { step: 'address', state: 'done' },
    { step: 'payout', state: 'done' },
  ],
};

/** No founding card (the spots went before this helper verified): the checklist alone. */
export const lateHelperStanding: HelperStandingView = { steps: newHelperStanding.steps };

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
