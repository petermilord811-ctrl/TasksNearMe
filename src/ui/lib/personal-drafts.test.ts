import { describe, expect, it } from 'vitest';
import { forgetPersonalDrafts } from './personal-drafts';

/** A Storage stand-in: what's left after forgetting. */
function storage(keys: string[]) {
  const items = new Map(keys.map((key) => [key, '{}']));
  return {
    get length() { return items.size; },
    key: (index: number) => [...items.keys()][index] ?? null,
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
      'tnm:assistant:help:v1',
      'tnm-map-intro',
    ]);
    forgetPersonalDrafts(tab);
    expect(tab.keys()).toEqual(['tnm-map-intro', 'tnm:assistant:help:v1']);
  });

  it('does nothing when storage is unavailable', () => {
    expect(() => forgetPersonalDrafts(undefined)).not.toThrow();
  });
});
