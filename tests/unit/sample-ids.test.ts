import { describe, expect, it } from 'vitest';
import { newId } from '@/platform/db/ids';
import { isRealRecordId, isSampleId } from '@/shared/sample-data';
import { SEED_OFFERS } from '../../db/seeds/data/offers';
import { PEOPLE } from '../../db/seeds/data/people';
import { SEED_REVIEWS } from '../../db/seeds/data/profile-extras';
import { SEED_TASKS } from '../../db/seeds/data/tasks';
import { buildDemoCommunity } from '../../db/seeds/demo/community';
import { buildDemoPlan, defaultDemoPolicies } from '../../db/seeds/demo/plan';

/**
 * The rule that hides sample rows from the public (src/shared/sample-data.ts) rests on the id's form: every row the
 * app creates gets `newId` (Better Auth's users, sessions and accounts too, through `generateId`), and every row the
 * seeds write has a fixed or `_demo_` id. Both halves are checked here against the seeds themselves.
 */
describe('sample ids', () => {
  it('are never what the app generates, for any table prefix', () => {
    for (const prefix of ['usr', 'ses', 'acc', 'ver', 'pky', 'tsk', 'off', 'bkg', 'rev', 'cpo', 'cre']) {
      expect(isRealRecordId(newId(prefix)), prefix).toBe(true);
    }
  });

  it("cover the base seed's people, tasks, offers and reviews", () => {
    const ids = [...PEOPLE.map((person) => person.id), ...SEED_TASKS.map((task) => task.id), ...SEED_OFFERS.map((offer) => offer.id), ...SEED_REVIEWS.map((review) => review.id)];
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) expect(isSampleId(id), id).toBe(true);
  });

  it("cover the demo marketplace's people, tasks, offers, bookings, reviews and community", () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    const plan = buildDemoPlan({ now, policies: defaultDemoPolicies() });
    const community = buildDemoCommunity(plan, now);
    const ids = [
      ...plan.people.map((person) => person.id),
      ...plan.tasks.map((task) => task.id),
      ...plan.offers.map((offer) => offer.id),
      ...plan.bookings.flatMap((booking) => [booking.id, ...booking.reviews.map((review) => review.id)]),
      ...community.posts.map((post) => post.id),
      ...community.replies.map((reply) => reply.id),
    ];
    expect(ids.length).toBeGreaterThan(1000);
    for (const id of ids) expect(isSampleId(id), id).toBe(true);
  });
});
