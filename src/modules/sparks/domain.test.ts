import { describe, expect, it } from 'vitest';
import { CONTACT_LEVELS, HELPER_CONTACT_EARNED_MIN, SPARK_LEVELS } from '@/contracts';
import { directChatsPerDay, earnedSparks, nextSparkLevel, sparkLevel, sparksSummary } from './domain';

const none = { postsPerDay: [], repliesPerDay: [], helpful: 0, thanks: 0, bookings: 0, reviews: 0 };

describe('Sparks (2026-11-21)', () => {
  it('reaches each level at its threshold', () => {
    expect(sparkLevel(0)).toBe('newcomer');
    expect(sparkLevel(49)).toBe('newcomer');
    expect(sparkLevel(50)).toBe('neighbor');
    expect(sparkLevel(250)).toBe('good_neighbor');
    expect(sparkLevel(749)).toBe('good_neighbor');
    // Six milestones since 2026-11-24: Friendly face at 750, Pillar moved from 1,000 to 2,000.
    expect(sparkLevel(750)).toBe('friendly_face');
    expect(sparkLevel(1999)).toBe('friendly_face');
    expect(sparkLevel(2000)).toBe('pillar');
    expect(sparkLevel(4999)).toBe('pillar');
    expect(sparkLevel(5000)).toBe('local_legend');
    expect(nextSparkLevel(0)).toEqual({ level: 'neighbor', at: 50 });
    expect(nextSparkLevel(300)).toEqual({ level: 'friendly_face', at: 750 });
    expect(nextSparkLevel(1000)).toEqual({ level: 'pillar', at: 2000 });
    expect(nextSparkLevel(5000)).toBeUndefined();
  });

  it('opens shared contact details at the top two levels, from where Pillar starts', () => {
    expect(CONTACT_LEVELS).toEqual(['pillar', 'local_legend']);
    expect(HELPER_CONTACT_EARNED_MIN).toBe(2000);
    expect(SPARK_LEVELS.slice(-2)).toEqual([...CONTACT_LEVELS]);
  });

  it('allows more direct conversations a day by level, and at least 25 with Plus and 100 with Pro', () => {
    expect(directChatsPerDay(0, [])).toBe(3);
    expect(directChatsPerDay(60, [])).toBe(10);
    expect(directChatsPerDay(300, [])).toBe(25);
    expect(directChatsPerDay(800, [])).toBe(30);
    expect(directChatsPerDay(0, ['plus'])).toBe(25);
    // A plan never lowers a level's allowance.
    expect(directChatsPerDay(800, ['plus'])).toBe(30);
    expect(directChatsPerDay(2000, ['plus'])).toBe(40);
    expect(directChatsPerDay(6000, ['plus'])).toBe(60);
    expect(directChatsPerDay(0, ['pro'])).toBe(100);
    expect(directChatsPerDay(6000, ['plus', 'pro'])).toBe(100);
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
