import { describe, expect, it } from 'vitest';
import { directChatsPerDay, earnedSparks, nextSparkLevel, sparkLevel, sparksSummary } from './domain';

const none = { postsPerDay: [], repliesPerDay: [], helpful: 0, thanks: 0, bookings: 0, reviews: 0 };

describe('Sparks (2026-11-21)', () => {
  it('reaches each level at its threshold', () => {
    expect(sparkLevel(0)).toBe('newcomer');
    expect(sparkLevel(49)).toBe('newcomer');
    expect(sparkLevel(50)).toBe('neighbor');
    expect(sparkLevel(250)).toBe('good_neighbor');
    expect(sparkLevel(999)).toBe('good_neighbor');
    expect(sparkLevel(1000)).toBe('pillar');
    expect(sparkLevel(5000)).toBe('local_legend');
    expect(nextSparkLevel(0)).toEqual({ level: 'neighbor', at: 50 });
    expect(nextSparkLevel(300)).toEqual({ level: 'pillar', at: 1000 });
    expect(nextSparkLevel(5000)).toBeUndefined();
  });

  it('allows more direct conversations a day by level, and at least 40 with a plan', () => {
    expect(directChatsPerDay(0, false)).toBe(10);
    expect(directChatsPerDay(60, false)).toBe(15);
    expect(directChatsPerDay(300, false)).toBe(25);
    expect(directChatsPerDay(0, true)).toBe(40);
    expect(directChatsPerDay(6000, true)).toBe(60);
  });

  it('counts posts and replies up to their daily caps, and every reaction, booking and review', () => {
    const { earned, breakdown } = earnedSparks({ postsPerDay: [5, 1], repliesPerDay: [12, 3], helpful: 4, thanks: 2, bookings: 3, reviews: 1 });
    // Posts: 3 + 1 = 4 × 5; replies: 10 + 3 = 13 × 2; helpful 4 × 3; thanks 2 × 2; bookings 3 × 10; reviews 1 × 2.
    expect(breakdown).toEqual([
      { source: 'posts', count: 4, points: 20 },
      { source: 'replies', count: 13, points: 26 },
      { source: 'helpful', count: 4, points: 12 },
      { source: 'thanks', count: 2, points: 4 },
      { source: 'bookings', count: 3, points: 30 },
      { source: 'reviews', count: 1, points: 2 },
    ]);
    expect(earned).toBe(94);
    expect(earnedSparks(none).earned).toBe(0);
  });

  it('shows the bought part beside the total, and nothing for someone with none', () => {
    expect(sparksSummary(40, 100)).toEqual({ total: 140, bought: 100, level: 'neighbor' });
    expect(sparksSummary(60, 0)).toEqual({ total: 60, bought: 0, level: 'neighbor' });
    expect(sparksSummary(0, 0)).toBeUndefined();
  });
});
