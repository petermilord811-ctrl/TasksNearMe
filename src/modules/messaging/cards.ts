import { and, eq, inArray, or } from 'drizzle-orm';
import { routes, type ChangeCard, type ChangeStatus, type ConversationCards, type InviteStatus, type PricingInput, type ProposableChangeType, type TaskRequestCard } from '@/contracts';
import { bookingChangeRequests, bookings } from '@/modules/bookings/schema';
import { invites } from '@/modules/invites/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import type { messages } from './schema';

/**
 * The cards a conversation's status lines show (2026-11-23, owner: "plan all and implement"), for one of its two people:
 * task requests (`invite_sent` lines, by invite id) in a direct conversation, and booking changes (`change_proposed`, by
 * change id) in a booking's. Each with its status now, so the card follows the request or the change as it goes. A line
 * whose record isn't the viewer's shows as the plain line it is.
 */

const pricingOf = (type: string | null, price: number | null, rate: number | null, estimated: number | null, cap: number | null): PricingInput =>
  type === 'hourly' ? { type: 'hourly', rateCents: rate ?? 0, estimatedHours: estimated ?? cap ?? 1, hoursCap: cap ?? 1 } : { type: 'fixed', priceCents: price ?? 0 };

type Row = Pick<typeof messages.$inferSelect, 'kind' | 'event'>;

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

export async function cardsFor(db: Db, viewerId: string, rows: readonly Row[], now: Date): Promise<ConversationCards | undefined> {
  const [requests, changes] = await Promise.all([requestCards(db, viewerId, idsOf(rows, 'invite_sent', 'inviteId'), now), changeCards(db, viewerId, idsOf(rows, 'change_proposed', 'changeId'), now)]);
  const cards: ConversationCards = {
    ...(Object.keys(requests).length ? { requests } : {}),
    ...(Object.keys(changes).length ? { changes } : {}),
  };
  return cards.requests || cards.changes ? cards : undefined;
}
