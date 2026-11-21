import { describe, expect, it } from 'vitest';
import { handoffInDestination } from './forget-personal-drafts';
import { forgetPersonalDrafts, HANDOFF_DRAFT_KEY } from './personal-drafts';

/** A Storage stand-in: what's left after forgetting. */
function storage(keys: string[], values: Record<string, string> = {}) {
  const items = new Map(keys.map((key) => [key, values[key] ?? '{}']));
  return {
    get length() { return items.size; },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    removeItem: (key: string) => { items.delete(key); },
    keys: () => [...items.keys()].sort(),
  };
}

describe('forgetPersonalDrafts (sweep 2026-11-20)', () => {
  it("removes every person's posting and helper-setup drafts, and keeps what belongs to no account", () => {
    const tab = storage([
      'tasksnearme:post-task:gainesville:0123456789abcdef:v1',
      'tasksnearme:post-task:gainesville:fedcba9876543210:template:desk:v1',
      'tnm:helper-setup:usr_maya',
      'tnm:offer:tsk_desk',
      'tnm:offer:sent:tsk_desk',
      'tnm:question:tsk_desk',
      'tnm:assistant:help:v1',
      'tnm-map-intro',
    ]);
    forgetPersonalDrafts(tab);
    expect(tab.keys()).toEqual(['tnm-map-intro', 'tnm:assistant:help:v1']);
  });

  it("keeps a task drafted signed out only on its own handoff's pages, and clears it anywhere else (J-V5)", () => {
    const waiting = { [HANDOFF_DRAFT_KEY]: JSON.stringify({ code: 'c0de', draft: {} }) };
    const own = storage([HANDOFF_DRAFT_KEY, 'tasksnearme:post-task:gainesville:guest:v1'], waiting);
    forgetPersonalDrafts(own, 'c0de');
    // The draft on its way stays; the in-progress copy goes, as every other draft does.
    expect(own.keys()).toEqual([HANDOFF_DRAFT_KEY]);
    const other = storage([HANDOFF_DRAFT_KEY], waiting);
    forgetPersonalDrafts(other, 'another-code');
    expect(other.keys()).toEqual([]);
    const plain = storage([HANDOFF_DRAFT_KEY], waiting);
    forgetPersonalDrafts(plain);
    expect(plain.keys()).toEqual([]);
  });

  it("reads the handoff code from a sign-in or sign-up page's destination", () => {
    expect(handoffInDestination({ origin: 'https://tasksnearme.com', search: '?next=%2Fapp%2Ftasks%2Fnew%3Fhandoff%3Dc0de' })).toBe('c0de');
    expect(handoffInDestination({ origin: 'https://tasksnearme.com', search: '?next=%2Fapp%2Ftasks%2Fnew' })).toBeUndefined();
    expect(handoffInDestination({ origin: 'https://tasksnearme.com', search: '' })).toBeUndefined();
  });

  it('does nothing when storage is unavailable', () => {
    expect(() => forgetPersonalDrafts(undefined)).not.toThrow();
  });
});
