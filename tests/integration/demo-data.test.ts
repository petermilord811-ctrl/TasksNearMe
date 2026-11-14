/**
 * The demo marketplace (db/seeds/demo) in the database, read back through the app's own queries: helpers are
 * bookable by the app's onboarding rules, every live offer passes the offer rules with the facts the app loads,
 * the board lists the open tasks, profiles show the ratings their reviews give, and booking pages open.
 *
 * Written in a transaction that is rolled back, so the shared test database keeps only the base seed.
 */
import { and, eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getBookingView } from '@/modules/bookings/hub';
import { marketPolicies } from '@/modules/markets/schema';
import { offerBlockedReason } from '@/modules/offers/helper-domain';
import { getFindWorkPageData, loadHelperState } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { getHelperProfile } from '@/modules/profiles/queries';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { listBoardTasks } from '@/modules/tasks/queries';
import { categories } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb, type Db } from '@/platform/db/connect';
import { buildDemoPlan } from '../../db/seeds/demo/plan';
import { writeDemoPlan } from '../../db/seeds/demo/write';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());

class Rollback extends Error {}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

describe('the demo marketplace in the database', () => {
  it('writes again on the next deploy without leftovers, and the app reads it like real activity', async () => {
    const key = process.env.FIELD_ENCRYPTION_KEY ?? '';
    const [policy] = await db.select().from(marketPolicies).where(and(eq(marketPolicies.marketId, 'mkt_austin'), eq(marketPolicies.status, 'published'))).limit(1);
    const first = new Date();
    const next = new Date(first.getTime() + 26 * 3_600_000);
    const later = buildDemoPlan({ now: next, fees: policy!.fees, policyId: policy!.id });

    await db
      .transaction(async (tx) => {
        const d = tx as unknown as Db;
        // Today's deploy, then tomorrow's (times move up; some tasks change state).
        await writeDemoPlan(tx, buildDemoPlan({ now: first, fees: policy!.fees, policyId: policy!.id }), key);
        await writeDemoPlan(tx, later, key);

        // Exactly the latest plan: no offers left over from the first run, offer counts that match.
        const demoOffers = await tx.select().from(offers).where(like(offers.id, 'off\\_demo\\_%'));
        expect(demoOffers.length).toBe(later.offers.length);
        const demoTasks = await tx.select().from(tasks).where(like(tasks.id, 'tsk\\_demo\\_%'));
        expect(demoTasks.filter((task) => task.status === 'open').length).toBe(later.tasks.filter((task) => task.status === 'open').length);
        for (const task of demoTasks) {
          expect(task.offerCount, task.id).toBe(demoOffers.filter((offer) => offer.taskId === task.id && offer.status === 'pending').length);
        }

        // Helpers are bookable by the app's own rules, and every live offer is one the app would take now.
        const categorySlug = new Map((await tx.select().from(categories)).map((row) => [row.id, row]));
        const helperIds = later.people.filter((person) => person.helper).map((person) => person.id);
        for (const helperId of helperIds) {
          const state = await loadHelperState(d, helperId, next);
          const person = later.people.find((p) => p.id === helperId)!;
          const offered = person.helper!.services.map((service) => categorySlug.get(service.categoryId)!.slug);
          expect(state.facts.bookableCategories.length, helperId).toBeGreaterThan(0);
          expect([...state.facts.bookableCategories].sort(), helperId).toEqual(
            offered.filter((slug) => !categorySlug.get(`cat_${slug.replaceAll('-', '_')}`)!.requiresBackgroundCheck || person.helper!.backgroundCheckedAt).sort(),
          );
          for (const offer of demoOffers.filter((o) => o.helperUserId === helperId && o.status === 'pending')) {
            const task = demoTasks.find((t) => t.id === offer.taskId)!;
            const category = categorySlug.get(task.categoryId)!;
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

        // Find work shows a helper their live offers.
        const busiest = helperIds.map((id) => [id, demoOffers.filter((o) => o.helperUserId === id && o.status === 'pending').length] as const).sort((a, b) => b[1] - a[1])[0]!;
        const findWork = await getFindWorkPageData(d, busiest[0], { distance: 'any' }, next);
        expect(findWork!.cards.filter((card) => card.myOffer?.status === 'pending').length).toBeGreaterThan(0);

        // The public board lists the open demo tasks with the base seed's.
        const board = await listBoardTasks(d, { marketId: 'mkt_austin', query: parseTaskBoardQuery({}), now: next });
        expect(board.totalCount).toBeGreaterThanOrEqual(later.tasks.filter((task) => task.status === 'open').length);

        // A profile shows the rating its published reviews give, and the work it completed.
        const rated = later.people.filter((person) => person.helper).map((person) => {
          const published = later.bookings.flatMap((b) => b.reviews).filter((r) => r.subjectUserId === person.id && r.direction === 'client_to_helper' && r.status === 'published');
          return { person, published };
        }).sort((a, b) => b.published.length - a.published.length)[0]!;
        const profile = await getHelperProfile(rated.person.helper!.handle, d);
        expect(profile?.helper.rating?.count).toBe(rated.published.length);
        expect(profile?.helper.rating?.average).toBe(Math.round((rated.published.reduce((sum, r) => sum + r.rating, 0) / rated.published.length) * 10) / 10);
        expect(profile?.helper.completedCount).toBe(later.helperStats.find((s) => s.userId === rated.person.id)!.completedCount);
        expect(profile?.reviews.length).toBeGreaterThan(0);

        // Booking pages open for both people, in the booking's state.
        const hub = { db: d, cipher: fieldCipherFromEnv() };
        for (const status of ['completed', 'confirmed'] as const) {
          const booking = later.bookings.find((b) => b.status === status)!;
          expect((await getBookingView(hub, booking.posterUserId, booking.id, next))?.status, booking.id).toBe(status);
          expect((await getBookingView(hub, booking.helperUserId, booking.id, next))?.status, booking.id).toBe(status);
        }

        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
