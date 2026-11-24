import { and, eq, inArray, sql } from 'drizzle-orm';
import { normalizeUsername, routes, teamInviteInputSchema, USERNAME_PATTERN, type ActionResult, type CategorySlug, type PricingInput, type TeamActionInput, type TeamKeepInput, type TeamInviteInput, type TeamStatus } from '@/contracts';
import { usernames, users } from '@/modules/accounts/schema';
import { pricingColumns, pricingColumnsForTask, pricingOf } from '@/modules/bookings/pricing-columns';
import { bookings } from '@/modules/bookings/schema';
import { categories } from '@/modules/markets/schema';
import { directPairKey } from '@/modules/messaging/direct-rules';
import { postInDirectThread } from '@/modules/messaging/direct';
import { threadParticipants, threads } from '@/modules/messaging/schema';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { loadHelperState } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { withCopySlug } from '@/modules/tasks/copy-slug';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { canInviteTeam, partnerRefusal, teamActions, teamInPlay, teamStatusNow } from './domain';
import { teamFactsOf } from './jobs';
import { bookingTeams } from './schema';

/**
 * Team up (2026-11-24; blueprint 03 "Team jobs"): the lead's invite, the partner's and the client's answers. The client's
 * yes makes the partner's part (a copy of the lead's task with the same time and place, for the partner's own booking)
 * and the partner's offer on it, then opens the normal confirm dialog: the booking, its payment (in the lead's mode) and
 * everything after it are the existing flow's, untouched.
 */

/** A lead's invites: a person's pace, not a script's. */
export const TEAM_INVITE_RULE = { limit: 10, windowSeconds: 3600 };

type TeamRow = typeof bookingTeams.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

class TeamTaken extends Error {}

export const teamPricingOf = (team: TeamRow): PricingInput => pricingOf(team);

/** The lead's booking with its task's category and team mark. */
async function leadBookingOf(db: Db | Tx, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, categorySlug: categories.slug, teamPartOf: tasks.teamPartOf, title: tasks.title })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ? { ...row, categorySlug: row.categorySlug as CategorySlug } : null;
}

/** Whether the lead's booking already has a team in play (an invite waiting, or a partner booked or bookable). */
async function inPlayFor(db: Db | Tx, lead: BookingRow, now: Date): Promise<boolean> {
  const rows = await db.select().from(bookingTeams).where(and(eq(bookingTeams.leadBookingId, lead.id), inArray(bookingTeams.status, ['invited', 'accepted', 'confirmed'])));
  for (const team of rows) {
    if (teamInPlay((await teamFactsOf(db, team, lead)).facts, now)) return true;
  }
  return false;
}

/** The lead may invite now (the booking page's "Team up"). */
export async function canInviteFor(db: Db, lead: BookingRow, teamPartOf: string | null, now: Date): Promise<boolean> {
  if (!canInviteTeam({ status: lead.status, startAt: lead.startAt, seriesId: lead.seriesId, teamPartOf }, false, now)) return false;
  return !(await inPlayFor(db, lead, now));
}

async function userIdByUsername(db: Db, typed: string): Promise<string | null> {
  const name = normalizeUsername(typed);
  if (!USERNAME_PATTERN.test(name)) return null;
  const [row] = await db
    .select({ userId: usernames.userId })
    .from(usernames)
    .innerJoin(users, eq(users.id, usernames.userId))
    .where(and(sql`lower(${usernames.username}) = ${name}`, eq(users.status, 'active')))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * The lead and partner's own conversation: their direct one, made for the team when they have none (already accepted
 * on both sides, so it isn't a message request and counts against nobody's allowance).
 */
async function teamThread(tx: Tx, leadId: string, partnerId: string, now: Date): Promise<string> {
  const linkedId = directPairKey(leadId, partnerId);
  await tx.insert(threads).values({ id: newId('thr'), kind: 'direct', linkedId, taskId: null, startedByUserId: null, createdAt: now, lastMessageAt: now }).onConflictDoNothing({ target: [threads.kind, threads.linkedId] });
  const [thread] = await tx.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.linkedId, linkedId))).limit(1);
  if (!thread) throw new Error('Team thread missing after insert');
  for (const userId of [leadId, partnerId]) {
    await tx.insert(threadParticipants).values({ threadId: thread.id, userId, acceptedAt: now }).onConflictDoNothing();
  }
  return thread.id;
}

/**
 * **Team up**: the lead of a confirmed booking invites one partner by @username, with a price for the partner's part.
 * The invite shows as a card in the two helpers' conversation; the partner answers there.
 */
export async function inviteTeamPartner(db: Db, leadId: string, bookingId: string, input: TeamInviteInput, now: Date): Promise<ActionResult> {
  const parsed = teamInviteInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const row = await leadBookingOf(db, String(bookingId));
  if (!row || row.booking.helperUserId !== leadId) return { ok: false, code: 'not_allowed' };
  const lead = row.booking;
  if (!canInviteTeam({ status: lead.status, startAt: lead.startAt, seriesId: lead.seriesId, teamPartOf: row.teamPartOf }, false, now)) return { ok: false, code: 'not_allowed' };
  const partnerId = await userIdByUsername(db, parsed.data.username);
  if (!partnerId) return { ok: false, code: 'validation_failed', fieldErrors: { username: ['invalid'] } };
  const state = partnerId === leadId || partnerId === lead.posterUserId ? null : await loadHelperState(db, partnerId, now);
  const blocked = (await isBlockedBetween(db, leadId, partnerId)) || (await isBlockedBetween(db, partnerId, lead.posterUserId));
  const refusal = partnerRefusal({
    partnerId,
    leadId,
    clientId: lead.posterUserId,
    bookable: Boolean(state && state.marketId === lead.marketId && state.facts.bookableCategories.includes(row.categorySlug)),
    blocked,
  });
  if (refusal === 'self') return { ok: false, code: 'validation_failed', fieldErrors: { username: ['prohibited'] } };
  if (refusal === 'not_bookable') return { ok: false, code: 'validation_failed', fieldErrors: { username: ['invalid'] } };
  if (refusal === 'blocked') return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `team-invite:${leadId}`, TEAM_INVITE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  const teamId = newId('tem');
  try {
    await db.transaction(async (tx) => {
      // The lead's booking, locked: two invites at once can't both find the place free.
      await tx.execute(sql`select id from bookings where id = ${lead.id} for update`);
      const [fresh] = await tx.select().from(bookings).where(eq(bookings.id, lead.id)).limit(1);
      if (!fresh || !canInviteTeam({ status: fresh.status, startAt: fresh.startAt, seriesId: fresh.seriesId, teamPartOf: row.teamPartOf }, false, now)) throw new TeamTaken();
      if (await inPlayFor(tx, fresh, now)) throw new TeamTaken();
      const threadId = await teamThread(tx, leadId, partnerId, now);
      const note = parsed.data.note?.trim();
      await tx.insert(bookingTeams).values({
        id: teamId,
        leadBookingId: lead.id,
        taskId: lead.taskId,
        clientUserId: lead.posterUserId,
        leadUserId: leadId,
        partnerUserId: partnerId,
        status: 'invited',
        ...pricingColumns(parsed.data.pricing as PricingInput),
        note: note || null,
        teamThreadId: threadId,
        createdAt: now,
        updatedAt: now,
      });
      await postInDirectThread(tx, leadId, partnerId, { type: 'team_invited', params: { teamId } }, now, leadId);
    });
  } catch (error) {
    if (error instanceof TeamTaken || isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  return { ok: true, code: 'sent' };
}

/** Moves the invite from one of `from` to `to` (a lost race reads as not allowed). */
async function move(db: Db | Tx, teamId: string, from: TeamStatus[], to: TeamStatus, now: Date, extra: Partial<typeof bookingTeams.$inferInsert> = {}): Promise<boolean> {
  const closing = ['declined', 'withdrawn', 'canceled', 'refused', 'expired'].includes(to);
  const moved = await db
    .update(bookingTeams)
    .set({ status: to, updatedAt: now, ...(closing ? { closedAt: now } : {}), ...extra })
    .where(and(eq(bookingTeams.id, teamId), inArray(bookingTeams.status, from)))
    .returning({ id: bookingTeams.id });
  return moved.length > 0;
}

/**
 * The partner's part: a copy of the lead's task with the same title, details, time and place (its `location_id`, so the
 * exact address follows the normal rules for the partner's own booking), priced at the partner's part, marked as the
 * team's (`team_part_of`: never on the board, never reopened); and the partner's offer on it in the lead's payment mode.
 */
async function makePartnerPart(tx: Tx, team: TeamRow, lead: BookingRow, now: Date): Promise<{ taskId: string; offerId: string }> {
  const [template] = await tx.select().from(tasks).where(eq(tasks.id, lead.taskId)).limit(1);
  if (!template) throw new TeamTaken();
  const pricing = pricingOf(team);
  const { id: _id, slug: _slug, createdAt: _created, updatedAt: _updated, publishedAt: _published, expiresAt: _expires, aiGenerationId: _ai, reopenedAt: _reopened, hiddenAt: _hidden, hiddenByUserId: _hiddenBy, hiddenReason: _hiddenWhy, requestKey: _key, searchText: _search, ...copy } = template;
  const taskId = newId('tsk');
  await withCopySlug(template.slug, (slug) =>
    tx.transaction((savepoint) =>
      savepoint.insert(tasks).values({
        ...copy,
        id: taskId,
        slug,
        status: 'open',
        teamPartOf: lead.id,
        ...pricingColumnsForTask(pricing),
        // The partner's part carries no expense allowance: that's the lead's booking's.
        expenseAllowanceCents: 0,
        expenseAllowanceNote: null,
        offerCount: 1,
        version: 1,
        publishedAt: now,
        expiresAt: lead.startAt,
        createdAt: now,
        updatedAt: now,
      }),
    ),
  );
  const offerId = newId('off');
  await tx.insert(offers).values({
    id: offerId,
    taskId,
    helperUserId: team.partnerUserId,
    status: 'pending',
    ...pricingColumns(pricing),
    proposedStart: lead.startAt,
    message: team.note ?? '',
    paymentMode: lead.paymentMode,
    expiresAt: lead.startAt,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  return { taskId, offerId };
}

/** The part was never booked: the offer and the part end (a booking on its way keeps both). Takes the part's lock. */
async function closePartnerPart(tx: Tx, team: TeamRow, now: Date): Promise<boolean> {
  if (!team.partnerTaskId) return true;
  await tx.execute(sql`select id from tasks where id = ${team.partnerTaskId} for update`);
  const [live] = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.taskId, team.partnerTaskId), sql`${bookings.status} <> 'canceled'`)).limit(1);
  if (live) return false;
  await tx.update(tasks).set({ status: 'canceled', offerCount: 0, updatedAt: now }).where(eq(tasks.id, team.partnerTaskId));
  if (team.partnerOfferId) await tx.update(offers).set({ status: 'withdrawn', closedAt: now, updatedAt: now }).where(and(eq(offers.id, team.partnerOfferId), eq(offers.status, 'pending')));
  return true;
}

/**
 * Ends a team from one of `from` under its row's lock, reading its status there (sweep B8: a status read before the
 * transaction could be stale, and a part confirmed meanwhile stayed bookable). A confirmed part never booked ends with
 * it (its task and offer); one booked meanwhile keeps the team as it is. Locks the team, then the part: confirming a
 * booking takes only the part's lock and reads the team, so the two never wait on each other in a circle.
 */
async function closeTeam(db: Db, teamId: string, from: TeamStatus[], to: TeamStatus, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(bookingTeams).where(eq(bookingTeams.id, teamId)).limit(1).for('update');
    const status = fresh?.status as TeamStatus | undefined;
    if (!fresh || !status || !from.includes(status)) return false;
    if (status === 'confirmed' && !(await closePartnerPart(tx, fresh, now))) return false;
    return move(tx, fresh.id, [status], to, now);
  });
}

const bookPart = (team: TeamRow): ActionResult =>
  team.partnerTaskId && team.partnerOfferId ? { ok: true, code: 'opened', redirectTo: routes.app.confirmOffer(team.partnerTaskId, team.partnerOfferId) } : { ok: false, code: 'not_allowed' };

/** An answer on a team invite, by the partner, the lead or the client: only what `teamActions` offers them now. */
export async function runTeamAction(db: Db, userId: string, input: TeamActionInput, now: Date): Promise<ActionResult> {
  const [team] = await db.select().from(bookingTeams).where(eq(bookingTeams.id, String(input?.teamId ?? ''))).limit(1);
  if (!team) return { ok: false, code: 'not_found' };
  const role = userId === team.clientUserId ? 'client' : userId === team.leadUserId ? 'lead' : userId === team.partnerUserId ? 'partner' : null;
  if (!role) return { ok: false, code: 'not_found' };
  const [lead] = await db.select().from(bookings).where(eq(bookings.id, team.leadBookingId)).limit(1);
  if (!lead) return { ok: false, code: 'not_found' };
  const { facts } = await teamFactsOf(db, team, lead);
  const action = input?.action;
  const actions = teamActions(facts, role, now);
  // Confirm again on a card read before the first yes (the checkout closed, the page not read again): the same
  // checkout, never "not allowed" (sweep B7).
  if (action === 'confirm' && !actions.includes('confirm') && actions.includes('book')) return bookPart(team);
  if (!actions.includes(action)) return { ok: false, code: teamStatusNow(facts, now) === 'expired' ? 'expired' : 'not_allowed' };

  switch (action) {
    case 'accept': {
      if (!(await move(db, team.id, ['invited'], 'accepted', now, { answeredAt: now }))) return { ok: false, code: 'not_allowed' };
      // The client hears it in the lead's booking conversation, as the card they confirm.
      await postEvent(db, bookingThreadLink(lead), 'status', { type: 'team_proposed', params: { teamId: team.id } }, now, null);
      return { ok: true, code: 'updated' };
    }
    case 'decline':
      return (await move(db, team.id, ['invited'], 'declined', now, { answeredAt: now })) ? { ok: true, code: 'updated' } : { ok: false, code: 'not_allowed' };
    case 'cancel':
      return (await closeTeam(db, team.id, ['invited', 'accepted', 'confirmed'], 'canceled', now)) ? { ok: true, code: 'canceled' } : { ok: false, code: 'not_allowed' };
    case 'refuse':
      return (await closeTeam(db, team.id, ['accepted', 'confirmed'], 'refused', now)) ? { ok: true, code: 'updated' } : { ok: false, code: 'not_allowed' };
    case 'withdraw':
      return (await closeTeam(db, team.id, ['accepted', 'confirmed'], 'withdrawn', now)) ? { ok: true, code: 'updated' } : { ok: false, code: 'not_allowed' };
    case 'book':
      return bookPart(team);
    case 'confirm':
      return confirmTeam(db, team, lead, now);
  }
}

/**
 * The client's yes: the partner must still be bookable and unblocked; then the partner's part and offer are made and
 * the normal confirm dialog opens on it (book, and pay when it's held). Tapping again opens the same one.
 */
async function confirmTeam(db: Db, team: TeamRow, lead: BookingRow, now: Date): Promise<ActionResult> {
  const leadRow = await leadBookingOf(db, lead.id);
  if (!leadRow) return { ok: false, code: 'not_found' };
  const state = await loadHelperState(db, team.partnerUserId, now);
  const bookable = state.marketId === lead.marketId && state.facts.bookableCategories.includes(leadRow.categorySlug);
  const blocked = (await isBlockedBetween(db, team.clientUserId, team.partnerUserId)) || (await isBlockedBetween(db, team.leadUserId, team.partnerUserId));
  if (!bookable || blocked) return { ok: false, code: 'not_allowed' };
  let part: { taskId: string; offerId: string };
  try {
    part = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from booking_teams where id = ${team.id} for update`);
      const [fresh] = await tx.select().from(bookingTeams).where(eq(bookingTeams.id, team.id)).limit(1);
      if (fresh?.status !== 'accepted') throw new TeamTaken();
      const made = await makePartnerPart(tx, fresh, lead, now);
      await move(tx, team.id, ['accepted'], 'confirmed', now, { partnerTaskId: made.taskId, partnerOfferId: made.offerId, confirmedAt: now });
      return made;
    });
  } catch (error) {
    if (error instanceof TeamTaken || isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  return { ok: true, code: 'opened', redirectTo: routes.app.confirmOffer(part.taskId, part.offerId) };
}

/** The client keeps the partner after the lead's booking was canceled (their booking goes on as it is). */
export async function keepPartner(db: Db, clientId: string, input: TeamKeepInput, now: Date): Promise<ActionResult> {
  const kept = await db
    .update(bookingTeams)
    .set({ clientKeptAt: now, updatedAt: now })
    .where(and(eq(bookingTeams.id, String(input?.teamId ?? '')), eq(bookingTeams.clientUserId, clientId), eq(bookingTeams.status, 'confirmed')))
    .returning({ id: bookingTeams.id });
  return kept.length ? { ok: true, code: 'updated' } : { ok: false, code: 'not_allowed' };
}
