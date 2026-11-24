import type { PortalItem } from '@/contracts';

/** An item's key in the portal's stream: posts and tasks share ids' shapes, so the type comes first. */
export const keyOfItem = (item: PortalItem) => `${item.type}:${item.id}`;

/**
 * The first page read again while the reader is in the stream (a reaction, a reply, a save, the live pill), 2026-11-24:
 * what's new on it goes on top, and everything already shown keeps its place with its fresh content, so a post someone
 * just found helpful doesn't jump away under their finger (Hot and Top rank by what people do). What left the first
 * page goes, unless later pages are on screen too: then it may only have moved down, and `rereadStream` decides.
 */
export function refreshedStream(shown: readonly PortalItem[], previousFirst: readonly PortalItem[], first: readonly PortalItem[], laterLoaded: boolean): PortalItem[] {
  const fresh = new Map(first.map((item) => [keyOfItem(item), item]));
  const shownKeys = new Set(shown.map(keyOfItem));
  const left = new Set(previousFirst.map(keyOfItem).filter((key) => !fresh.has(key)));
  const kept = shown.flatMap((item) => {
    const key = keyOfItem(item);
    const current = fresh.get(key);
    if (current) return [current];
    return left.has(key) && !laterLoaded ? [] : [item];
  });
  return [...first.filter((item) => !shownKeys.has(keyOfItem(item))), ...kept];
}

/**
 * The later pages read again after the first page changed: what's in none of the pages now (deleted, hidden, no longer
 * matching) goes, the rest keeps its place with fresh content, and what moved up into these pages joins at the end.
 * Before, what the first page pushed into the second fell between the two, and a post deleted further down stayed.
 */
export function rereadStream(shown: readonly PortalItem[], first: readonly PortalItem[], later: readonly PortalItem[]): PortalItem[] {
  const fresh = new Map([...first, ...later].map((item) => [keyOfItem(item), item]));
  const kept = shown.flatMap((item) => {
    const current = fresh.get(keyOfItem(item));
    return current ? [current] : [];
  });
  const keptKeys = new Set(kept.map(keyOfItem));
  return [...kept, ...later.filter((item) => !keptKeys.has(keyOfItem(item)))];
}
