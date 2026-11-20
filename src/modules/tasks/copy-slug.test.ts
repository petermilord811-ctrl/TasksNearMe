import { describe, expect, it, vi } from 'vitest';
import { copySlug, withCopySlug } from './copy-slug';

/** What Postgres sends (wrapped by Drizzle) when the slug is taken. */
const taken = () => Object.assign(new Error('Failed query'), { cause: { code: '23505', constraint: 'tasks_slug_unique' } });

describe('copy slugs (repeats review #16)', () => {
  it('keeps the template’s words with 4 new characters', () => {
    expect(copySlug('mow-the-yard-northwest-hills-a1b2')).toMatch(/^mow-the-yard-northwest-hills-[0-9a-f]{4}$/);
  });

  it('tries another slug when one is taken, and gives up after three', async () => {
    const insert = vi.fn(async (slug: string) => {
      if (insert.mock.calls.length === 1) throw taken();
      return slug;
    });
    const slug = await withCopySlug('mow-the-yard-a1b2', insert);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(slug).toBe(insert.mock.calls[1]![0]);

    const always = vi.fn(async () => Promise.reject(taken()));
    await expect(withCopySlug('mow-the-yard-a1b2', always)).rejects.toThrow('Failed query');
    expect(always).toHaveBeenCalledTimes(3);
  });

  it('leaves every other error to the caller at once', async () => {
    const other = vi.fn(async () => Promise.reject(Object.assign(new Error('Failed query'), { cause: { code: '23505', constraint: 'bookings_series_visit_idx' } })));
    await expect(withCopySlug('mow-the-yard-a1b2', other)).rejects.toThrow('Failed query');
    expect(other).toHaveBeenCalledTimes(1);
  });
});
