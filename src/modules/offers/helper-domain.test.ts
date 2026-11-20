import { describe, expect, it } from 'vitest';
import { helperDeskWithOffer, helperMovingHourly } from '@/fixtures';
import {
  distanceBandOf,
  helperOfferActions,
  maxMilesOf,
  offerBlockedReason,
  offerExpiresAt,
  offerRulesFor,
  type HelperOfferFacts,
  type TaskOfferFacts,
} from './helper-domain';

const now = new Date('2026-11-17T15:00:00.000Z'); // Tue 9:00 am in Austin
const jordan: HelperOfferFacts = {
  userId: 'usr_jordan',
  bookableCategories: ['furniture-assembly', 'moving-help', 'yard-cleanup'],
  offeredCategories: ['furniture-assembly', 'moving-help', 'yard-cleanup'],
  suspended: false,
  serviceRadiusMiles: 5,
};
const desk: TaskOfferFacts = {
  posterUserId: 'usr_maya',
  status: 'open',
  windowStart: new Date('2026-11-21T16:00:00.000Z'),
  windowEnd: new Date('2026-11-21T19:00:00.000Z'),
  categorySlug: 'furniture-assembly',
  requiresBackgroundCheck: false,
  remote: false,
  distanceMiles: 2.1,
};

describe('offer rules', () => {
  it('a bookable helper may offer within their area', () => {
    expect(offerBlockedReason(jordan, desk, now)).toBeUndefined();
  });

  it('blocks in a fixed order: own task, closed, not bookable, category, background check, area', () => {
    expect(offerBlockedReason(jordan, { ...desk, posterUserId: 'usr_jordan', status: 'canceled' }, now)).toBe('own_task');
    expect(offerBlockedReason(jordan, { ...desk, status: 'assigned' }, now)).toBe('task_closed');
    expect(offerBlockedReason(jordan, { ...desk, windowStart: now, windowEnd: now }, now)).toBe('task_closed');
    // Offers expire at the window's start (blueprint 03): once it has started, one sent now would be dead on arrival.
    expect(offerBlockedReason(jordan, { ...desk, windowStart: now, windowEnd: new Date(now.getTime() + 3_600_000) }, now)).toBe('task_closed');
    // Its poster suspended, banned or deleted: closed, as the feeds leave it out (sweep PT10).
    expect(offerBlockedReason(jordan, { ...desk, posterInactive: true }, now)).toBe('task_closed');
    expect(offerBlockedReason({ ...jordan, bookableCategories: [] }, desk, now)).toBe('not_bookable');
    expect(offerBlockedReason({ ...jordan, suspended: true }, desk, now)).toBe('not_bookable');
    expect(offerBlockedReason(jordan, { ...desk, categorySlug: 'computer-help' }, now)).toBe('category_not_offered');
    const cleaner = { ...jordan, offeredCategories: [...jordan.offeredCategories, 'light-cleaning' as const] };
    expect(offerBlockedReason(cleaner, { ...desk, categorySlug: 'light-cleaning', requiresBackgroundCheck: true }, now)).toBe(
      'needs_background_check',
    );
    expect(offerBlockedReason(jordan, { ...desk, distanceMiles: 7 }, now)).toBe('outside_area');
    expect(offerBlockedReason(jordan, { ...desk, remote: true, distanceMiles: null, categorySlug: 'moving-help' }, now)).toBeUndefined();
  });

  it('expires at the window start or after 72 hours', () => {
    expect(offerExpiresAt(new Date('2026-11-21T16:00:00.000Z'), now).toISOString()).toBe('2026-11-20T15:00:00.000Z');
    expect(offerExpiresAt(new Date('2026-11-18T16:00:00.000Z'), now).toISOString()).toBe('2026-11-18T16:00:00.000Z');
  });

  it('builds the form rules from the window, as in the fixtures', () => {
    const deskRules = offerRulesFor(
      { windowStart: new Date('2026-11-21T16:00:00.000Z'), windowEnd: new Date('2026-11-21T19:00:00.000Z'), pricingType: 'fixed', estimatedHours: null },
      { minPriceCents: 2500 }, 'America/Chicago');
    expect(deskRules).toEqual(helperDeskWithOffer.offerRules);
    const movingRules = offerRulesFor(
      { windowStart: new Date('2026-11-22T15:00:00.000Z'), windowEnd: new Date('2026-11-22T19:00:00.000Z'), pricingType: 'hourly', estimatedHours: 3.5 },
      { minPriceCents: 3500 }, 'America/Chicago');
    expect(movingRules).toEqual(helperMovingHourly.offerRules);
  });

  it('shows distances as bands and filters by miles', () => {
    expect([0.3, 1.2, 2.1, 4.8, 9].map(distanceBandOf)).toEqual(['under-1-mi', 'about-1-mi', 'about-2-mi', 'about-5-mi', 'over-5-mi']);
    expect(maxMilesOf('any')).toBeNull();
    expect(maxMilesOf('within_5_mi')).toBe(5);
  });

  it('offers revise and withdraw on a pending offer, and re-confirm first on a stale one', () => {
    const task = { status: 'open', windowEnd: desk.windowEnd };
    expect(helperOfferActions({ status: 'pending' }, task, now).map((a) => a.id)).toEqual(['revise_offer', 'message_poster', 'withdraw_offer']);
    expect(helperOfferActions({ status: 'stale' }, task, now).map((a) => a.id)).toEqual(['reconfirm_offer', 'revise_offer', 'message_poster', 'withdraw_offer']);
    expect(helperOfferActions({ status: 'declined' }, task, now)).toEqual([]);
    expect(helperOfferActions({ status: 'accepted' }, { ...task, status: 'assigned' }, now).map((a) => a.id)).toEqual(['message_poster']);
    expect(helperOfferActions({ status: 'pending' }, { ...task, status: 'assigned' }, now)).toEqual([]);
  });
});
