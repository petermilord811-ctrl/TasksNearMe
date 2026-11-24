import type { QueryHandler } from './actions';
import type { CategorySlug, ISODateTime, Photo, TimeZone } from './common';
import type { AvailabilitySlotView } from './availability';
import type { HelperSummary, ServiceSummary } from './people';
import type { BadgeView } from './badges';
import type { SparksSummary } from './sparks';

/** Tags a client can give a helper in a review. The UI maps each to copy ("On time"). */
export const HELPER_REVIEW_TAGS = [
  'on_time',
  'friendly',
  'careful',
  'clear_communication',
  'skilled',
  'tidy',
  'good_value',
] as const;
export type HelperReviewTag = (typeof HELPER_REVIEW_TAGS)[number];

export interface HelperServiceDetail extends ServiceSummary {
  /** The helper's own words about this service (plain text). */
  description: string;
}

/** A published review of a helper. Reviews are double-blind until both are in (blueprint 02 §J7). */
export interface PublicReviewView {
  id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags: HelperReviewTag[];
  body?: string;
  /** First name + last initial; `deleted`: the account is gone, and the page names it in its own words (J-PR15). */
  author: { displayName: string; initials: string; deleted?: true };
  categorySlug: CategorySlug;
  publishedAt: ISODateTime;
}

export interface WorkSampleView {
  id: string;
  photo: Photo;
  categorySlug?: CategorySlug;
  caption?: string;
}

/**
 * `/helpers/[handle]`: first name + last initial, neighborhood-level area, badges, services,
 * reviews, and work samples. Never a last name, address, phone, or email.
 */
export interface HelperProfilePageData {
  helper: HelperSummary;
  /** The helper's market zone: their open slots and reviews are dated on its clock (completion plan 8.1). */
  timeZone: TimeZone;
  /** Every achievement badge the helper shows, most notable first (completion plan 6.4). */
  achievements?: BadgeView[];
  bio: string;
  /** "Travels up to about 5 miles from East Austin." */
  serviceRadiusMiles: number;
  remoteOk: boolean;
  tools: string[];
  /** Display names, e.g. "English", "Spanish". */
  languages: string[];
  services: HelperServiceDetail[];
  /** Newest first, at most 10. The total is `helper.rating.count`. */
  reviews: PublicReviewView[];
  workSamples: WorkSampleView[];
  /** Open slots, soonest first (at most 6). Each links to `routes.app.requestHelper(handle, { slotId })` (UI-029). */
  slots?: AvailabilitySlotView[];
  /** Their Sparks with the bought part (2026-11-21); absent with none. Shown apart from the verification badges, ratings and reviews. */
  sparks?: SparksSummary;
  /** "Message" (`routes.app.newMessage({ helper: handle })`): absent when they take direct messages from nobody. */
  acceptsMessages?: boolean;
  /** Their @username (2026-11-22), under their name. */
  username?: string;
}

/**
 * What a helper shares on their profile with neighbors who've earned a top Sparks level (`CONTACT_LEVELS`, owner
 * 2026-11-24): nothing (the default), their email, their phone number, or both. Set on the account page. A phone
 * number that isn't verified never shows.
 */
export const CONTACT_SHARING_SETTINGS = ['none', 'email', 'phone', 'email_phone'] as const;
export type ContactSharingSetting = (typeof CONTACT_SHARING_SETTINGS)[number];

/** One kind of contact detail a helper shares. */
export type SharedContactKind = 'email' | 'phone';

/**
 * The contact panel on `/helpers/[handle]`, worked out for the viewer on every visit (never cached with the profile):
 * - `reveal`: the viewer has earned `HELPER_CONTACT_EARNED_MIN` Sparks. A button shows the details (`onRevealContact`);
 *   they're never in the page until then.
 * - `locked`: a signed-in viewer who hasn't earned that many yet: `earned` of `at`, with a way to see how to earn more.
 * Absent: the helper shares nothing that can show, the viewer isn't signed in or is the helper, either has blocked the
 * other, or the viewer's account is limited.
 */
export type HelperContactAccess =
  | { state: 'reveal'; shares: SharedContactKind[] }
  | { state: 'locked'; shares: SharedContactKind[]; earned: number; at: number };

/**
 * The details a helper shares, for a viewer who may see them: `phone` in E.164 (the UI writes it out and dials it).
 * Errors: `not_allowed` (no longer shared, or the viewer can't see them), `rate_limited` with `retryAt` (a day's
 * allowance of reveals is used up), `unknown`.
 */
export type HelperContactReveal =
  | { ok: true; email?: string; phone?: string }
  | { ok: false; code: 'not_allowed' | 'rate_limited' | 'unknown'; retryAt?: ISODateTime };

export type RevealHelperContactHandler = QueryHandler<{ helperId: string }, HelperContactReveal>;
