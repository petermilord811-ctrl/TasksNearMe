import { and, eq, inArray, or } from 'drizzle-orm';
import { routes, SHARE_TIMES_MAX, type CategorySlug, type ChangeCard, type ChangeStatus, type ConversationCards, type InviteStatus, type OfferAskCard, type PricingInput, type ProposableChangeType, type SharedSlot, type SharedTimesCard, type TaskRequestCard, type TimeZone } from '@/contracts';
import { availabilityPosts } from '@/modules/availability/schema';
import { slotViewOf } from '@/modules/availability/slots';
import { bookingChangeRequests, bookings } from '@/modules/bookings/schema';
import { invites } from '@/modules/invites/schema';
import { categories, markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { thanksCardsFor } from '@/modules/thanks/views';
import type { messages } from './schema';

/**
 * The cards a conversation's status lines show (2026-11-23, owner: "plan all and implement"), for one of its two people:
 * task requests (`invite_sent` lines, by invite id) in a direct conversation, and booking changes (`change_proposed`, by
 * change id) in a booking's. Each with its status now, so the card follows the request or the change as it goes. A line
 * whose record isn't the viewer's shows as the plain line it is.
 */

const pricingOf = (type: string | null, price: number | null, rate: number | null, estimated: number | null, cap: number | null): PricingInput =>
  type === 'hourly' ? { type: 'hourly', rateCents: rate ?? 0, estimatedHours: estimated ?? cap ?? 1, hoursCap: cap ?? 1 } : { type: 'fixed', priceCents: price ?? 0 };

type Row = Pick<typeof messages.$inferSelect, 'id' | 'kind' | 'event'>;

function idsOf(rows: readonly Row[], type: 'invite_sent' | 'change_proposed', key: 'inviteId' | 'changeId'): string[] {
  return [...new Set(rows.flatMap((row) => (row.kind !== 'text' && row.event?.type === type && typeof row.event.params?.[key] === 'string' ? [row.event.params[key]] : [])))];
}

async function requestCards(db: Db, viewerId: string, ids: string[], now: Date): Promise<Record<string, TaskRequestCard>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ invite: invites, title: tasks.title })
    .from(invites)
    .innerJoin(tasks, eq(tasks.id, invites.taskId))
    .where(and(inArray(invites.id, ids), or(eq(invites.posterUserId, viewerId), eq(invites.helperUserId, viewerId))));
  const out: Record<string, TaskRequestCard> = {};
  for (const { invite, title } of rows) {
    const viewerRole = invite.posterUserId === viewerId ? 'poster' : 'helper';
    // A request still waiting past its time reads as expired, whether or not the job runner has marked it yet.
    const lapsed = (invite.status === 'sent' || invite.status === 'countered') && invite.expiresAt !== null && invite.expiresAt <= now;
    const status = (lapsed ? 'expired' : invite.status) as InviteStatus;
    const countered = status === 'countered' && invite.counterPricingType !== null;
    out[invite.id] = {
      inviteId: invite.id,
      title,
      start: (countered && invite.counterStartAt ? invite.counterStartAt : invite.startAt).toISOString(),
      pricing: countered
        ? pricingOf(invite.counterPricingType, invite.counterPriceCents, invite.counterHourlyRateCents, invite.counterEstimatedHours, invite.counterHoursCap)
        : pricingOf(invite.pricingType, invite.priceCents, invite.hourlyRateCents, invite.estimatedHours, invite.hoursCap),
      status,
      viewerRole,
      actions: viewerRole === 'helper' ? (status === 'sent' ? ['accept', 'decline'] : []) : status === 'sent' || status === 'countered' ? ['cancel'] : [],
      href: viewerRole === 'poster' ? routes.app.task(invite.taskId) : routes.app.offers(invite.id),
      ...(invite.bookingId ? { bookingId: invite.bookingId } : {}),
      ...((status === 'sent' || status === 'countered') && invite.expiresAt ? { expiresAt: invite.expiresAt.toISOString() } : {}),
    };
  }
  return out;
}

async function changeCards(db: Db, viewerId: string, ids: string[], now: Date): Promise<Record<string, ChangeCard>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ change: bookingChangeRequests })
    .from(bookingChangeRequests)
    .innerJoin(bookings, eq(bookings.id, bookingChangeRequests.bookingId))
    .where(and(inArray(bookingChangeRequests.id, ids), or(eq(bookings.posterUserId, viewerId), eq(bookings.helperUserId, viewerId))));
  const out: Record<string, ChangeCard> = {};
  for (const { change } of rows) {
    const open = change.status === 'proposed' || change.status === 'accepted_pending_funding';
    const lapsed = open && change.expiresAt !== null && change.expiresAt <= now;
    const types = change.types as ProposableChangeType[];
    out[change.id] = {
      bookingId: change.bookingId,
      changeId: change.id,
      status: (lapsed ? 'expired' : change.status) as ChangeStatus,
      fromViewer: change.proposedByUserId === viewerId,
      types,
      ...(types.includes('schedule') ? { startAt: change.startAt.toISOString() } : {}),
      differenceCents: change.differenceCents,
      ...(open && !lapsed && change.expiresAt ? { expiresAt: change.expiresAt.toISOString() } : {}),
    };
  }
  return out;
}

/**
 * "Asked for an offer" lines (2026-11-23), by message id: the task as it stands, and whether the helper has offered on it.
 * Only between the conversation's two people (`otherId`): the task is one of theirs, the helper the other.
 */
async function offerAskCards(db: Db, viewerId: string, otherId: string | undefined, rows: readonly Row[], now: Date): Promise<Record<string, OfferAskCard>> {
  const asks = rows.flatMap((row) => (row.kind !== 'text' && row.event?.type === 'offer_requested' && typeof row.event.params?.taskId === 'string' ? [{ id: row.id, taskId: row.event.params.taskId }] : []));
  if (asks.length === 0 || !otherId) return {};
  const taskIds = [...new Set(asks.map((ask) => ask.taskId))];
  const taskRows = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, expiresAt: tasks.expiresAt, posterUserId: tasks.posterUserId })
    .from(tasks)
    .where(and(inArray(tasks.id, taskIds), or(eq(tasks.posterUserId, viewerId), eq(tasks.posterUserId, otherId))));
  const byId = new Map(taskRows.map((task) => [task.id, task]));
  const helperOf = (posterId: string) => (posterId === viewerId ? otherId : viewerId);
  const offered = new Set(
    (await db
      .select({ taskId: offers.taskId, helperUserId: offers.helperUserId })
      .from(offers)
      .where(and(inArray(offers.taskId, taskIds), inArray(offers.helperUserId, [viewerId, otherId]), inArray(offers.status, ['pending', 'stale', 'accepted']))))
      .map((row) => `${row.taskId}:${row.helperUserId}`),
  );
  const out: Record<string, OfferAskCard> = {};
  for (const ask of asks) {
    const task = byId.get(ask.taskId);
    if (!task) continue;
    const viewerRole = task.posterUserId === viewerId ? 'poster' : 'helper';
    const hasOffer = offered.has(`${task.id}:${helperOf(task.posterUserId)}`);
    out[ask.id] = {
      taskId: task.id,
      title: task.title,
      open: task.status === 'open' && (task.expiresAt === null || task.expiresAt > now),
      viewerRole,
      offered: hasOffer,
      href: viewerRole === 'poster' ? routes.app.task(task.id) : hasOffer ? routes.app.findWorkTask(task.id) : routes.app.findWorkOffer(task.id),
    };
  }
  return out;
}

/** Where a shared slot stands now: someone requested or booked it, it started or expired, or the helper took it down. */
function slotState(row: typeof availabilityPosts.$inferSelect, now: Date): SharedSlot['state'] {
  if (row.status === 'canceled') return 'withdrawn';
  if (row.status === 'held' || row.status === 'booked') return 'taken';
  return row.status === 'expired' || row.startAt <= now ? 'past' : 'open';
}

/**
 * "Shared open times" lines (2026-11-24), by message id: the helper's slots as they stand now. Only a helper in the
 * conversation (`otherId` or the viewer), and only that helper's slots.
 */
async function sharedTimesCards(db: Db, viewerId: string, otherId: string | undefined, rows: readonly Row[], now: Date): Promise<Record<string, SharedTimesCard>> {
  const shares = rows.flatMap((row) => {
    const slotIds = row.kind !== 'text' && row.event?.type === 'times_shared' ? row.event.params?.slotIds : undefined;
    return Array.isArray(slotIds) ? [{ id: row.id, slotIds: slotIds.filter((id): id is string => typeof id === 'string').slice(0, SHARE_TIMES_MAX) }] : [];
  });
  if (shares.length === 0 || !otherId) return {};
  const found = await db
    .select({ row: availabilityPosts, slug: categories.slug, timeZone: markets.timeZone, handle: helperProfiles.handle })
    .from(availabilityPosts)
    .innerJoin(categories, eq(categories.id, availabilityPosts.categoryId))
    .innerJoin(markets, eq(markets.id, availabilityPosts.marketId))
    .innerJoin(helperProfiles, eq(helperProfiles.userId, availabilityPosts.helperUserId))
    .where(and(inArray(availabilityPosts.id, [...new Set(shares.flatMap((share) => share.slotIds))]), inArray(availabilityPosts.helperUserId, [viewerId, otherId])));
  const byId = new Map(found.map((slot) => [slot.row.id, slot]));
  const out: Record<string, SharedTimesCard> = {};
  for (const share of shares) {
    const slots = share.slotIds.flatMap((id) => byId.get(id) ?? []);
    const first = slots[0];
    if (!first) continue;
    out[share.id] = {
      viewerRole: first.row.helperUserId === viewerId ? 'helper' : 'client',
      helperHandle: first.handle,
      timeZone: first.timeZone as TimeZone,
      slots: slots.filter((slot) => slot.row.helperUserId === first.row.helperUserId).map(({ row, slug }) => ({ ...slotViewOf(row, slug as CategorySlug), state: slotState(row, now) })),
    };
  }
  return out;
}

export async function cardsFor(db: Db, viewerId: string, rows: readonly Row[], now: Date, otherId?: string): Promise<ConversationCards | undefined> {
  const noteIds = [...new Set(rows.flatMap((row) => (row.kind !== 'text' && row.event?.type === 'thanks_sent' && typeof row.event.params?.noteId === 'string' ? [row.event.params.noteId] : [])))];
  const [requests, changes, offerAsks, sharedTimes, thanks] = await Promise.all([
    requestCards(db, viewerId, idsOf(rows, 'invite_sent', 'inviteId'), now),
    changeCards(db, viewerId, idsOf(rows, 'change_proposed', 'changeId'), now),
    offerAskCards(db, viewerId, otherId, rows, now),
    sharedTimesCards(db, viewerId, otherId, rows, now),
    // Thank-you notes (2026-11-24): the note as it is now; a deleted one's line shows as the plain line.
    thanksCardsFor(db, viewerId, noteIds, now),
  ]);
  const cards: ConversationCards = {
    ...(Object.keys(requests).length ? { requests } : {}),
    ...(Object.keys(changes).length ? { changes } : {}),
    ...(Object.keys(offerAsks).length ? { offerAsks } : {}),
    ...(Object.keys(sharedTimes).length ? { sharedTimes } : {}),
    ...(Object.keys(thanks).length ? { thanks } : {}),
  };
  return cards.requests || cards.changes || cards.offerAsks || cards.sharedTimes || cards.thanks ? cards : undefined;
}
