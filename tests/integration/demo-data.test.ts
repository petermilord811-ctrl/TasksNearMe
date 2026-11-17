/**
 * The demo marketplace (db/seeds/demo) in the database, read back through the app's own queries: the demo markets
 * are public, helpers are bookable by the app's onboarding rules, every live offer passes the offer rules with the
 * facts the app loads, the boards list the open tasks, profiles show the ratings their reviews give, and booking
 * pages open.
 *
 * Written in a transaction that is rolled back, so the shared test database keeps only the base seed.
 */
import { like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getBookingView } from '@/modules/bookings/hub';
import { categories } from '@/modules/markets/schema';
import { findPublicMarket, listCategoryViews } from '@/modules/markets/queries';
import { offerBlockedReason } from '@/modules/offers/helper-domain';
import { getFindWorkPageData, loadHelperState } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { listBoardTasks } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb, type Db } from '@/platform/db/connect';
import { DEMO_MARKETS, demoMarketId } from '../../db/seeds/demo/markets';
import { buildDemoPlan } from '../../db/seeds/demo/plan';
import { loadDemoPolicies, writeDemoMarkets, writeDemoPlan } from '../../db/seeds/demo/write';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());

class Rollback extends Error {}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

describe('the demo marketplace in the database', () => {
  it('writes again on the next deploy without leftovers, and the app reads it like real activity', { timeout: 300_000 }, async () => {
    const key = process.env.FIELD_ENCRYPTION_KEY ?? '';
    const first = new Date();
    const next = new Date(first.getTime() + 26 * 3_600_000);

    await db
      .transaction(async (tx) => {
        const d = tx as unknown as Db;
        await writeDemoMarkets(tx);
        const policies = await loadDemoPolicies(tx);
        // Today's deploy, then tomorrow's (times move up; some tasks change state).
        await writeDemoPlan(tx, buildDemoPlan({ now: first, policies }), key);
        await writeDemoMarkets(tx);
        const later = buildDemoPlan({ now: next, policies: await loadDemoPolicies(tx) });
        await writeDemoPlan(tx, later, key);

        // Every demo market is public with its categories, like Gainesville.
        for (const market of DEMO_MARKETS) {
          expect(await findPublicMarket(market.slug, d), market.slug).not.toBeNull();
          expect((await listCategoryViews(demoMarketId(market), d)).length, market.slug).toBe(5);
        }

        // Exactly the latest plan: no offers left over from the first run, offer counts that match.
        const demoOffers = await tx.select().from(offers).where(like(offers.id, 'off\\_demo\\_%'));
        expect(demoOffers.length).toBe(later.offers.length);
        const demoTasks = await tx.select().from(tasks).where(like(tasks.id, 'tsk\\_demo\\_%'));
        expect(demoTasks.filter((task) => task.status === 'open').length).toBe(later.tasks.filter((task) => task.status === 'open').length);
        const pendingByTask = new Map<string, number>();
        for (const offer of demoOffers.filter((o) => o.status === 'pending')) pendingByTask.set(offer.taskId, (pendingByTask.get(offer.taskId) ?? 0) + 1);
        for (const task of demoTasks) expect(task.offerCount, task.id).toBe(pendingByTask.get(task.id) ?? 0);

        // Helpers are bookable by the app's own rules, and every live offer is one the app would take now
        // (all of Gainesville's, the hand-written cast, and every third elsewhere, so the check stays quick).
        const categoryRows = new Map((await tx.select().from(categories)).map((row) => [row.id, row]));
        const helpers = later.people.filter((person) => person.helper).filter((person, index) => person.homeMarketId === 'mkt_gainesville' || index % 3 === 0);
        for (const person of helpers) {
          const state = await loadHelperState(d, person.id, next);
          expect(state.marketId, person.id).toBe(person.homeMarketId);
          const offered = person.helper!.services.map((service) => categoryRows.get(service.categoryId)!);
          expect([...state.facts.bookableCategories].sort(), person.id).toEqual(
            offered.filter((category) => !category.requiresBackgroundCheck || person.helper!.backgroundCheckedAt).map((category) => category.slug).sort(),
          );
          for (const offer of demoOffers.filter((o) => o.helperUserId === person.id && o.status === 'pending')) {
            const task = demoTasks.find((t) => t.id === offer.taskId)!;
            const category = categoryRows.get(task.categoryId)!;
            const blocked = offerBlockedReason(
              state.facts,
              {
                posterUserId: task.posterUserId,
                status: task.status,
                hidden: task.hiddenAt !== null,
                windowEnd: task.windowEnd,
                categorySlug: category.slug as never,
                requiresBackgroundCheck: category.requiresBackgroundCheck,
                remote: task.mode === 'remote',
                distanceMiles: task.mode === 'remote' || !state.center ? null : milesBetween(state.center, { lat: task.publicLat!, lng: task.publicLng! }),
              },
              next,
            );
            expect(blocked, offer.id).toBeUndefined();
          }
        }

        // Find work shows a Pretty Prairie helper their live offers, and only work in their own market.
        const prairieHelpers = later.people.filter((person) => person.homeMarketId === 'mkt_demo_pp' && person.helper);
        const busiest = prairieHelpers.map((person) => [person.id, demoOffers.filter((o) => o.helperUserId === person.id && o.status === 'pending').length] as const).sort((a, b) => b[1] - a[1])[0]!;
        const findWork = await getFindWorkPageData(d, busiest[0], { distance: 'any' }, next);
        expect(findWork!.cards.filter((card) => card.myOffer?.status === 'pending').length).toBeGreaterThan(0);
        const prairieTaskIds = new Set(later.tasks.filter((task) => task.marketId === 'mkt_demo_pp').map((task) => task.id));
        expect(findWork!.cards.every((card) => prairieTaskIds.has(card.task.id))).toBe(true);

        // The public boards list each market's open tasks: Gainesville's with the base seed's, Pretty Prairie's exactly.
        const gainesvilleBoard = await listBoardTasks(d, { marketId: 'mkt_gainesville', query: parseTaskBoardQuery({}), now: next });
        expect(gainesvilleBoard.totalCount).toBeGreaterThanOrEqual(later.tasks.filter((task) => task.marketId === 'mkt_gainesville' && task.status === 'open').length);
        const prairieBoard = await listBoardTasks(d, { marketId: 'mkt_demo_pp', query: parseTaskBoardQuery({}), now: next });
        expect(prairieBoard.totalCount).toBe(later.tasks.filter((task) => task.marketId === 'mkt_demo_pp' && task.status === 'open').length);

        // A profile shows the rating its published reviews give, and the work it completed.
        const rated = later.people
          .filter((person) => person.helper)
          .map((person) => ({ person, published: later.bookings.flatMap((b) => b.reviews).filter((r) => r.subjectUserId === person.id && r.direction === 'client_to_helper' && r.status === 'published') }))
          .sort((a, b) => b.published.length - a.published.length)[0]!;
        const profile = await getHelperProfile(rated.person.helper!.handle, d);
        expect(profile?.helper.rating?.count).toBe(rated.published.length);
        expect(profile?.helper.rating?.average).toBe(Math.round((rated.published.reduce((sum, r) => sum + r.rating, 0) / rated.published.length) * 10) / 10);
        expect(profile?.helper.completedCount).toBe(later.helperStats.find((s) => s.userId === rated.person.id)!.completedCount);
        expect(profile?.reviews.length).toBeGreaterThan(0);

        // Booking pages open for both people, in the booking's state, in Gainesville and beyond.
        const hub = { db: d, cipher: fieldCipherFromEnv() };
        for (const marketId of ['mkt_gainesville', 'mkt_demo_pp', 'mkt_demo_chi']) {
          for (const status of ['completed', 'confirmed'] as const) {
            const booking = later.bookings.find((b) => b.marketId === marketId && b.status === status)!;
            expect((await getBookingView(hub, booking.posterUserId, booking.id, next))?.status, booking.id).toBe(status);
            expect((await getBookingView(hub, booking.helperUserId, booking.id, next))?.status, booking.id).toBe(status);
          }
        }

        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
