import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { waitlistEntries } from '@/modules/marketing/schema';
import { loadWaitingPlaces } from '@/modules/marketing/waiting-places';
import { citiesComingNext, joinWaitlist, waitlistDemand } from '@/modules/marketing/waitlist';
import { areas, markets } from '@/modules/markets/schema';
import { setMarketStatus } from '@/modules/markets/status';
import { getDashboard } from '@/modules/home/service';
import { getFindWorkPageData } from '@/modules/offers/helper';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { computeOnboarding } from '@/modules/verification/progress';
import { saveHelperArea } from '@/modules/verification/service';
import { loadOnboardingState } from '@/modules/verification/state';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { distanceMiles } from '@/shared/geo';

/**
 * National (owner, 2026-11-14), and since 2026-11-23 with no limit of location: a helper anywhere gives a ZIP and city and
 * helps from their city; the waitlist counts demand per ZIP3 and city; opening a market brings the helpers around it
 * in. People and markets made for this file (copies of Jordan, a helper, and of Austin); seeded rows aren't changed.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DALLAS_HELPER = 'usr_nat_dallas';
const DENVER_HELPER = 'usr_nat_denver';
const DALLAS = 'mkt_test_nat_dallas';
const NEW_YORK = 'mkt_test_nat_newyork';
/** A market in a zone dates aren't checked in (outside the US): it can't open. */
const ABROAD = 'mkt_test_nat_abroad';
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const now = new Date();
const area = { serviceRadiusMiles: 5 as const, remoteOk: false };

async function helper(id: string) {
  const [copy] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...copy!, id, email: `${id}@example.test`, name: `P ${id.slice(-6)}`, phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin', createdAt: now });
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(helperProfiles).values({ ...profile!, userId: id, handle: id.replace(/_/g, '-'), status: 'draft', foundingNumber: null, completedCount: 0, areaId: null, homeZip: null, homeCity: null, homeState: null });
}

beforeAll(async () => {
  await helper(DALLAS_HELPER);
  await helper(DENVER_HELPER);
  const [austin] = await db.select().from(markets).where(eq(markets.id, 'mkt_austin'));
  await db.insert(markets).values({ ...austin!, id: DALLAS, slug: 'test-nat-dallas', name: 'Dallas', status: 'paused', zipPrefixes: ['752'], centerLat: 32.7767, centerLng: -96.797 });
  await db.insert(markets).values({ ...austin!, id: NEW_YORK, slug: 'test-nat-newyork', name: 'New York', state: 'NY', status: 'paused', timeZone: 'America/New_York', zipPrefixes: ['100'], centerLat: 40.7128, centerLng: -74.006 });
  await db.insert(markets).values({ ...austin!, id: ABROAD, slug: 'test-nat-madrid', name: 'Madrid', state: 'MD', status: 'paused', timeZone: 'Europe/Madrid', zipPrefixes: ['999'], centerLat: 40.7128, centerLng: -74.006 });
});

afterAll(async () => {
  const people = [DALLAS_HELPER, DENVER_HELPER];
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, people));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'config.market_status'), inArray(auditLog.targetId, [DALLAS, NEW_YORK, ABROAD])));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, people));
  await db.delete(users).where(inArray(users.id, people));
  // The city areas helpers were placed in inside the test markets (Austin's city areas can be shared, so they stay).
  await db.delete(areas).where(inArray(areas.marketId, [DALLAS, NEW_YORK, ABROAD]));
  await db.delete(markets).where(inArray(markets.id, [DALLAS, NEW_YORK, ABROAD]));
  await db.delete(waitlistEntries).where(like(waitlistEntries.email, 'nat-%@example.test'));
  await pool.end();
});

describe('a helper anywhere in the US (owner, 2026-11-23: "remove the limit of Location totally")', () => {
  it('saves a ZIP and city and helps from their city: an area of their market, nobody waits, the home address is next', async () => {
    expect(await saveHelperArea(db, DALLAS_HELPER, { where: 'elsewhere', areaId: '', homeZip: '75204', homeCity: '  dallas ', ...area }, now)).toEqual({ ok: true, code: 'saved' });
    const [profile] = await db.select({ areaId: helperProfiles.areaId, homeZip: helperProfiles.homeZip, homeCity: helperProfiles.homeCity, homeState: helperProfiles.homeState, status: helperProfiles.status, slug: areas.slug, marketId: areas.marketId })
      .from(helperProfiles).innerJoin(areas, eq(areas.id, helperProfiles.areaId)).where(eq(helperProfiles.userId, DALLAS_HELPER));
    // Dallas isn't open: their city's area in their own market (Austin), the ZIP kept for the background check's rules.
    expect(profile).toMatchObject({ slug: 'city-dallas-tx', marketId: 'mkt_austin', homeZip: '75204', homeCity: 'Dallas', homeState: 'TX', status: 'draft' });
    const state = await loadOnboardingState(db, DALLAS_HELPER, now);
    expect(state.facts.areaSet).toBe(true);
    const steps = Object.fromEntries(computeOnboarding(state.facts).progress.steps.map((step) => [step.step, step.state]));
    expect(steps.area).toBe('done');
    expect(steps.address).not.toBe('later');
  });

  it('places a ZIP in their own market in its nearest neighborhood, refuses one it can’t place, and a neighborhood clears the ZIP', async () => {
    expect(await saveHelperArea(db, DENVER_HELPER, { where: 'elsewhere', areaId: '', homeZip: '78723', homeCity: 'Austin', ...area }, now)).toEqual({ ok: true, code: 'saved' });
    const [inAustin] = await db.select({ slug: areas.slug, homeZip: helperProfiles.homeZip }).from(helperProfiles).innerJoin(areas, eq(areas.id, helperProfiles.areaId)).where(eq(helperProfiles.userId, DENVER_HELPER));
    expect(inAustin!.slug.startsWith('city-')).toBe(false);
    expect(inAustin!.homeZip).toBeNull();
    expect(await saveHelperArea(db, DENVER_HELPER, { where: 'elsewhere', areaId: '', homeZip: '09001', homeCity: 'Base', ...area }, now)).toMatchObject({ ok: false, fieldErrors: { homeZip: ['not_supported'] } });
    expect(await saveHelperArea(db, DENVER_HELPER, { where: 'elsewhere', areaId: '', homeZip: '', homeCity: '', ...area }, now)).toMatchObject({ ok: false, code: 'validation_failed' });

    await saveHelperArea(db, DENVER_HELPER, { where: 'elsewhere', areaId: '', homeZip: '80202', homeCity: 'Denver', ...area }, now);
    await saveHelperArea(db, DENVER_HELPER, { areaId: 'area_mueller', ...area }, now);
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, DENVER_HELPER));
    expect(profile).toMatchObject({ areaId: 'area_mueller', homeZip: null, homeCity: null, homeState: null });
    // Back to Denver for the waitlist counts below.
    await saveHelperArea(db, DENVER_HELPER, { where: 'elsewhere', areaId: '', homeZip: '80202', homeCity: 'Denver', ...area }, now);
  });
});

describe('the waitlist across the US', () => {
  it('keeps the city typed and the ZIP’s state, and counts people near a ZIP by its first three digits', async () => {
    await joinWaitlist(db, { email: 'nat-1@example.test', zip: '80205', city: 'denver, co', interest: 'need_help' }, now);
    await joinWaitlist(db, { email: 'nat-2@example.test', zip: '80211', city: 'Denver', interest: 'both' }, now);
    await joinWaitlist(db, { email: 'nat-3@example.test', zip: '80301', interest: 'need_help' }, now);
    const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, 'nat-1@example.test'));
    expect(entry).toMatchObject({ city: 'Denver', state: 'CO' });

    // 802: two entries and the Denver helper; 803 (Boulder) is another prefix.
    expect(await waitlistDemand(db, '80220')).toEqual({ zip: '80220', state: 'CO', waiting: 2, helpersWaiting: 1 });
    expect(await waitlistDemand(db, '09001')).toBeNull();
  });

  it('gives a helper in their city Find work around them, never the market’s tasks far away', async () => {
    const denver = await getFindWorkPageData(db, DENVER_HELPER, {}, now);
    expect(denver?.waitingFor).toBeUndefined();
    // Austin's open tasks are about 770 miles away: only tasks posted around Denver (its city's area) are within reach.
    expect(denver!.cards.every((card) => card.task.location.kind === 'remote' || card.task.location.areaName.endsWith(', CO'))).toBe(true);
    const home = await getDashboard(db, { id: DENVER_HELPER, firstName: 'Pat', mode: 'helper', timeZone: 'America/Denver' }, {}, now);
    expect(home.waitingFor).toBeUndefined();
    // A helper with a neighborhood in an open market finds its tasks as before.
    const jordan = await getFindWorkPageData(db, 'usr_jordan', {}, now);
    expect(jordan!.cards.length).toBeGreaterThan(0);
  });

  it('lists cities with at least three people, outside the prefixes we cover', async () => {
    const next = await citiesComingNext(db, ['786', '787']);
    expect(next.find((city) => city.city === 'Denver' && city.state === 'CO')).toMatchObject({ people: 3, helpersWaiting: 1 });
    // Dallas has one waiting helper only: not listed.
    expect(next.some((city) => city.city === 'Dallas')).toBe(false);
    // A prefix we cover leaves the list.
    expect((await citiesComingNext(db, ['802'])).some((city) => city.city === 'Denver')).toBe(false);
  });

  it('marks the places people wait for on the landing map (owner, 2026-11-24: "Now I am in Austin"): paused cities, and metro areas of three or more', async () => {
    const places = await loadWaitingPlaces(db, 'all');
    // 802: two entries and the Denver helper, at the middle of their ZIPs; Boulder's one entry (803) is no place.
    const denver = places.find((place) => place.name === 'Denver' && place.state === 'CO');
    expect(denver?.waiting).toBe(3);
    expect(distanceMiles(denver!.point, { lat: 39.7392, lng: -104.9903 })).toBeLessThan(10);
    expect(places.filter((place) => place.state === 'CO')).toHaveLength(1);
    // A paused city is a place at its middle, its count hidden below three (Dallas has one waiting helper).
    expect(places.find((place) => place.name === 'Dallas' && place.state === 'TX')).toEqual({ name: 'Dallas', state: 'TX', point: { lat: 32.7767, lng: -96.797 }, waiting: 0 });
    expect(places.find((place) => place.name === 'New York')).toMatchObject({ state: 'NY', waiting: 0 });
    // Most people first.
    expect(places.map((place) => place.waiting)).toEqual(places.map((place) => place.waiting).sort((a, b) => b - a));
  });
});

describe('opening a market', () => {
  it('is for admins only, opens a market in another US zone, and refuses one whose dates are not checked', async () => {
    expect(await setMarketStatus(db, morgan, DALLAS, { status: 'prelaunch', reason: 'Opening Dallas' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    // Dates follow each market's own clock (completion plan 8.1): an Eastern market opens like a Central one.
    expect(await setMarketStatus(db, riley, NEW_YORK, { status: 'prelaunch', reason: 'Helpers first' }, now)).toEqual({ ok: true, code: 'updated' });
    const [york] = await db.select({ status: markets.status }).from(markets).where(eq(markets.id, NEW_YORK));
    expect(york!.status).toBe('prelaunch');
    expect(await setMarketStatus(db, riley, NEW_YORK, { status: 'paused', reason: 'Not opening it yet' }, now)).toEqual({ ok: true, code: 'updated' });
    // Outside the US zones: refused, live or pre-launch; pausing still works.
    expect(await setMarketStatus(db, riley, ABROAD, { status: 'live', reason: 'Opening Madrid' }, now)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { timeZone: ['not_supported'] } });
    expect(await setMarketStatus(db, riley, ABROAD, { status: 'prelaunch', reason: 'Helpers first' }, now)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { timeZone: ['not_supported'] } });
    const [abroad] = await db.select({ status: markets.status }).from(markets).where(eq(markets.id, ABROAD));
    expect(abroad!.status).toBe('paused');
  });

  it('brings in the helpers who waited there, tells them, and audits the change', async () => {
    expect(await setMarketStatus(db, riley, DALLAS, { status: 'prelaunch', reason: 'Opening Dallas to helpers' }, now)).toEqual({ ok: true, code: 'updated' });
    const [moved] = await db.select({ market: users.homeMarketId }).from(users).where(eq(users.id, DALLAS_HELPER));
    expect(moved!.market).toBe(DALLAS);
    // Where they help moved into Dallas: its nearest neighborhood to their ZIP, or their city's area in it.
    const [placed] = await db.select({ marketId: areas.marketId }).from(helperProfiles).innerJoin(areas, eq(areas.id, helperProfiles.areaId)).where(eq(helperProfiles.userId, DALLAS_HELPER));
    expect(placed!.marketId).toBe(DALLAS);
    const [stayed] = await db.select({ market: users.homeMarketId }).from(users).where(eq(users.id, DENVER_HELPER));
    expect(stayed!.market).toBe('mkt_austin');

    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, DALLAS_HELPER), eq(outboxEvents.type, 'verification.updated')));
    expect(events.map((event) => event.payload)).toContainEqual({ userId: DALLAS_HELPER, track: 'helper', outcome: 'city_open', city: 'Dallas' });

    expect((await loadOnboardingState(db, DALLAS_HELPER, now)).facts.areaSet).toBe(true);

    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, DALLAS)));
    expect(audit).toMatchObject({ actorId: 'usr_riley', reason: 'Opening Dallas to helpers', metadata: { from: 'paused', to: 'prelaunch', helpersBroughtIn: 1 } });

    // The same status again changes nothing.
    expect(await setMarketStatus(db, riley, DALLAS, { status: 'prelaunch', reason: 'Opening Dallas to helpers again' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await db.select().from(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, DALLAS)))).toHaveLength(1);
  });
});
