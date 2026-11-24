import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { BookingFamilyView, FollowerPerson } from '@/contracts';
import { BOOKING_FOLLOWERS_MAX } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import { blocks } from '@/modules/messaging/schema';
import type { Db } from '@/platform/db/connect';
import { addBlockedReason, bookingAccessOf, followOpen, type BookingAccess, type FollowableBooking } from './domain';
import { bookingFollowers } from './schema';

/**
 * Who follows which booking (2026-11-24), read for the pages and the conversations. Only reads: no import of the
 * messaging module, which asks here whether a non-participant follows a booking's conversation.
 */

type BookingLike = { id: string; posterUserId: string; helperUserId: string } & FollowableBooking;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Accounts that can follow: not deleted, banned or suspended. */
export const FOLLOWABLE_STATUSES = ['active', 'restricted'];

/**
 * A follow row counts only while its follower's account can follow, and no block stands between the follower and the
 * booking's client or helper, either way (sweep 2026-11-24, B6/A11). Every read below that grants a follower anything
 * uses it: the conversation and its photos, the page, the list, the notices and the live updates stop at once. The row
 * stays (an unblock, or a lifted suspension, brings it back). Needs `users` and `bookings` joined to the follow rows.
 */
const notBlocked = sql`not exists (select 1 from ${blocks} where (${blocks.blockerId} = ${bookingFollowers.followerUserId} and ${blocks.blockedId} in (${bookings.posterUserId}, ${bookings.helperUserId})) or (${blocks.blockedId} = ${bookingFollowers.followerUserId} and ${blocks.blockerId} in (${bookings.posterUserId}, ${bookings.helperUserId})))`;
const followCounts = and(inArray(users.status, FOLLOWABLE_STATUSES), notBlocked) as SQL;

/** The open follow rows that count (`followCounts`), with their follower and booking joined. */
function countedFollows(db: Db | Tx, where: SQL | undefined) {
  return db
    .select({ bookingId: bookingFollowers.bookingId, since: bookingFollowers.createdAt, user: users })
    .from(bookingFollowers)
    .innerJoin(users, eq(users.id, bookingFollowers.followerUserId))
    .innerJoin(bookings, eq(bookings.id, bookingFollowers.bookingId))
    .where(and(where, isNull(bookingFollowers.endedAt), followCounts));
}

/** The people who follow each booking now (open rows that count: `followCounts`), oldest first. */
export async function openFollowersOf(db: Db, bookingIds: readonly string[]): Promise<Map<string, FollowerPerson[]>> {
  const out = new Map<string, FollowerPerson[]>();
  if (bookingIds.length === 0) return out;
  const rows = await countedFollows(db, inArray(bookingFollowers.bookingId, [...bookingIds])).orderBy(asc(bookingFollowers.createdAt));
  for (const row of rows) {
    const person: FollowerPerson = {
      id: row.user.id,
      displayName: row.user.name,
      initials: `${row.user.firstName.trim().charAt(0)}${row.user.lastName.trim().charAt(0)}`.toUpperCase(),
      ...profilePhotoOf(row.user),
      since: row.since.toISOString(),
    };
    out.set(row.bookingId, [...(out.get(row.bookingId) ?? []), person]);
  }
  return out;
}

/** Whether the person follows the booking now (an open row that counts: `followCounts`; the booking's own state aside). */
export async function hasOpenFollow(db: Db, userId: string, bookingId: string): Promise<boolean> {
  const [row] = await countedFollows(db, and(eq(bookingFollowers.bookingId, bookingId), eq(bookingFollowers.followerUserId, userId))).limit(1);
  return Boolean(row);
}

/** Who follows the booking now, for the add's limit under the booking's lock (`followCounts`). */
export async function countedFollowerIds(tx: Db | Tx, bookingId: string): Promise<string[]> {
  return (await countedFollows(tx, eq(bookingFollowers.bookingId, bookingId))).map((row) => row.user.id);
}

/** Who the viewer is on a booking: its client, its helper, a follower now, or nobody (followers/domain.ts). */
export async function bookingAccess(db: Db, booking: BookingLike, viewerId: string, now: Date): Promise<BookingAccess> {
  if (booking.posterUserId === viewerId || booking.helperUserId === viewerId) return bookingAccessOf(booking, viewerId, false, now);
  return bookingAccessOf(booking, viewerId, await hasOpenFollow(db, viewerId, booking.id), now);
}

/** The bookings the person follows (open rows that count), newest first; their bookings' state decides what still shows. */
export async function followedBookingIds(db: Db, userId: string): Promise<string[]> {
  const rows = await countedFollows(db, eq(bookingFollowers.followerUserId, userId));
  return rows.map((row) => row.bookingId);
}

/**
 * Family followers on a booking's page or conversation for one of its two people: the client's panel and who follows;
 * the helper sees who follows (display names, never contact details) and nothing to manage. Undefined when there's
 * nothing to show (the helper of a booking nobody follows; anyone else).
 */
export async function familyViewFor(db: Db, booking: BookingLike, viewerId: string, now: Date): Promise<BookingFamilyView | undefined> {
  const role = booking.posterUserId === viewerId ? 'client' : booking.helperUserId === viewerId ? 'helper' : null;
  if (!role) return undefined;
  const followers = followOpen(booking, now) ? ((await openFollowersOf(db, [booking.id])).get(booking.id) ?? []) : [];
  const [client] = followers.length ? await db.select({ name: users.name }).from(users).where(eq(users.id, booking.posterUserId)).limit(1) : [];
  const followedBy = followers.length && client ? { clientName: client.name, names: followers.map((person) => person.displayName) } : undefined;
  if (role === 'helper') return followedBy ? { followedBy } : undefined;
  const blocked = addBlockedReason(booking, followers.length, now);
  // Regular visits aren't followed in this version, and a booking that's over takes no one new: nothing to offer.
  if (blocked === 'series' || blocked === 'ended') return undefined;
  return {
    manage: { bookingId: booking.id, followers, max: BOOKING_FOLLOWERS_MAX, canAdd: blocked === null, ...(blocked ? { addBlockedReason: blocked } : {}) },
    ...(followedBy ? { followedBy } : {}),
  };
}

/** The people who follow a booking now, for its notifications (on the way, arrived, done, canceled, a new time). */
export async function followerIdsOf(db: Db, bookingId: string): Promise<string[]> {
  return ((await openFollowersOf(db, [bookingId])).get(bookingId) ?? []).map((person) => person.id);
}
