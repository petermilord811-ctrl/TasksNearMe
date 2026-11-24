import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { usernames, users } from '@/modules/accounts/schema';
import { acceptChange, getProposeChangePage, proposeChange } from '@/modules/bookings/changes';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingsPage, getBookingView } from '@/modules/bookings/hub';
import { bookingChangeRequests, bookingTerms, bookings } from '@/modules/bookings/schema';
import { cancelBookingBy } from '@/modules/bookings/sheets';
import { directStartFor } from '@/modules/messaging/direct';
import { blocks, messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { bookingThreadLink, ensureThread, getThreadPage } from '@/modules/messaging/service';
import { planNotifications } from '@/modules/notifications/service';
import { getMyOffers, helperOfferAction, reviseOffer } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { payments } from '@/modules/payments/schema';
import { openIn } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { bookingTeams } from '@/modules/teams/schema';
import { reactToTeamEvent } from '@/modules/teams/reactions';
import { canInviteFor, inviteTeamPartner, keepPartner, runTeamAction } from '@/modules/teams/service';
import { outboxEvents } from '@/platform/outbox/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Team up, 2026-11-24 (owner's chat ideas: "implement others all one by one"): Chris books Jordan for a copy of the
 * seeded desk; Jordan brings Sam. Who may invite whom, the price, the team conversation, the client's confirm making an
 * ordinary second booking with its own money, the address rules, the cancel paths, blocks and the team bar. Everything
 * this file makes is its own (tsk_team_*, its teams, the part tasks and bookings), canceled or removed after.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_chris';
const LEAD = 'usr_jordan';
const PARTNER = 'usr_sam';
const STRANGER = 'usr_maya';
const TASK = 'tsk_team_desk';
const hub = { db, cipher: fieldCipherFromEnv() };
const pay = { db, payments: createDevPaymentProvider() };
const now = new Date();
const price = { type: 'fixed' as const, priceCents: 4500 };
let leadId = '';
let samName = '';
let leadMode = '';
const made = { tasks: [] as string[], bookings: [] as string[] };

async function latestTeam() {
  const [row] = await db.select().from(bookingTeams).where(eq(bookingTeams.leadBookingId, leadId)).orderBy(sql`${bookingTeams.createdAt} desc`).limit(1);
  return row!;
}

async function book(team: typeof bookingTeams.$inferSelect): Promise<string> {
  const booked = await confirmBooking(pay, CLIENT, team.partnerTaskId!, team.partnerOfferId!, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking Sam failed: ${JSON.stringify(booked)}`);
  const id = booked.redirectTo.split('/').pop()!;
  made.bookings.push(id);
  made.tasks.push(team.partnerTaskId!);
  return id;
}

/** What the newest outbox event of `type` for `aggregateId` plans: who, what, where to. */
async function planned(aggregateId: string, type: string) {
  const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, aggregateId), eq(outboxEvents.type, type))).orderBy(sql`${outboxEvents.createdAt} desc`).limit(1);
  if (!event) throw new Error(`${type} wasn't recorded for ${aggregateId}`);
  return { event, notices: (await planNotifications(db, event)).map((item) => ({ userId: item.userId, type: item.type, target: item.target })) };
}

/** Lines of `type` in a conversation. */
async function linesOf(threadId: string, type: string): Promise<number> {
  return (await db.select({ id: messages.id }).from(messages).where(and(eq(messages.threadId, threadId), sql`${messages.event}->>'type' = ${type}`))).length;
}

async function invite() {
  const result = await inviteTeamPartner(db, LEAD, leadId, { username: `@${samName}`, pricing: price, note: 'Bring gloves' }, new Date());
  expect(result).toMatchObject({ ok: true, code: 'sent' });
  return latestTeam();
}

beforeAll(async () => {
  await db.delete(rateLimits).where(or(like(rateLimits.key, `%team-invite:${LEAD}%`), like(rateLimits.key, `%booking-confirm:${CLIENT}%`)));
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const [sam] = await db.select({ username: usernames.username }).from(usernames).where(eq(usernames.userId, PARTNER));
  if (!desk || !offer || !sam) throw new Error('The seeded desk or Sam is missing');
  samName = sam.username;
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'team-test-desk', posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_team_jordan', taskId: TASK, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  const booked = await confirmBooking(pay, CLIENT, TASK, 'off_team_jordan', { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  leadId = booked.redirectTo.split('/').pop()!;
  made.bookings.push(leadId);
  const [lead] = await db.select().from(bookings).where(eq(bookings.id, leadId));
  leadMode = lead!.paymentMode;
  await ensureThread(db, bookingThreadLink(lead!), now);
});

afterAll(async () => {
  try {
    if (made.bookings.length) await db.update(bookings).set({ status: 'canceled', cancelReason: 'admin', canceledAt: new Date() }).where(and(inArray(bookings.id, made.bookings), sql`${bookings.status} <> 'canceled'`));
    await db.update(tasks).set({ status: 'canceled' }).where(or(eq(tasks.id, TASK), eq(tasks.teamPartOf, leadId)));
    await db.delete(blocks).where(and(eq(blocks.blockerId, PARTNER), eq(blocks.blockedId, CLIENT)));
    const teamIds = (await db.select({ id: bookingTeams.id }).from(bookingTeams).where(eq(bookingTeams.leadBookingId, leadId))).map((row) => row.id);
    if (teamIds.length) await db.delete(messages).where(inArray(sql`${messages.event}->'params'->>'teamId'`, teamIds));
    // Their team.* events: never dispatched later by another file's run (notifications to the seeded cast).
    if (teamIds.length) await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, teamIds));
    await db.delete(rateLimits).where(or(like(rateLimits.key, `%team-invite:${LEAD}%`), like(rateLimits.key, `%booking-confirm:${CLIENT}%`)));
  } finally {
    await pool.end();
  }
});

describe('who can invite whom', () => {
  it('only the lead, and only someone else who can be booked for it', async () => {
    expect(await inviteTeamPartner(db, CLIENT, leadId, { username: samName, pricing: price }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await inviteTeamPartner(db, STRANGER, leadId, { username: samName, pricing: price }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await inviteTeamPartner(db, LEAD, leadId, { username: 'nobody_here_42', pricing: price }, now)).toMatchObject({ ok: false, fieldErrors: { username: ['invalid'] } });
    const [jordan] = await db.select({ username: usernames.username }).from(usernames).where(eq(usernames.userId, LEAD));
    expect(await inviteTeamPartner(db, LEAD, leadId, { username: jordan!.username, pricing: price }, now)).toMatchObject({ ok: false, fieldErrors: { username: ['prohibited'] } });
    expect(await inviteTeamPartner(db, LEAD, leadId, { username: samName, pricing: { type: 'fixed', priceCents: 0 } }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
  });

  it('not across a block between the partner and the client', async () => {
    await db.insert(blocks).values({ blockerId: PARTNER, blockedId: CLIENT });
    expect(await inviteTeamPartner(db, LEAD, leadId, { username: samName, pricing: price }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    await db.delete(blocks).where(and(eq(blocks.blockerId, PARTNER), eq(blocks.blockedId, CLIENT)));
  });

  it('one invite at a time; the partner sees it in their team conversation with the price, the client not yet', async () => {
    const team = await invite();
    expect(team).toMatchObject({ status: 'invited', partnerUserId: PARTNER, clientUserId: CLIENT, pricingType: 'fixed', priceCents: 4500, note: 'Bring gloves' });
    expect(await inviteTeamPartner(db, LEAD, leadId, { username: samName, pricing: price }, now)).toMatchObject({ ok: false, code: 'not_allowed' });

    const samThread = await getThreadPage(db, PARTNER, team.teamThreadId!, now);
    expect(samThread?.cards?.teams?.[team.id]).toMatchObject({ viewerRole: 'partner', status: 'invited', actions: ['accept', 'decline'], pricing: price, note: 'Bring gloves' });
    const jordanThread = await getThreadPage(db, LEAD, team.teamThreadId!, now);
    expect(jordanThread?.cards?.teams?.[team.id]).toMatchObject({ viewerRole: 'lead', actions: ['cancel'], pricing: price });

    const clientView = await getBookingView(hub, CLIENT, leadId, now);
    expect(clientView?.team).toBeUndefined();
    expect((await getBookingView(hub, LEAD, leadId, now))?.team).toMatchObject({ part: 'lead', invite: { status: 'invited' } });

    // Declined: the place is free again.
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'decline' }, now)).toMatchObject({ ok: true });
    expect((await getBookingView(hub, LEAD, leadId, now))?.team?.canInvite).toBe(true);
  });

  it('the lead can cancel, the partner can step back after saying yes, and nobody else answers', async () => {
    const team = await invite();
    expect(await runTeamAction(db, STRANGER, { teamId: team.id, action: 'accept' }, now)).toMatchObject({ ok: false, code: 'not_found' });
    expect(await runTeamAction(db, CLIENT, { teamId: team.id, action: 'confirm' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await runTeamAction(db, LEAD, { teamId: team.id, action: 'cancel' }, now)).toMatchObject({ ok: true, code: 'canceled' });
    const again = await invite();
    expect(await runTeamAction(db, PARTNER, { teamId: again.id, action: 'accept' }, now)).toMatchObject({ ok: true });
    expect(await runTeamAction(db, PARTNER, { teamId: again.id, action: 'withdraw' }, now)).toMatchObject({ ok: true });
    const [row] = await db.select({ status: bookingTeams.status }).from(bookingTeams).where(eq(bookingTeams.id, again.id));
    expect(row?.status).toBe('withdrawn');
  });
});

describe('who hears what, and the team conversation (sweep 2026-11-24, C5 and C6)', () => {
  it('each answer reaches the people it concerns; the client nothing before the partner said yes', async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `%team-invite:${LEAD}%`));
    const team = await invite();
    const onTeam = { kind: 'thread', threadId: team.teamThreadId! };
    const [leadThread] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, leadId)));
    const withClient = { kind: 'thread', threadId: leadThread!.id };
    expect((await planned(team.id, 'team.invited')).notices).toEqual([{ userId: PARTNER, type: 'team_invited', target: onTeam }]);
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'accept' }, now)).toMatchObject({ ok: true });
    expect((await planned(team.id, 'team.accepted')).notices).toEqual([{ userId: CLIENT, type: 'team_proposed', target: withClient }, { userId: LEAD, type: 'team_accepted', target: onTeam }]);
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'withdraw' }, now)).toMatchObject({ ok: true });
    expect((await planned(team.id, 'team.withdrawn')).notices).toEqual([{ userId: LEAD, type: 'team_withdrawn', target: onTeam }, { userId: CLIENT, type: 'team_withdrawn', target: withClient }]);

    // Taken back before the partner answered: the partner hears it; the client never saw it.
    const second = await invite();
    expect(await runTeamAction(db, LEAD, { teamId: second.id, action: 'cancel' }, now)).toMatchObject({ ok: true });
    expect((await planned(second.id, 'team.canceled')).notices).toEqual([{ userId: PARTNER, type: 'team_canceled', target: onTeam }]);
    const third = await invite();
    expect(await runTeamAction(db, PARTNER, { teamId: third.id, action: 'decline' }, now)).toMatchObject({ ok: true });
    expect((await planned(third.id, 'team.declined')).notices).toEqual([{ userId: LEAD, type: 'team_declined', target: onTeam }]);

    // The client's yes and, for a part not booked yet, their no: both helpers hear each.
    const fourth = await invite();
    await runTeamAction(db, PARTNER, { teamId: fourth.id, action: 'accept' }, now);
    expect(await runTeamAction(db, CLIENT, { teamId: fourth.id, action: 'confirm' }, now)).toMatchObject({ ok: true });
    const [confirmed] = await db.select().from(bookingTeams).where(eq(bookingTeams.id, fourth.id));
    made.tasks.push(confirmed!.partnerTaskId!);
    expect((await planned(fourth.id, 'team.confirmed')).notices).toEqual([{ userId: LEAD, type: 'team_confirmed', target: onTeam }, { userId: PARTNER, type: 'team_confirmed', target: onTeam }]);
    expect(await runTeamAction(db, CLIENT, { teamId: fourth.id, action: 'refuse' }, now)).toMatchObject({ ok: true });
    expect((await planned(fourth.id, 'team.refused')).notices).toEqual([{ userId: LEAD, type: 'team_refused', target: onTeam }, { userId: PARTNER, type: 'team_refused', target: onTeam }]);
  });

  it("the team conversation is the partner's message request until their yes takes it, and comes out of their archive", async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `%team-invite:${LEAD}%`));
    const [earlier] = await db.select({ threadId: bookingTeams.teamThreadId }).from(bookingTeams).where(eq(bookingTeams.leadBookingId, leadId)).limit(1);
    const sams = and(eq(threadParticipants.threadId, earlier!.threadId!), eq(threadParticipants.userId, PARTNER));
    // As if Sam had never answered Jordan, and had archived the conversation.
    await db.update(threadParticipants).set({ acceptedAt: null, archivedAt: new Date() }).where(sams);
    const team = await invite();
    expect(team.teamThreadId).toBe(earlier!.threadId);
    expect((await db.select().from(threadParticipants).where(sams))[0]).toMatchObject({ acceptedAt: null, archivedAt: null });
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'accept' }, now)).toMatchObject({ ok: true });
    expect((await db.select().from(threadParticipants).where(sams))[0]?.acceptedAt).not.toBeNull();
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'withdraw' }, now)).toMatchObject({ ok: true });
  });

  it("asks the partner's \"who can message me\" before a new conversation: Nobody refuses it", async () => {
    const [sam] = await db.select({ directMessages: users.directMessages }).from(users).where(eq(users.id, PARTNER));
    await db.update(users).set({ directMessages: 'nobody' }).where(eq(users.id, PARTNER));
    try {
      expect(await directStartFor(db, LEAD, PARTNER, now)).toMatchObject({ refused: 'not_accepting' });
    } finally {
      await db.update(users).set({ directMessages: sam!.directMessages }).where(eq(users.id, PARTNER));
    }
    expect((await directStartFor(db, LEAD, PARTNER, now)).refused).toBeNull();
  });
});

describe("the client's confirm makes an ordinary second booking", () => {
  let team: typeof bookingTeams.$inferSelect;
  let partnerId = '';

  it("the partner's yes reaches the client as a card in their conversation with the lead", async () => {
    team = await invite();
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'accept' }, now)).toMatchObject({ ok: true });
    const [lead] = await db.select().from(bookings).where(eq(bookings.id, leadId));
    const [thread] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, leadId)));
    const page = await getThreadPage(db, CLIENT, thread!.id, now);
    expect(page?.cards?.teams?.[team.id]).toMatchObject({ viewerRole: 'client', status: 'accepted', actions: ['confirm', 'refuse'], pricing: price });
    expect(page?.cards?.teams?.[team.id]?.note).toBeUndefined();
    expect(lead?.status).toBe('confirmed');
  });

  it("confirming makes the partner's part (same time and place, never listed) and opens the normal confirm dialog", async () => {
    const result = await runTeamAction(db, CLIENT, { teamId: team.id, action: 'confirm' }, now);
    [team] = await db.select().from(bookingTeams).where(eq(bookingTeams.id, team.id)) as [typeof team];
    expect(team.status).toBe('confirmed');
    expect(result).toMatchObject({ ok: true, code: 'opened', redirectTo: routes.app.confirmOffer(team.partnerTaskId!, team.partnerOfferId!) });
    const [part] = await db.select().from(tasks).where(eq(tasks.id, team.partnerTaskId!));
    const [leadTask] = await db.select().from(tasks).where(eq(tasks.id, TASK));
    expect(part).toMatchObject({ teamPartOf: leadId, posterUserId: CLIENT, locationId: leadTask!.locationId, windowStart: leadTask!.windowStart, status: 'open', budgetCents: 4500, expenseAllowanceCents: 0 });
    const [offer] = await db.select().from(offers).where(eq(offers.id, team.partnerOfferId!));
    expect(offer).toMatchObject({ helperUserId: PARTNER, status: 'pending', priceCents: 4500, paymentMode: leadMode });
    const listed = await db.select({ id: tasks.id }).from(tasks).where(and(...openIn(part!.marketId, now), eq(tasks.id, part!.id)));
    expect(listed).toHaveLength(0);
    // Tapping again opens the same dialog; the client's card says Book.
    expect(await runTeamAction(db, CLIENT, { teamId: team.id, action: 'book' }, now)).toMatchObject({ ok: true, redirectTo: result.ok ? result.redirectTo : '' });
  });

  it('booking it is the normal flow: its own booking, terms and money, in the lead mode', async () => {
    partnerId = await book(team);
    const [partner] = await db.select().from(bookings).where(eq(bookings.id, partnerId));
    expect(partner).toMatchObject({ helperUserId: PARTNER, posterUserId: CLIENT, taskId: team.partnerTaskId, paymentMode: leadMode, status: 'confirmed' });
    const [lead] = await db.select().from(bookings).where(eq(bookings.id, leadId));
    expect(partner!.startAt.toISOString()).toBe(lead!.startAt.toISOString());
    expect(lead?.status).toBe('confirmed');
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, partnerId));
    expect(terms).toMatchObject({ pricingType: 'fixed', priceCents: 4500 });
    // Money stays per booking: any charge for Sam's part is its own row, none on the lead's from this.
    const partnerCharges = await db.select({ bookingId: payments.bookingId }).from(payments).where(eq(payments.bookingId, partnerId));
    expect(partnerCharges.every((row) => row.bookingId === partnerId)).toBe(true);
    if (leadMode === 'direct') expect(partnerCharges).toHaveLength(0);
  });

  it('each person sees their own money; each helper only the other one name and role', async () => {
    const samView = await getBookingView(hub, PARTNER, partnerId, now);
    expect(samView?.team).toMatchObject({ viewerRole: 'partner', part: 'partner', teamThreadId: team.teamThreadId });
    expect(samView?.team?.leadBookingId).toBeUndefined();
    expect(samView?.terms.pricing).toEqual(price);
    // Sam can't open Jordan's booking, and Jordan can't open Sam's.
    expect(await getBookingView(hub, PARTNER, leadId, now)).toBeNull();
    expect(await getBookingView(hub, LEAD, partnerId, now)).toBeNull();
    const jordanView = await getBookingView(hub, LEAD, leadId, now);
    expect(jordanView?.team?.invite).toMatchObject({ status: 'confirmed', viewerRole: 'lead' });
    expect(jordanView?.team?.invite?.pricing).toBeUndefined();
    expect(jordanView?.team?.invite?.partnerBooking).toBeUndefined();
    const chrisView = await getBookingView(hub, CLIENT, leadId, now);
    expect(chrisView?.team?.invite).toMatchObject({ status: 'confirmed', pricing: price, partnerBooking: { bookingId: partnerId } });
    expect((await getBookingView(hub, CLIENT, partnerId, now))?.team).toMatchObject({ viewerRole: 'client', part: 'partner', leadBookingId: leadId });
  });

  it('the partner reads the exact address under the normal rules of their own booking', async () => {
    const samView = await getBookingView(hub, PARTNER, partnerId, now);
    const jordanView = await getBookingView(hub, LEAD, leadId, now);
    expect(samView?.addressVisibility).toBe(jordanView?.addressVisibility);
    expect(samView?.exactAddress).toEqual(jordanView?.exactAddress);
    expect(samView?.exactAddress).toBeDefined();
  });

  it('the team bar links the viewer’s own team conversations, and the list shows both parts as one team job', async () => {
    const [partner] = await db.select().from(bookings).where(eq(bookings.id, partnerId));
    const partnerThread = await ensureThread(db, bookingThreadLink(partner!), now);
    const [leadThread] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, leadId)));
    const chris = await getThreadPage(db, CLIENT, leadThread!.id, now);
    expect(chris?.team?.conversations).toEqual([{ kind: 'lead_booking', threadId: leadThread!.id, current: true }, { kind: 'partner_booking', threadId: partnerThread, current: false }]);
    const sam = await getThreadPage(db, PARTNER, partnerThread, now);
    expect(sam?.team?.conversations).toEqual([{ kind: 'partner_booking', threadId: partnerThread, current: true }, { kind: 'team', threadId: team.teamThreadId, current: false }]);
    const jordanTeam = await getThreadPage(db, LEAD, team.teamThreadId!, now);
    expect(jordanTeam?.team?.conversations.map((item) => item.kind)).toEqual(['lead_booking', 'team']);
    const list = await getBookingsPage(db, CLIENT, now);
    const rows = list.upcoming.filter((row) => row.id === leadId || row.id === partnerId);
    expect(rows.map((row) => row.team?.part).sort()).toEqual(['lead', 'partner']);
  });

  it("the partner canceling leaves the lead's booking untouched, never reopens the part, and frees the lead to invite again", async () => {
    expect(await cancelBookingBy(pay, PARTNER, partnerId, { reason: 'unavailable', note: '' }, new Date())).toMatchObject({ ok: true });
    // The lead hears it, and both read it in their team conversation, once (sweep B5).
    const { event, notices } = await planned(partnerId, 'booking.canceled');
    expect(notices.filter((item) => item.userId === LEAD)).toEqual([{ userId: LEAD, type: 'team_partner_left', target: { kind: 'booking', bookingId: leadId } }]);
    await reactToTeamEvent(db, event, new Date());
    await reactToTeamEvent(db, event, new Date());
    expect(await linesOf(team.teamThreadId!, 'team_partner_canceled')).toBe(1);
    const [lead] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, leadId));
    expect(lead?.status).toBe('confirmed');
    const [part] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, team.partnerTaskId!));
    expect(part?.status).not.toBe('open');
    const chrisOnSam = await getBookingView(hub, CLIENT, partnerId, now);
    expect(chrisOnSam?.actions.map((action) => action.id)).not.toContain('find_replacement');
    const jordanAfter = await getBookingView(hub, LEAD, leadId, now);
    expect(jordanAfter?.team?.canInvite).toBe(true);
    // The ended team no longer shows as "on the team" to the lead; the client sees Sam's booking canceled.
    expect(jordanAfter?.team?.invite).toBeUndefined();
    expect((await getBookingView(hub, CLIENT, leadId, now))?.team?.invite?.partnerBooking).toMatchObject({ bookingId: partnerId, status: 'canceled' });
  });
});

describe('a confirmed part not booked yet (sweep 2026-11-24)', () => {
  const HOUR = 3_600_000;
  const card = { offerRevision: 1, payment: { kind: 'dev_card' as const, card: 'success' as const, save: false }, acceptTerms: true as const };

  /** Sam accepts, Chris confirms: the part and its offer are made, not booked. */
  async function confirmedPart() {
    // Jordan's invites are a person's pace (10 an hour): these tests make more than that.
    await db.delete(rateLimits).where(like(rateLimits.key, `%team-invite:${LEAD}%`));
    const team = await invite();
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'accept' }, now)).toMatchObject({ ok: true });
    const opened = await runTeamAction(db, CLIENT, { teamId: team.id, action: 'confirm' }, now);
    expect(opened).toMatchObject({ ok: true, code: 'opened' });
    const [row] = await db.select().from(bookingTeams).where(eq(bookingTeams.id, team.id));
    made.tasks.push(row!.partnerTaskId!);
    return { team: row!, opened };
  }

  // A test that stops halfway leaves no team in play (or change open) for the next one.
  afterEach(async () => {
    const open = await db.select().from(bookingTeams).where(and(eq(bookingTeams.leadBookingId, leadId), inArray(bookingTeams.status, ['invited', 'accepted', 'confirmed'])));
    for (const row of open) {
      const [booked] = row.partnerTaskId ? await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.taskId, row.partnerTaskId), sql`${bookings.status} <> 'canceled'`)) : [];
      if (booked) continue;
      await db.update(bookingTeams).set({ status: 'canceled', closedAt: new Date() }).where(eq(bookingTeams.id, row.id));
      if (row.partnerTaskId) await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, row.partnerTaskId));
      if (row.partnerOfferId) await db.update(offers).set({ status: 'withdrawn' }).where(and(eq(offers.id, row.partnerOfferId), eq(offers.status, 'pending')));
    }
    await db.update(bookingChangeRequests).set({ status: 'withdrawn' }).where(and(eq(bookingChangeRequests.bookingId, leadId), inArray(bookingChangeRequests.status, ['proposed', 'accepted_pending_funding'])));
  });

  it('Confirm again opens the same checkout; the client can still say no, which closes the part (B7)', async () => {
    const { team, opened } = await confirmedPart();
    expect(await runTeamAction(db, CLIENT, { teamId: team.id, action: 'confirm' }, now)).toEqual(opened);
    expect((await getBookingView(hub, CLIENT, leadId, now))?.team?.invite?.actions).toEqual(['book', 'refuse']);
    expect(await runTeamAction(db, CLIENT, { teamId: team.id, action: 'refuse' }, now)).toMatchObject({ ok: true });
    const [part] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, team.partnerTaskId!));
    expect(part?.status).toBe('canceled');
    const [offer] = await db.select({ status: offers.status }).from(offers).where(eq(offers.id, team.partnerOfferId!));
    expect(offer?.status).toBe('withdrawn');
    expect((await getBookingView(hub, LEAD, leadId, now))?.team?.canInvite).toBe(true);
  });

  it("the lead can take back a part the client hasn't booked (B7)", async () => {
    const { team } = await confirmedPart();
    expect((await getBookingView(hub, LEAD, leadId, now))?.team?.invite?.actions).toEqual(['cancel']);
    expect(await runTeamAction(db, LEAD, { teamId: team.id, action: 'cancel' }, now)).toMatchObject({ ok: true, code: 'canceled' });
    const [part] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, team.partnerTaskId!));
    expect(part?.status).toBe('canceled');
  });

  it('a part never books once its team ended, even from a checkout left open (B8)', async () => {
    const { team } = await confirmedPart();
    expect(await runTeamAction(db, PARTNER, { teamId: team.id, action: 'withdraw' }, now)).toMatchObject({ ok: true });
    expect(await confirmBooking(pay, CLIENT, team.partnerTaskId!, team.partnerOfferId!, card, new Date())).toMatchObject({ ok: false, code: 'not_allowed' });
    // The team's row alone says so: a part left open (as after a raced step back) still doesn't book.
    const { team: other } = await confirmedPart();
    await db.update(bookingTeams).set({ status: 'withdrawn', closedAt: new Date() }).where(eq(bookingTeams.id, other.id));
    expect(await confirmBooking(pay, CLIENT, other.partnerTaskId!, other.partnerOfferId!, card, new Date())).toMatchObject({ ok: false, code: 'not_allowed' });
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, other.partnerTaskId!));
    await db.update(offers).set({ status: 'withdrawn' }).where(eq(offers.id, other.partnerOfferId!));
  });

  it("the partner's part isn't an offer of theirs: nothing to revise or withdraw, and not in My offers (B3)", async () => {
    const { team } = await confirmedPart();
    expect(await helperOfferAction(db, PARTNER, team.partnerOfferId!, 'withdraw_offer', now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await reviseOffer(db, PARTNER, team.partnerTaskId!, { pricing: { type: 'fixed', priceCents: 9000 }, startTime: '09:00', message: 'A bit more for the stairs', brings: [] }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    const [offer] = await db.select({ priceCents: offers.priceCents, revision: offers.revision }).from(offers).where(eq(offers.id, team.partnerOfferId!));
    expect(offer).toEqual({ priceCents: 4500, revision: 1 });
    const mine = await getMyOffers(db, PARTNER, now);
    expect([...mine.active, ...mine.booked, ...mine.closed].some((row) => row.offer.id === team.partnerOfferId)).toBe(false);
    expect(await runTeamAction(db, CLIENT, { teamId: team.id, action: 'refuse' }, now)).toMatchObject({ ok: true });
  });

  it("while the team stands, the lead booking's start doesn't change, also from a change proposed before (B4)", async () => {
    const [lead] = await db.select().from(bookings).where(eq(bookings.id, leadId));
    const later = new Date(lead!.startAt.getTime() + HOUR).toISOString();
    expect(await proposeChange(db, LEAD, leadId, { start: later, message: 'Could we start an hour later?' }, now)).toMatchObject({ ok: true });
    const [change] = await db.select({ id: bookingChangeRequests.id }).from(bookingChangeRequests).where(and(eq(bookingChangeRequests.bookingId, leadId), eq(bookingChangeRequests.status, 'proposed')));
    const { team } = await confirmedPart();
    const page = await getProposeChangePage(db, CLIENT, leadId, now);
    expect(page).toMatchObject({ teamJob: true });
    expect(page?.allowedTypes).not.toContain('schedule');
    expect(await acceptChange(pay, CLIENT, leadId, change!.id, {}, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    const [still] = await db.select({ startAt: bookings.startAt }).from(bookings).where(eq(bookings.id, leadId));
    expect(still!.startAt.toISOString()).toBe(lead!.startAt.toISOString());
    // Once the team ends, the start is the booking's own again.
    expect(await runTeamAction(db, CLIENT, { teamId: team.id, action: 'refuse' }, now)).toMatchObject({ ok: true });
    expect((await getProposeChangePage(db, CLIENT, leadId, now))?.allowedTypes).toContain('schedule');
    await db.update(bookingChangeRequests).set({ status: 'withdrawn' }).where(eq(bookingChangeRequests.id, change!.id));
  });
});

describe("canceling the lead's booking", () => {
  it('offers the client keep or cancel both; keeping leaves the partner booked', async () => {
    const team = await invite();
    await runTeamAction(db, PARTNER, { teamId: team.id, action: 'accept' }, now);
    await runTeamAction(db, CLIENT, { teamId: team.id, action: 'confirm' }, now);
    const [confirmed] = await db.select().from(bookingTeams).where(eq(bookingTeams.id, team.id));
    const partnerId = await book(confirmed!);
    expect(await cancelBookingBy(pay, LEAD, leadId, { reason: 'unavailable', note: '' }, new Date())).toMatchObject({ ok: true });
    const [partner] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, partnerId));
    expect(partner?.status).toBe('confirmed');
    // Sam hears it, at their own booking, and both read it in their team conversation once (sweep B5). Sam's booked
    // part stays (the client decides), nobody leads it now, and it's no team job any more.
    const { event, notices } = await planned(leadId, 'booking.canceled');
    expect(notices.filter((item) => item.userId === PARTNER)).toEqual([{ userId: PARTNER, type: 'team_lead_canceled', target: { kind: 'booking', bookingId: partnerId } }]);
    await reactToTeamEvent(db, event, new Date());
    await reactToTeamEvent(db, event, new Date());
    expect(await linesOf(team.teamThreadId!, 'team_lead_canceled')).toBe(1);
    expect((await db.select({ status: bookingTeams.status }).from(bookingTeams).where(eq(bookingTeams.id, team.id)))[0]?.status).toBe('confirmed');
    expect((await getBookingView(hub, PARTNER, partnerId, now))?.team).toMatchObject({ part: 'partner', leadCanceled: true });
    expect((await getBookingsPage(db, CLIENT, now)).upcoming.find((row) => row.id === partnerId)?.team).toBeUndefined();
    // A replacement lead on the same task can't bring a third person while Sam's booking is on.
    const [leadRow] = await db.select().from(bookings).where(eq(bookings.id, leadId));
    const replacement = { ...leadRow!, id: 'bkg_team_replacement', helperUserId: 'usr_lee', status: 'confirmed' };
    expect(await canInviteFor(db, replacement, null, now)).toBe(false);
    const chris = await getBookingView(hub, CLIENT, leadId, now);
    expect(chris?.team?.cancelChoice).toMatchObject({ partnerBookingId: partnerId });
    expect(await keepPartner(db, STRANGER, { teamId: team.id }, now)).toMatchObject({ ok: false });
    expect(await keepPartner(db, CLIENT, { teamId: team.id }, now)).toMatchObject({ ok: true });
    expect((await getBookingView(hub, CLIENT, leadId, now))?.team?.cancelChoice).toBeUndefined();
    // "Cancel both" is the partner booking's own cancel, under the normal rules.
    expect(await cancelBookingBy(pay, CLIENT, partnerId, { reason: 'plans_changed', note: '' }, new Date())).toMatchObject({ ok: true });
    expect(await canInviteFor(db, replacement, null, now)).toBe(true);
  });
});
