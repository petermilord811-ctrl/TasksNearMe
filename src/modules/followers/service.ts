import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ActionResult, AddFollowerInput, BookingStatus, FollowedBookingRow, FollowedBookingView, RemoveFollowerInput } from '@/contracts';
import { addFollowerInputSchema } from '@/contracts';
import { usernames, users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { clientSummary } from '@/modules/bookings/people';
import { marketTimeZone } from '@/modules/markets/time-zone';
import { threads } from '@/modules/messaging/schema';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { findTaskWithPublicView } from '@/modules/tasks/queries';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { countedFollowerIds, FOLLOWABLE_STATUSES, followedBookingIds, hasOpenFollow } from './access';
import { addBlockedReason, followEndsAt, followOpen, parseFollowerLookup } from './domain';
import { bookingFollowers } from './schema';

/**
 * Family followers (2026-11-24, src/contracts/followers.ts): the client adds and removes them, a follower leaves, and
 * the follower's own read-only projections of the booking. The helper always hears: each change is a status line in
 * the booking's conversation ("Maya added Lia to follow this booking").
 */

/** Ten tries in ten minutes: a lookup by email says whether an account exists, so it can't be run as a scan. */
export const ADD_FOLLOWER_RATE_LIMIT = { limit: 10, windowSeconds: 600 };

type BookingRow = typeof bookings.$inferSelect;

/** The account the client named, by email or @username, when it can follow. */
async function findAccount(db: Db, who: string) {
  const lookup = parseFollowerLookup(who);
  if (!lookup) return { invalid: true as const };
  const [row] =
    lookup.kind === 'email'
      ? await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(sql`lower(${users.email}) = ${lookup.email}`).limit(1)
      : await db
          .select({ id: users.id, name: users.name, status: users.status })
          .from(usernames)
          .innerJoin(users, eq(users.id, usernames.userId))
          .where(sql`lower(${usernames.username}) = ${lookup.username}`)
          .limit(1);
  return row && FOLLOWABLE_STATUSES.includes(row.status) ? { account: row } : { account: null };
}

async function recordEvent(db: Pick<Db, 'insert'>, type: string, booking: BookingRow, payload: Record<string, unknown>) {
  await db.insert(outboxEvents).values({ id: newId('evt'), type, aggregateType: 'booking', aggregateId: booking.id, payload: { bookingId: booking.id, posterUserId: booking.posterUserId, helperUserId: booking.helperUserId, ...payload } });
}

/** "Add a family member": the booking's client names an existing account. */
export async function addFollower(db: Db, clientId: string, input: AddFollowerInput, now: Date): Promise<ActionResult> {
  const parsed = addFollowerInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, parsed.data.bookingId)).limit(1);
  // Only its client; to anyone else the booking isn't there.
  if (!booking || booking.posterUserId !== clientId) return { ok: false, code: booking?.helperUserId === clientId ? 'not_allowed' : 'not_found' };
  const limited = await consumeRateLimit(db, `followers:add:${clientId}`, ADD_FOLLOWER_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const found = await findAccount(db, parsed.data.who);
  if ('invalid' in found) return { ok: false, code: 'validation_failed', fieldErrors: { who: ['invalid'] } };
  const person = found.account;
  if (!person) return { ok: false, code: 'not_found' };
  // Never the client themself or the helper, and never across a block (either way, with either of the two).
  if (person.id === booking.posterUserId || person.id === booking.helperUserId) return { ok: false, code: 'not_allowed' };
  if ((await isBlockedBetween(db, clientId, person.id)) || (await isBlockedBetween(db, booking.helperUserId, person.id))) return { ok: false, code: 'not_allowed' };

  return db.transaction(async (tx): Promise<ActionResult> => {
    // The booking row locked: two adds at once can't both be the second follower.
    const [locked] = await tx.select().from(bookings).where(eq(bookings.id, booking.id)).for('update');
    if (!locked) return { ok: false, code: 'not_found' };
    // Who follows now (a banned or blocked follower doesn't count, or hold a place: access.ts `followCounts`).
    const open = await countedFollowerIds(tx, locked.id);
    // Already following: nothing new (no second status line or notification).
    if (open.includes(person.id)) return { ok: true, code: 'saved' };
    const blocked = addBlockedReason(locked, open.length, now);
    if (blocked === 'limit') return { ok: false, code: 'limit_reached' };
    if (blocked === 'ended') return { ok: false, code: 'expired' };
    if (blocked) return { ok: false, code: 'not_allowed' };
    await tx.insert(bookingFollowers).values({ id: newId('bfl'), bookingId: locked.id, followerUserId: person.id, addedByUserId: clientId, createdAt: now });
    // The helper always sees it: a status line in the conversation, and the follower hears once.
    await postEvent(tx, bookingThreadLink(locked), 'status', { type: 'follower_added', params: { name: person.name } }, now, clientId);
    await recordEvent(tx, 'booking.follower_added', locked, { followerUserId: person.id, actorUserId: clientId });
    return { ok: true, code: 'saved' };
  });
}

/** The client removes a follower (`followerId`), or a follower stops following (none). */
export async function removeFollower(db: Db, userId: string, input: RemoveFollowerInput, now: Date): Promise<ActionResult> {
  const bookingId = String(input?.bookingId ?? '');
  const [booking] = bookingId ? await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1) : [];
  if (!booking) return { ok: false, code: 'not_found' };
  const followerId = input.followerId ? String(input.followerId) : null;
  if (followerId && booking.posterUserId !== userId) return { ok: false, code: booking.helperUserId === userId ? 'not_allowed' : 'not_found' };
  const who = followerId ?? userId;
  return db.transaction(async (tx): Promise<ActionResult> => {
    const ended = await tx
      .update(bookingFollowers)
      .set({ endedAt: now, endedBy: followerId ? 'client' : 'follower' })
      .where(and(eq(bookingFollowers.bookingId, booking.id), eq(bookingFollowers.followerUserId, who), isNull(bookingFollowers.endedAt)))
      .returning({ id: bookingFollowers.id });
    if (ended.length === 0) return { ok: false, code: 'not_found' };
    const [person] = await tx.select({ name: users.name }).from(users).where(eq(users.id, who)).limit(1);
    await postEvent(tx, bookingThreadLink(booking), 'status', { type: followerId ? 'follower_removed' : 'follower_left', params: { name: person?.name ?? '' } }, now, followerId ? userId : null);
    await recordEvent(tx, followerId ? 'booking.follower_removed' : 'booking.follower_left', booking, { followerUserId: who, actorUserId: userId });
    return { ok: true, code: 'updated' };
  });
}

const placeOf = (location: { kind: 'remote' } | { kind: 'local'; areaName: string }): FollowedBookingView['place'] => (location.kind === 'remote' ? { kind: 'remote' } : { kind: 'local', areaName: location.areaName });

/**
 * A booking the person follows, read-only, or null when they don't (its client and helper read the booking page; a
 * follower whose following ended reads only that it did). Built field by field: nothing of the booking's money, exact
 * address or actions is ever read here.
 */
export async function getFollowedBookingView(db: Db, userId: string, bookingId: string, now: Date): Promise<FollowedBookingView | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking || booking.posterUserId === userId || booking.helperUserId === userId) return null;
  if (booking.status === 'canceled' && booking.cancelReason === 'funding_failed') return null;
  if (!(await hasOpenFollow(db, userId, booking.id))) return null;
  const [found, helpers, client, timeZone, [thread]] = await Promise.all([
    findTaskWithPublicView(db, booking.taskId),
    getHelperSummaries([booking.helperUserId], db),
    clientSummary(db, booking.posterUserId),
    marketTimeZone(db, booking.marketId),
    db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, booking.id))).limit(1),
  ]);
  const helper = helpers.get(booking.helperUserId);
  if (!found || !helper || !client) return null;
  const open = followOpen(booking, now);
  const checkIn = {
    ...(booking.onMyWayAt ? { onMyWayAt: booking.onMyWayAt.toISOString() } : {}),
    ...(booking.arrivedAt ? { arrivedAt: booking.arrivedAt.toISOString() } : {}),
    ...(booking.status === 'completed' && booking.completedAt ? { completedAt: booking.completedAt.toISOString() } : {}),
    ...(booking.status === 'canceled' && booking.canceledAt ? { canceledAt: booking.canceledAt.toISOString() } : {}),
  };
  return {
    id: booking.id,
    task: { title: found.view.title, categorySlug: found.view.categorySlug },
    status: booking.status as BookingStatus,
    start: booking.startAt.toISOString(),
    timeZone,
    place: placeOf(found.view.location),
    client: { displayName: client.displayName, initials: client.initials, ...(client.photo ? { photo: client.photo } : {}) },
    helper,
    ...(open && Object.keys(checkIn).length ? { checkIn } : {}),
    ...(open && thread ? { threadId: thread.id } : {}),
    ...(open && booking.status === 'completed' && booking.completedAt ? { endsAt: followEndsAt(booking.completedAt).toISOString() } : {}),
    ...(open ? {} : { ended: true as const }),
  };
}

/** "Bookings you follow" on the person's bookings list: the ones following still runs for, soonest first. No money. */
export async function followedBookingRows(db: Db, userId: string, now: Date): Promise<FollowedBookingRow[]> {
  const ids = await followedBookingIds(db, userId);
  if (ids.length === 0) return [];
  const rows = (await db.select().from(bookings).where(inArray(bookings.id, ids))).filter((booking) => booking.posterUserId !== userId && booking.helperUserId !== userId && followOpen(booking, now));
  if (rows.length === 0) return [];
  const [helpers, clients, views] = await Promise.all([
    getHelperSummaries(rows.map((row) => row.helperUserId), db),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((row) => row.posterUserId))])),
    Promise.all([...new Set(rows.map((row) => row.taskId))].map((id) => findTaskWithPublicView(db, id))),
  ]);
  const clientName = new Map(clients.map((row) => [row.id, row.name]));
  const viewOf = new Map(views.flatMap((found) => (found ? [[found.view.id, found.view] as const] : [])));
  return rows
    .flatMap((booking): FollowedBookingRow[] => {
      const helper = helpers.get(booking.helperUserId);
      const view = viewOf.get(booking.taskId);
      const client = clientName.get(booking.posterUserId);
      if (!helper || !view || !client) return [];
      return [
        {
          id: booking.id,
          title: view.title,
          categorySlug: view.categorySlug,
          status: booking.status as BookingStatus,
          start: booking.startAt.toISOString(),
          clientName: client,
          helper: { displayName: helper.displayName, initials: helper.initials, ...(helper.photo ? { photo: helper.photo } : {}) },
          place: placeOf(view.location),
        },
      ];
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
