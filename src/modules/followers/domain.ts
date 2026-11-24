import { BOOKING_FOLLOWERS_MAX, FOLLOW_ENDS_DAYS_AFTER_DONE, USERNAME_PATTERN, type FollowAddBlockedReason, type NotificationType, type TimelineEvent, type TimelineEventType } from '@/contracts';

/**
 * Family followers (2026-11-24): the pure rules (src/contracts/followers.ts). A follower reads a booking and its
 * conversation and does nothing else. Who a viewer is on a booking is decided here, apart from the booking's own
 * roles: a follower is never its client or its helper, so no check meant for them can pass for a follower.
 */

const DAY = 86_400_000;

export interface FollowableBooking {
  status: string;
  cancelReason?: string | null;
  completedAt: Date | null;
  seriesId?: string | null;
}

/**
 * Following runs while the booking does: not once it's canceled (an unpaid hold that ran out never was a booking), and
 * not more than `FOLLOW_ENDS_DAYS_AFTER_DONE` days after it's done.
 */
export function followOpen(booking: FollowableBooking, now: Date): boolean {
  if (booking.status === 'canceled') return false;
  if (booking.status === 'completed') return booking.completedAt !== null && now.getTime() <= followEndsAt(booking.completedAt).getTime();
  return true;
}

/** When following a done booking ends. */
export const followEndsAt = (completedAt: Date) => new Date(completedAt.getTime() + FOLLOW_ENDS_DAYS_AFTER_DONE * DAY);

/** Why the client can't add a follower now, or null when they can (they're its client: checked by the caller). */
export function addBlockedReason(booking: FollowableBooking, openFollowers: number, now: Date): FollowAddBlockedReason | null {
  // Regular visits share one conversation for all their visits: not in this version.
  if (booking.seriesId) return 'series';
  if (!followOpen(booking, now)) return 'ended';
  if (openFollowers >= BOOKING_FOLLOWERS_MAX) return 'limit';
  return null;
}

/** Who the viewer is on a booking. `follower` only when they aren't one of its two people and follow it now. */
export type BookingAccess = 'client' | 'helper' | 'follower' | 'none';

export function bookingAccessOf(booking: { posterUserId: string; helperUserId: string } & FollowableBooking, viewerId: string, follows: boolean, now: Date): BookingAccess {
  if (booking.posterUserId === viewerId) return 'client';
  if (booking.helperUserId === viewerId) return 'helper';
  return follows && followOpen(booking, now) ? 'follower' : 'none';
}

/**
 * What each kind of viewer may do with a booking. A follower reads, and that's all: the page and the conversation are
 * built for them from their own projections (no address, no money, no actions), and nothing that writes accepts them.
 */
export interface BookingCapabilities {
  read: boolean;
  sendMessages: boolean;
  pay: boolean;
  change: boolean;
  cancel: boolean;
  review: boolean;
  seeExactAddress: boolean;
  seeMoney: boolean;
  manageFollowers: boolean;
}

export function bookingCapabilities(access: BookingAccess): BookingCapabilities {
  const none: BookingCapabilities = { read: false, sendMessages: false, pay: false, change: false, cancel: false, review: false, seeExactAddress: false, seeMoney: false, manageFollowers: false };
  switch (access) {
    case 'follower':
      return { ...none, read: true };
    case 'client':
      // What the booking's own rules (bookings/domain.ts) allow, at most: the address and money as they decide.
      return { read: true, sendMessages: true, pay: true, change: true, cancel: true, review: true, seeExactAddress: true, seeMoney: true, manageFollowers: true };
    case 'helper':
      return { read: true, sendMessages: true, pay: false, change: true, cancel: true, review: true, seeExactAddress: true, seeMoney: true, manageFollowers: false };
    default:
      return none;
  }
}

/**
 * The status lines a follower sees in the conversation: the booking's day-of moments and its followers, never one about
 * money (payments, tips, refunds, earnings), changes (their cards carry prices), reviews or a dispute.
 */
const FOLLOWER_EVENTS: ReadonlySet<TimelineEventType> = new Set<TimelineEventType>([
  'booked',
  'on_my_way',
  'running_late',
  'arrived',
  'cant_access',
  'client_present',
  'completion_submitted',
  'approved',
  'auto_approved',
  'canceled',
  'follower_added',
  'follower_removed',
  'follower_left',
]);

export const followerSeesEvent = (type: string): boolean => FOLLOWER_EVENTS.has(type as TimelineEventType);

/** A status line's details for a follower: only how late and a follower's name; never an amount or a card's id. */
export function followerEventParams(params: TimelineEvent['params'] | undefined): TimelineEvent['params'] | undefined {
  if (!params) return undefined;
  const kept = { ...(params.minutes !== undefined ? { minutes: params.minutes } : {}), ...(params.name ? { name: params.name } : {}) };
  return Object.keys(kept).length ? kept : undefined;
}

/** The follower's notification for a booking event, if they hear about it: on the way, arrived, done, canceled, a new time. */
export function followerNotificationFor(eventType: string, detail: { timeChanged?: boolean } = {}): NotificationType | null {
  switch (eventType) {
    case 'booking.on_my_way':
      return 'followed_on_the_way';
    case 'booking.arrived':
      return 'followed_arrived';
    case 'booking.completed':
      return 'followed_completed';
    case 'booking.canceled':
      return 'followed_canceled';
    case 'change.applied':
      return detail.timeChanged ? 'followed_time_changed' : null;
    default:
      return null;
  }
}

/**
 * What the client typed in "Add a family member": an email address (it has an @ inside), or a @username (with or
 * without its @). Lowercased: both are matched without case.
 */
export function parseFollowerLookup(who: string): { kind: 'email'; email: string } | { kind: 'username'; username: string } | null {
  const value = who.trim().toLowerCase();
  if (!value) return null;
  const at = value.indexOf('@');
  if (at > 0) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { kind: 'email', email: value } : null;
  const username = value.replace(/^@/, '');
  return USERNAME_PATTERN.test(username) ? { kind: 'username', username } : null;
}
