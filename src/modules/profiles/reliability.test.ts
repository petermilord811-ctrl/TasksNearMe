import { describe, expect, it } from 'vitest';
import { NO_HISTORY, byReliability, isReliable, reliabilityScore, type ReliabilityFacts } from './reliability';

const facts = (over: Partial<ReliabilityFacts>): ReliabilityFacts => ({ ...NO_HISTORY, ...over });

describe('reliability', () => {
  it('starts a new helper in the middle, and climbs with kept bookings', () => {
    expect(reliabilityScore(NO_HISTORY)).toBe(0.75);
    expect(reliabilityScore(facts({ completed: 10 }))).toBeGreaterThan(reliabilityScore(facts({ completed: 2 })));
    expect(reliabilityScore(facts({ completed: 40 }))).toBeLessThan(1);
  });

  it('weighs a no-show more than a cancellation, and a strike on top', () => {
    const canceled = reliabilityScore(facts({ completed: 10, canceled: 1 }));
    const noShow = reliabilityScore(facts({ completed: 10, noShows: 1 }));
    const struck = reliabilityScore(facts({ completed: 10, canceled: 1, strikes: 1 }));
    expect(noShow).toBeLessThan(canceled);
    expect(struck).toBeLessThan(canceled);
    // One cancellation in a long record weighs less than in a short one.
    expect(reliabilityScore(facts({ completed: 30, canceled: 1 }))).toBeGreaterThan(reliabilityScore(facts({ completed: 3, canceled: 1 })));
  });

  it('marks as reliable only with enough work, no no-show or strike, and few cancellations', () => {
    expect(isReliable(facts({ completed: 5 }))).toBe(true);
    expect(isReliable(facts({ completed: 4 }))).toBe(false);
    expect(isReliable(facts({ completed: 9, canceled: 1 }))).toBe(true);
    expect(isReliable(facts({ completed: 8, canceled: 1 }))).toBe(false);
    expect(isReliable(facts({ completed: 30, noShows: 1 }))).toBe(false);
    expect(isReliable(facts({ completed: 30, strikes: 1 }))).toBe(false);
  });

  it('ranks the most reliable first, then completed work, rating and name', () => {
    const row = (name: string, over: Partial<ReliabilityFacts>, completedCount = 0, ratingAverage: number | null = null) => ({ name, facts: facts(over), completedCount, ratingAverage });
    const ranked = [
      row('Flaky', { completed: 6, noShows: 2 }, 6, 4.9),
      row('New', {}),
      row('Steady', { completed: 12 }, 12, 4.6),
      row('Also new', {}, 0, 4.8),
    ].sort(byReliability);
    expect(ranked.map((item) => item.name)).toEqual(['Steady', 'Also new', 'New', 'Flaky']);
  });
});
