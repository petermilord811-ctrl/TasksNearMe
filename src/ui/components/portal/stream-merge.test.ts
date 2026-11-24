import { describe, expect, it } from 'vitest';
import type { PortalItem } from '@/contracts';
import { portalFeedData } from '@/fixtures';
import { keyOfItem, refreshedStream, rereadStream } from './stream-merge';

// Seven posts from the canonical feed, named a…g; `v` marks a fresh copy (new counts after a reaction).
const [a, b, c, d, e, f, g] = portalFeedData.items as [PortalItem, PortalItem, PortalItem, PortalItem, PortalItem, PortalItem, PortalItem];
const fresh = (item: PortalItem): PortalItem => (item.type === 'post' ? { ...item, post: { ...item.post, replyCount: item.post.replyCount + 1 } } : item);
const keys = (items: readonly PortalItem[]) => items.map(keyOfItem);

describe('the stream after the first page is read again (2026-11-24)', () => {
  it('keeps what is shown in place, fresh, and puts what is new on top', () => {
    // A reaction moved c above b on the first page, and a new post (g) came in at the top.
    const merged = refreshedStream([a, b, c], [a, b, c], [g, a, fresh(c), b], false);
    expect(keys(merged)).toEqual(keys([g, a, b, c]));
    expect(merged[3]).toEqual(fresh(c));
  });

  it('drops what left the first page when no later page is on screen', () => {
    // c was deleted (or moved to page 2, which will bring it back when it loads).
    expect(keys(refreshedStream([a, b, c], [a, b, c], [a, b], false))).toEqual(keys([a, b]));
  });

  it('keeps what left the first page while later pages are on screen, until they are read again', () => {
    // Page 1 was a, b, c; page 2 d, e. A reaction lifted e into page 1, pushing c down to page 2.
    const shown = [a, b, c, d, e];
    const merged = refreshedStream(shown, [a, b, c], [a, e, b], true);
    expect(keys(merged)).toEqual(keys([a, b, c, d, e]));
    // Page 2 read again: c and d; nothing is lost and nothing jumps.
    expect(keys(rereadStream(merged, [a, e, b], [c, d]))).toEqual(keys([a, b, c, d, e]));
  });

  it('drops what is in none of the pages after they are read again, and adds what moved up into them', () => {
    // d was deleted on page 2; f moved up from page 3 into page 2.
    const merged = rereadStream([a, b, c, d, e], [a, b, c], [e, f]);
    expect(keys(merged)).toEqual(keys([a, b, c, e, f]));
  });
});
