import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { CategorySlug, ISODateTime, Photo, TimeZone } from './common';
import type { HelperSummary } from './people';
import type { BookingStatus } from './status';

// ---- Family followers (2026-11-24, owner's chat ideas: "implement others all one by one") ----------------------------
//
// A booking's client may let a family member follow it: an adult child following a parent's booking, or the reverse.
// The client picks an existing TasksNearMe account by @username or email (never an invite to someone without one). A
// follower reads, and never acts: the booking's status and time on the market's clock, the helper's public profile, the
// conversation as the client sees it (masked the same way) and its day-of status lines. A follower never sends, pays,
// changes, cancels or reviews, and never sees the exact address or any money. The helper always sees that someone
// follows ("Maya's family member Lia follows this booking"), never the follower's contact details. At most
// `BOOKING_FOLLOWERS_MAX` a booking; the client removes one, a follower leaves, and following ends on its own when the
// booking is canceled or `FOLLOW_ENDS_DAYS_AFTER_DONE` days after it's done.

const code = (value: FieldErrorCode) => value;

/** The most people who may follow one booking. */
export const BOOKING_FOLLOWERS_MAX = 2;
/** Following ends this many days after the booking is done (at once when it's canceled). */
export const FOLLOW_ENDS_DAYS_AFTER_DONE = 7;

/**
 * "Add a family member": an existing account's @username (with or without the @) or its email address. Not found,
 * blocked either way, the client themself, the booking's helper: refused (`not_found` or `not_allowed`).
 */
export const addFollowerInputSchema = z.object({
  bookingId: z.string(code('required')).trim().min(1, code('required')).max(80, code('invalid')),
  who: z.string(code('required')).trim().min(2, code('too_short')).max(254, code('too_long')),
});
export type AddFollowerInput = z.input<typeof addFollowerInputSchema>;

/** The client removes a follower (`followerId`: the follower's person id), or a follower leaves (no `followerId`). */
export interface RemoveFollowerInput {
  bookingId: string;
  followerId?: string;
}

/** A person who follows a booking, as its client sees them: the display name ("Lia K."), never contact details. */
export interface FollowerPerson {
  id: string;
  displayName: string;
  initials: string;
  photo?: Photo;
  since: ISODateTime;
}

/**
 * Why the client can't add another follower right now: the booking has `BOOKING_FOLLOWERS_MAX` already, or it's over
 * (canceled, or done more than `FOLLOW_ENDS_DAYS_AFTER_DONE` days ago), or it's one visit of regular visits (their
 * conversation is the series' own: not in this version).
 */
export const FOLLOW_ADD_BLOCKED_REASONS = ['limit', 'ended', 'series'] as const;
export type FollowAddBlockedReason = (typeof FOLLOW_ADD_BLOCKED_REASONS)[number];

/** The client's "Family members" panel (the booking page and the conversation's ⋯ menu). */
export interface BookingFollowersPanel {
  bookingId: string;
  followers: FollowerPerson[];
  max: number;
  canAdd: boolean;
  addBlockedReason?: FollowAddBlockedReason;
}

/**
 * Who follows a booking, by display name: what the helper always sees (and the client too), with the client's name
 * ("Maya's family member Lia follows this booking"). Never a follower's contact details or username.
 */
export interface FollowedByNotice {
  clientName: string;
  names: string[];
}

/**
 * Family followers on a booking's page or conversation, for its client (`manage` and `followedBy`), its helper
 * (`followedBy` only, when someone follows) or a follower (`following`).
 */
export interface BookingFamilyView {
  manage?: BookingFollowersPanel;
  followedBy?: FollowedByNotice;
  /** The viewer follows this booking, read-only: the client's name ("You're following Maya's booking"). */
  following?: { bookingId: string; clientName: string };
}

/** A day-of moment a follower sees on the booking: on the way, arrived, done, canceled (UTC, shown on the market's clock). */
export interface FollowedCheckIn {
  onMyWayAt?: ISODateTime;
  arrivedAt?: ISODateTime;
  completedAt?: ISODateTime;
  canceledAt?: ISODateTime;
}

/**
 * A booking a family member follows, read-only (`/app/bookings/[bookingId]` for a follower). Built from its own fields
 * only: no exact address, no money, no payments, no actions. `timeZone`: the booking's market, whose clock its times
 * show on whoever reads (wrap the screen in `MarketTime`).
 */
export interface FollowedBookingView {
  id: string;
  task: { title: string; categorySlug: CategorySlug };
  status: BookingStatus;
  start: ISODateTime;
  timeZone: TimeZone;
  /** The general area ("Duckpond"), or remote. Never the exact address. */
  place: { kind: 'remote' } | { kind: 'local'; areaName: string };
  client: { displayName: string; initials: string; photo?: Photo };
  /** The helper's public card (their peek). */
  helper: HelperSummary;
  checkIn?: FollowedCheckIn;
  /** The conversation, read-only (absent until one exists). */
  threadId?: string;
  /** The booking is done: following ends on `endsAt` (7 days after). */
  endsAt?: ISODateTime;
  /**
   * Following has ended (the booking was canceled, or was done more than 7 days ago): the page says so, with the
   * booking's title and status only (no conversation, no check-in times).
   */
  ended?: true;
}

/** One booking the viewer follows, on their bookings list ("Bookings you follow"). No money. */
export interface FollowedBookingRow {
  id: string;
  title: string;
  categorySlug: CategorySlug;
  status: BookingStatus;
  start: ISODateTime;
  clientName: string;
  helper: { displayName: string; initials: string; photo?: Photo };
  place: FollowedBookingView['place'];
}

/**
 * - `onAdd`: ok `saved` (the panel refreshes). Errors: `validation_failed` (`who`), `not_found` (no such account),
 *   `not_allowed` (themself, the helper, blocked, not the booking's client), `limit_reached` (2 follow already),
 *   `expired` (the booking is over), `rate_limited` (10 tries in 10 minutes), `unknown`.
 * - `onRemove`: ok `updated`. Errors: `not_found` (not following any more), `not_allowed`, `unknown`.
 */
export interface FollowerHandlers {
  onAdd: ActionHandler<AddFollowerInput>;
  onRemove: ActionHandler<RemoveFollowerInput>;
}

/** A follower's "Stop following": ok `updated` (back to their bookings). Errors: `not_found`, `unknown`. */
export interface FollowingHandlers {
  onLeave: ActionHandler<{ bookingId: string }>;
}
