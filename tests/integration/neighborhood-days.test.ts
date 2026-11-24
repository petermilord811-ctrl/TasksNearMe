import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NeighborhoodDayInput } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { dayCardsOf, dayTeasersOf, neighborhoodAreasOf, publicCard } from '@/modules/availability/day-cards';
import { cancelNeighborhoodDay, cancelOpenNeighborhoodDays, createNeighborhoodDay } from '@/modules/availability/neighborhood-days';
import { availabilityPosts, neighborhoodDays } from '@/modules/availability/schema';
import { getMyAvailabilityPage } from '@/modules/availability/service';
import { openSlotsOf } from '@/modules/availability/slots';
import { invites } from '@/modules/invites/schema';
import { getRequestHelperPage, requestHelper } from '@/modules/invites/service';
import { areas } from '@/modules/markets/schema';
import { payments } from '@/modules/payments/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import { throwawayClient } from '../support/people';

/**
 * Neighborhood days (2026-11-24): the helper is seeded Jordan (East Austin, furniture at $45), whose days and visits
 * this file cancels when it ends; the neighbors are copies of seeded clients, with tasks of their own.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = () => new Date();
const ZONE = 'America/Chicago';
const DAY = 86_400_000;
const day = (offset: number) => marketDayKey(new Date(Date.now() + offset * DAY), ZONE);
const at = (date: string, time: string) => new Date(marketLocalToUtc(date, time, ZONE));
const NEAR = 'usr_tmp_nd_near';
const FAR = 'usr_tmp_nd_far';
const made: string[] = [];

let home: { id: string; slug: string; name: string };
let other: { id: string; slug: string; name: string };

const input = (date: string, extra: Partial<NeighborhoodDayInput> = {}): NeighborhoodDayInput => ({
  areaSlug: home.slug,
  categorySlug: 'furniture-assembly',
  date,
  visits: [{ startTime: '17:00', endTime: '18:00' }, { startTime: '18:30', endTime: '19:30' }, { startTime: '20:00', endTime: '21:00' }],
  priceCents: 4500,
  neighborPriceCents: 3500,
  ...extra,
});

/** A furniture task (a copy of seeded tsk_desk) for `poster`, at a place in `areaId`, open all evening on `date`. */
async function taskIn(id: string, poster: string, areaId: string, date: string): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [place] = await db.select().from(taskLocations).where(eq(taskLocations.id, desk!.locationId!));
  await db.insert(taskLocations).values({ ...place!, id: `loc_${id}`, ownerUserId: poster, areaId });
  await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: poster, status: 'open', offerCount: 0, version: 1, requestKey: null, locationId: `loc_${id}`, publicAreaId: areaId, windowStart: at(date, '16:00'), windowEnd: at(date, '22:00'), expiresAt: at(date, '22:00') });
  return id;
}

const request = (taskId: string, start: Date, slotId: string) => ({
  taskId,
  start: start.toISOString(),
  pricing: { type: 'fixed' as const, priceCents: 3500 },
  payment: { kind: 'dev_card' as const, card: 'success' as const, save: false },
  acceptTerms: true as const,
  slotId,
});

async function myDay(date: string) {
  const [row] = await db.select().from(neighborhoodDays).where(and(eq(neighborhoodDays.helperUserId, 'usr_jordan'), eq(neighborhoodDays.day, date), eq(neighborhoodDays.status, 'open')));
  made.push(row!.id);
  return row!;
}

beforeAll(async () => {
  await throwawayClient(db, NEAR, 'usr_ben');
  await throwawayClient(db, FAR, 'usr_ruth');
  const choices = await neighborhoodAreasOf(db, 'usr_jordan');
  home = choices[0]!;
  const [elsewhere] = await db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, 'mkt_austin'));
  other = (await db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, 'mkt_austin'))).find((area) => area.id !== home.id) ?? elsewhere!;
});

afterAll(async () => {
  // Jordan's days end canceled, their waiting requests declined, so no other file sees them.
  for (const id of made) await cancelNeighborhoodDay(db, pay, 'usr_jordan', id, now());
  if (made.length) await db.update(availabilityPosts).set({ status: 'canceled', canceledAt: now() }).where(inArray(availabilityPosts.dayId, made));
  await pool.end();
});

describe('neighborhood days', () => {
  it('offers the neighborhoods of the service area, own first', async () => {
    const choices = await neighborhoodAreasOf(db, 'usr_jordan');
    expect(choices[0]).toMatchObject({ id: 'area_east_austin' });
    expect(new Set(choices.map((area) => area.id)).size).toBe(choices.length);
    expect(await neighborhoodAreasOf(db, 'usr_ruth')).toEqual([]);
  });

  it('opens a day within the rules', async () => {
    const date = day(10);
    expect(await createNeighborhoodDay(db, 'usr_priya', input(date), now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { areaSlug: 'nowhere' }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { areaSlug: ['invalid'] } });
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { categorySlug: 'computer-help' }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } });
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { visits: [{ startTime: '17:00', endTime: '18:00' }] }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { visits: ['too_short'] } });
    const nine = Array.from({ length: 9 }, (_, index) => ({ startTime: `${String(8 + index).padStart(2, '0')}:00`, endTime: `${String(8 + index).padStart(2, '0')}:30` }));
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { visits: nine }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { visits: ['too_long'] } });
    // The neighbor price is the helper's choice, and only ever lower.
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { neighborPriceCents: 4500 }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { neighborPriceCents: ['out_of_range'] } });
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { visits: [{ startTime: '17:00', endTime: '18:00' }, { startTime: '17:30', endTime: '18:30' }] }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { 'visits.1.startTime': ['out_of_range'] } });
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(day(20)), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { date: ['out_of_range'] } });
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { visits: [{ startTime: '06:00', endTime: '19:00' }, { startTime: '20:00', endTime: '21:00' }] }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { 'visits.0.endTime': ['out_of_range'] } });

    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date), now())).toEqual({ ok: true, code: 'saved' });
    const row = await myDay(date);
    expect(row).toMatchObject({ areaId: home.id, priceCents: 4500, neighborPriceCents: 3500, status: 'open' });
    const visits = await db.select().from(availabilityPosts).where(eq(availabilityPosts.dayId, row.id));
    // Each visit is an ordinary slot at the neighbor price.
    expect(visits.map((visit) => ({ status: visit.status, type: visit.pricingType, price: visit.priceCents }))).toEqual(Array(3).fill({ status: 'active', type: 'fixed', price: 3500 }));
    // A second day can't overlap the first's visits.
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { areaSlug: home.slug }), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { 'visits.0.startTime': ['out_of_range'] } });

    const [card] = await dayCardsOf(db, { ids: [row.id] }, now());
    expect(publicCard(card!)).toMatchObject({ areaName: home.name, date, state: 'open', openCount: 3, totalCount: 3, visitPriceCents: 3500, usualPriceCents: 4500, categorySlug: 'furniture-assembly', helper: { handle: 'jordan-t' } });
    expect(publicCard(card!)).not.toHaveProperty('areaId');
    expect(publicCard(card!, 'usr_jordan')).toMatchObject({ own: true });

    // The helper's page: the day with "Cancel open visits", its visits named by neighborhood; the profile's open times leave them out.
    const page = await getMyAvailabilityPage(db, 'usr_jordan', now());
    expect(page.neighborhood?.days.find((item) => item.id === row.id)).toMatchObject({ actions: ['cancel_day'], state: 'open' });
    expect(page.neighborhood?.areas[0]).toMatchObject({ slug: home.slug });
    expect(page.posts.find((post) => post.id === visits[0]!.id)).toMatchObject({ dayAreaName: home.name });
    expect((await openSlotsOf(db, 'usr_jordan', 50)).map((slot) => slot.id)).not.toContain(visits[0]!.id);
    // Find helpers names the day.
    expect((await dayTeasersOf(db, ['usr_jordan'], now())).get('usr_jordan')).toMatchObject({ id: row.id, areaName: home.name, openCount: 3, visitPriceCents: 3500 });
  });

  it('takes a visit with an ordinary request, only for a task in that neighborhood, and fills up', async () => {
    const date = day(10);
    const row = await db.select().from(neighborhoodDays).where(and(eq(neighborhoodDays.helperUserId, 'usr_jordan'), eq(neighborhoodDays.day, date), eq(neighborhoodDays.status, 'open'))).then((rows) => rows[0]!);
    const visits = await db.select().from(availabilityPosts).where(eq(availabilityPosts.dayId, row.id)).orderBy(availabilityPosts.startAt);
    const away = await taskIn('tsk_tmp_nd_away', FAR, other.id, date);
    const here = [await taskIn('tsk_tmp_nd_1', NEAR, home.id, date), await taskIn('tsk_tmp_nd_2', NEAR, home.id, date), await taskIn('tsk_tmp_nd_3', NEAR, home.id, date)];

    // Someone whose task is elsewhere sees the day but no task to request it for, and can't send one.
    const farPage = await getRequestHelperPage(db, pay, FAR, 'jordan-t', { slotId: visits[0]!.id }, now());
    expect(farPage).toMatchObject({ slot: { id: visits[0]!.id }, neighborhoodDay: { id: row.id, areaName: home.name }, tasks: [] });
    expect(await requestHelper(deps, FAR, 'jordan-t', request(away, at(date, '17:00'), visits[0]!.id), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { taskId: ['invalid'] } });

    // A neighbor there: their tasks, the visit's price, and the request holds the visit like any slot.
    const nearPage = await getRequestHelperPage(db, pay, NEAR, 'jordan-t', { slotId: visits[0]!.id }, now());
    expect(nearPage?.tasks.map((task) => task.id).sort()).toEqual([...here].sort());
    expect(nearPage?.suggestion).toMatchObject({ pricing: { type: 'fixed', priceCents: 3500 } });
    expect(await requestHelper(deps, NEAR, 'jordan-t', request(here[0]!, at(date, '17:00'), visits[0]!.id), now())).toMatchObject({ ok: true, code: 'sent' });
    let [card] = await dayCardsOf(db, { ids: [row.id] }, now());
    expect(card).toMatchObject({ state: 'filling', openCount: 2 });
    expect(card!.visits[0]).toMatchObject({ slotId: visits[0]!.id, state: 'taken' });

    await requestHelper(deps, NEAR, 'jordan-t', request(here[1]!, at(date, '18:30'), visits[1]!.id), now());
    await requestHelper(deps, NEAR, 'jordan-t', request(here[2]!, at(date, '20:00'), visits[2]!.id), now());
    [card] = await dayCardsOf(db, { ids: [row.id] }, now());
    expect(card).toMatchObject({ state: 'full', openCount: 0, totalCount: 3 });
    // Full days still show on Neighbors for the place; past ones don't.
    expect((await dayCardsOf(db, { marketId: 'mkt_austin', areaIds: [home.id], upcoming: true }, now())).map((item) => item.id)).toContain(row.id);
    expect((await dayCardsOf(db, { marketId: 'mkt_austin', areaIds: [other.id], upcoming: true }, now())).map((item) => item.id)).not.toContain(row.id);
    expect((await dayTeasersOf(db, ['usr_jordan'], now())).get('usr_jordan')?.id).not.toBe(row.id);
  });

  it('reads as past once every visit has started', async () => {
    const date = day(10);
    const [row] = await db.select().from(neighborhoodDays).where(and(eq(neighborhoodDays.helperUserId, 'usr_jordan'), eq(neighborhoodDays.day, date), eq(neighborhoodDays.status, 'open')));
    const later = at(date, '20:30');
    const [card] = await dayCardsOf(db, { ids: [row!.id] }, later);
    expect(card?.state).toBe('past');
    expect((await dayCardsOf(db, { helperIds: ['usr_jordan'], upcoming: true }, later)).map((item) => item.id)).not.toContain(row!.id);
  });

  it('cancels the open and requested visits; a booked one goes ahead', async () => {
    const date = day(11);
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date, { neighborPriceCents: undefined }), now())).toEqual({ ok: true, code: 'saved' });
    const row = await myDay(date);
    const visits = await db.select().from(availabilityPosts).where(eq(availabilityPosts.dayId, row.id)).orderBy(availabilityPosts.startAt);
    expect(visits[0]?.priceCents).toBe(4500);
    const task = await taskIn('tsk_tmp_nd_cancel', NEAR, home.id, date);
    expect(await requestHelper(deps, NEAR, 'jordan-t', { ...request(task, at(date, '18:30'), visits[1]!.id), pricing: { type: 'fixed', priceCents: 4500 } }, now())).toMatchObject({ ok: true, code: 'sent' });
    // Stands in for an accepted request: the booking's own cancel rules apply to it, not the day's.
    await db.update(availabilityPosts).set({ status: 'booked' }).where(eq(availabilityPosts.id, visits[2]!.id));

    expect(await cancelNeighborhoodDay(db, pay, 'usr_lee', row.id, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelNeighborhoodDay(db, pay, 'usr_jordan', row.id, now())).toEqual({ ok: true, code: 'canceled' });
    expect(await cancelNeighborhoodDay(db, pay, 'usr_jordan', row.id, now())).toEqual({ ok: false, code: 'not_allowed' });
    const after = await db.select().from(availabilityPosts).where(eq(availabilityPosts.dayId, row.id)).orderBy(availabilityPosts.startAt);
    expect(after.map((visit) => visit.status)).toEqual(['canceled', 'canceled', 'booked']);
    const [declined] = await db.select().from(invites).where(eq(invites.slotId, visits[1]!.id));
    expect(declined?.status).toBe('declined');
    expect((await db.select().from(payments).where(eq(payments.id, declined!.paymentId!)))[0]?.status).toBe('canceled');
    const [card] = await dayCardsOf(db, { ids: [row.id] }, now());
    expect(card).toMatchObject({ state: 'canceled', totalCount: 1, visits: [{ slotId: visits[2]!.id, state: 'taken' }] });
    const page = await getMyAvailabilityPage(db, 'usr_jordan', now());
    expect(page.neighborhood?.days.find((item) => item.id === row.id)).toMatchObject({ state: 'canceled', actions: [] });
    await db.update(availabilityPosts).set({ status: 'canceled' }).where(eq(availabilityPosts.id, visits[2]!.id));
  });

  it("hides a day whose helper can't be requested, and suspension cancels it (sweep 2026-11-24 A5)", async () => {
    const date = day(12);
    expect(await createNeighborhoodDay(db, 'usr_jordan', input(date), now())).toEqual({ ok: true, code: 'saved' });
    const row = await myDay(date);
    const onNeighbors = async () => (await dayCardsOf(db, { marketId: 'mkt_austin', upcoming: true }, now())).some((card) => card.id === row.id);
    expect(await onNeighbors()).toBe(true);
    // Paused: off Neighbors and Find helpers (each visit there would open a 404), still on the helper's own page.
    await db.update(helperProfiles).set({ status: 'paused' }).where(eq(helperProfiles.userId, 'usr_jordan'));
    try {
      expect(await onNeighbors()).toBe(false);
      expect((await dayTeasersOf(db, ['usr_jordan'], now())).has('usr_jordan')).toBe(false);
      const page = await getMyAvailabilityPage(db, 'usr_jordan', now());
      expect(page.neighborhood?.days.some((item) => item.id === row.id)).toBe(true);
    } finally {
      await db.update(helperProfiles).set({ status: 'active' }).where(eq(helperProfiles.userId, 'usr_jordan'));
    }
    // A suspended (or banned) account too.
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, 'usr_jordan'));
    try {
      expect(await onNeighbors()).toBe(false);
    } finally {
      await db.update(users).set({ status: 'active' }).where(eq(users.id, 'usr_jordan'));
    }
    expect(await onNeighbors()).toBe(true);

    // Suspension closes the day as the helper's own Cancel would: a waiting request is declined and its hold released.
    const visits = await db.select().from(availabilityPosts).where(eq(availabilityPosts.dayId, row.id)).orderBy(availabilityPosts.startAt);
    const task = await taskIn('tsk_tmp_nd_suspend', NEAR, home.id, date);
    expect(await requestHelper(deps, NEAR, 'jordan-t', request(task, at(date, '17:00'), visits[0]!.id), now())).toMatchObject({ ok: true, code: 'sent' });
    expect(await cancelOpenNeighborhoodDays(db, pay, 'usr_jordan', now())).toBeGreaterThanOrEqual(1);
    expect((await db.select({ status: neighborhoodDays.status }).from(neighborhoodDays).where(eq(neighborhoodDays.id, row.id)))[0]?.status).toBe('canceled');
    const [declined] = await db.select().from(invites).where(eq(invites.slotId, visits[0]!.id));
    expect(declined?.status).toBe('declined');
    expect((await db.select().from(payments).where(eq(payments.id, declined!.paymentId!)))[0]?.status).toBe('canceled');
    expect((await db.select({ status: availabilityPosts.status }).from(availabilityPosts).where(eq(availabilityPosts.dayId, row.id))).map((visit) => visit.status)).toEqual(['canceled', 'canceled', 'canceled']);
  });
});
