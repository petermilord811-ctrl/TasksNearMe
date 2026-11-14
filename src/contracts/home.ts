import type { BookingListRow } from './bookings';
import type { Cents, ISODateTime } from './common';
import type { FindWorkCard, HelperSetupState, MyOfferRow } from './helper-work';
import type { OwnerTaskRow } from './offers';
import type { OnboardingStep } from './routes';

/**
 * The signed-in home (`/app`, blueprint 02 §1.2): "Needs your attention" first, then what's coming up.
 * The mode switch picks the dashboard: the client's or the helper's. Every item is decided by the app.
 */

/** Where an attention item leads; the UI picks the route builder by `kind`. */
export type AttentionTarget =
  | { kind: 'booking'; bookingId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'thread'; threadId: string }
  | { kind: 'messages' }
  | { kind: 'find_work_task'; taskId: string }
  | { kind: 'onboarding'; step: OnboardingStep }
  | { kind: 'earnings' }
  /** A support case on `/app/support/[caseId]` (UI-026). */
  | { kind: 'support_case'; caseId: string }
  /** An invite in the helper's offers (`routes.app.offers(inviteId)`, UI-025). */
  | { kind: 'invite'; inviteId: string }
  /** A rebooking proposal (`routes.app.proposal(proposalId)`, UI-032). */
  | { kind: 'proposal'; proposalId: string }
  /** Regular visits (`routes.app.series(seriesId)`). */
  | { kind: 'series'; seriesId: string }
  /** The account page (privacy requests, sign-in, notifications). */
  | { kind: 'account' }
  /** A client's ID check (`routes.app.verifyIdentity()`). */
  | { kind: 'verify_identity' }
  /** The helper's gift cards (`routes.app.rewards()`). */
  | { kind: 'rewards' }
  /** A community post (`routes.app.communityPost(postId)`, completion plan 7.7). */
  | { kind: 'community_post'; postId: string }
  /** A saved search's board view (`routes.app.savedSearch(searchId)`, completion plan 7.10). */
  | { kind: 'saved_search'; searchId: string };

export const ATTENTION_KINDS = [
  /** Client: approve the submitted work (or report a problem) before the deadline. */
  'approve_work',
  /** Client: new offers on an open task. */
  'review_offers',
  /** Client: a booking waits for payment. */
  'finish_payment',
  /** Client: the helper can't get in; answer before the deadline. */
  'answer_cant_access',
  /** Both: unread messages. */
  'unread_messages',
  /** Helper: a booking starts today; check in on the way. */
  'check_in_today',
  /** Helper: the task changed; confirm the offer again. */
  'reconfirm_offer',
  /** Helper: finish setting up to send offers. */
  'finish_setup',
  /** Helper: a payout failed; update the bank. */
  'payout_action_needed',
  /** Helper: a client's invite waits for an answer (UI-032). */
  'answer_invite',
  /** Client: the helper countered an invite; accept or decline (UI-032). */
  'answer_counter',
  /** Client: a helper proposed a booking; pay or decline (UI-032). */
  'answer_proposal',
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export interface AttentionItem {
  /** Stable key for lists. */
  id: string;
  kind: AttentionKind;
  /** The task's title, when the item is about one task. */
  title?: string;
  /** How many (new offers, unread messages). */
  count?: number;
  /** When it's due (approve by, answer by, starts at). */
  dueAt?: ISODateTime;
  /** The other person, when one person is waiting on you ("Maya R." for an invite, a counter or a proposal). */
  actorName?: string;
  target: AttentionTarget;
}

/** The client's home. */
export interface PosterHomeData {
  mode: 'poster';
  /** First name, for "Good morning, Maya". */
  firstName: string;
  /** Most urgent first. */
  attention: AttentionItem[];
  /** The next bookings (up to 3), soonest first. */
  upcoming: BookingListRow[];
  /** Open tasks (up to 3), newest first. */
  openTasks: OwnerTaskRow[];
}

/** The helper's home. */
export interface HelperHomeData {
  mode: 'helper';
  firstName: string;
  attention: AttentionItem[];
  upcoming: BookingListRow[];
  /** Active offers (up to 3), soonest start first. */
  activeOffers: MyOfferRow[];
  /** Nearby open tasks the helper can offer on (up to 3). */
  suggestions: FindWorkCard[];
  earnings: { upcomingCents: Cents; onTheWayCents: Cents };
  setup: HelperSetupState;
}

/** `/app` (the public home is `HomePageData` in marketing.ts). */
export type AppHomePageData = PosterHomeData | HelperHomeData;
