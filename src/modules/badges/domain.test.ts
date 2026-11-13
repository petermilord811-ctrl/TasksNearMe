import { describe, expect, it } from 'vitest';
import { badgeCounts, badgeRank, reconcile, tierFor, type BadgeBooking, type BadgeCount } from './domain';

/** Completion plan 6.4: what counts toward each badge, the tiers, and what changes are stored. */

const start = new Date('2026-11-10T16:00:00.000Z');
let n = 0;
const booking = (over: Partial<BadgeBooking> = {}): BadgeBooking => ({
  id: `bkg_${(n += 1)}`,
  otherUserId: 'usr_client',
  category: 'furniture-assembly',
  startAt: start,
  paid: true,
  disputed: false,
  riskPair: false,
  struck: false,
  ...over,
});
const countOf = (counts: BadgeCount[], code: BadgeCount['code'], scope = '') => counts.find((item) => item.code === code && item.scope === scope)?.count;

describe('what counts', () => {
  it('counts completed, paid bookings, at most 3 per client', () => {
    const bookings = [
      ...Array.from({ length: 5 }, () => booking({ otherUserId: 'usr_a' })),
      booking({ otherUserId: 'usr_b' }),
      booking({ otherUserId: 'usr_c', paid: false }),
      booking({ otherUserId: 'usr_d', disputed: true }),
      booking({ otherUserId: 'usr_e', riskPair: true }),
    ];
    const counts = badgeCounts({ helper: { bookings } });
    // 3 of usr_a's 5, and usr_b's one; the unpaid, disputed and flagged ones never count.
    expect(countOf(counts, 'tasks_completed')).toBe(4);
    expect(countOf(counts, 'repeat_clients')).toBe(1);
  });

  it('counts five-star reviews, on-time arrivals (10 minutes’ grace, no strike) and regular visits', () => {
    const bookings = [
      booking({ rating: 5, arrivedAt: new Date(start.getTime() + 10 * 60_000) }),
      booking({ rating: 4, arrivedAt: new Date(start.getTime() + 11 * 60_000) }),
      booking({ rating: 5, arrivedAt: start, lateByMinutes: 20 }),
      booking({ arrivedAt: start, struck: true, seriesId: 'ser_1' }),
      booking({ arrivedAt: start, seriesId: 'ser_1' }),
    ];
    const counts = badgeCounts({ helper: { bookings } });
    expect(countOf(counts, 'five_star')).toBe(2);
    expect(countOf(counts, 'on_time')).toBe(2);
    expect(countOf(counts, 'regular_visits')).toBe(2);
  });

  it('makes a category pro only with a 4.8 average from at least 5 reviews there', () => {
    const rated = (rating: number) => booking({ otherUserId: `usr_${(n += 1)}`, category: 'moving-help', rating });
    const four = badgeCounts({ helper: { bookings: [rated(5), rated(5), rated(5), rated(5)] } });
    expect(countOf(four, 'category_pro', 'moving-help')).toBe(0);
    const five = badgeCounts({ helper: { bookings: [rated(5), rated(5), rated(5), rated(5), rated(5), booking({ category: 'moving-help' })] } });
    expect(countOf(five, 'category_pro', 'moving-help')).toBe(6);
    const lower = badgeCounts({ helper: { bookings: [rated(5), rated(5), rated(5), rated(4), rated(4)] } });
    expect(countOf(lower, 'category_pro', 'moving-help')).toBe(0);
  });

  it('gives the founding badge with a founding number, and counts clients’ own badges', () => {
    const counts = badgeCounts({
      helper: { bookings: [], foundingNumber: 12 },
      client: { bookings: [booking({ otherUserId: 'usr_h', seriesId: 'ser_9' }), booking({ otherUserId: 'usr_h', seriesId: 'ser_9', rating: 5 })] },
    });
    expect(countOf(counts, 'founding_helper')).toBe(1);
    expect(countOf(counts, 'client_bookings')).toBe(2);
    expect(countOf(counts, 'client_regular')).toBe(2);
    expect(countOf(counts, 'client_five_star')).toBe(1);
  });
});

describe('tiers', () => {
  it('follow each badge’s thresholds', () => {
    expect(tierFor('tasks_completed', 0)).toBe(0);
    expect(tierFor('tasks_completed', 1)).toBe(1);
    expect(tierFor('tasks_completed', 24)).toBe(2);
    expect(tierFor('tasks_completed', 100)).toBe(5);
    expect(tierFor('founding_helper', 1)).toBe(1);
  });

  it('put the founding badge first, then the share of tiers reached', () => {
    expect(badgeRank({ code: 'founding_helper', tier: 1 })).toBeGreaterThan(badgeRank({ code: 'tasks_completed', tier: 5 }));
    expect(badgeRank({ code: 'on_time', tier: 3 })).toBeGreaterThan(badgeRank({ code: 'tasks_completed', tier: 2 }));
  });
});

describe('reconcile', () => {
  it('announces new badges and higher tiers, lowers quietly, and leaves revoked ones alone', () => {
    const changes = reconcile(
      [
        { code: 'tasks_completed', scope: '', tier: 1, revoked: false },
        { code: 'five_star', scope: '', tier: 2, revoked: false },
        { code: 'on_time', scope: '', tier: 1, revoked: true },
        { code: 'category_pro', scope: 'yard-cleanup', tier: 1, revoked: false },
      ],
      [
        { code: 'tasks_completed', scope: '', count: 10 },
        { code: 'five_star', scope: '', count: 6 },
        { code: 'on_time', scope: '', count: 30 },
        { code: 'repeat_clients', scope: '', count: 1 },
        { code: 'regular_visits', scope: '', count: 0 },
      ],
    );
    expect(changes).toEqual([
      { code: 'tasks_completed', scope: '', tier: 2, kind: 'earned' },
      { code: 'five_star', scope: '', tier: 1, kind: 'lowered' },
      { code: 'repeat_clients', scope: '', tier: 1, kind: 'earned' },
      // The category no longer counts at all.
      { code: 'category_pro', scope: 'yard-cleanup', tier: 0, kind: 'lowered' },
    ]);
  });

  it('changes nothing the second time', () => {
    const counts: BadgeCount[] = [{ code: 'tasks_completed', scope: '', count: 10 }];
    expect(reconcile([{ code: 'tasks_completed', scope: '', tier: 2, revoked: false }], counts)).toEqual([]);
  });
});
