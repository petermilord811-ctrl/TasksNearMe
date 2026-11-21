import { describe, expect, it } from 'vitest';
import { deskDraft } from '@/fixtures';
import { HANDOFF_DRAFT_KEY } from '@/ui/lib/personal-drafts';
import { adoptHandoffDraft, readStoredDraft, storeHandoffDraft } from './draft-storage';

describe('a stored draft keeps its post key (bad connections pass, J-N1)', () => {
  it('reads a key back, and drops one that is not a UUID', () => {
    const requestKey = '3f2a9c4e-7b1d-4e8f-9a6b-5c4d3e2f1a0b';
    expect(readStoredDraft(JSON.stringify({ values: deskDraft, step: 'review', requestKey }))?.requestKey).toBe(requestKey);
    const odd = readStoredDraft(JSON.stringify({ values: deskDraft, step: 'review', requestKey: 'not-a-key' }));
    expect(odd?.values.title).toBe(deskDraft.title);
    expect(odd).not.toHaveProperty('requestKey');
  });
});

describe('a draft saved on a step that no longer exists (J-V5)', () => {
  it('opens a draft saved on the old photos step on the words step, where photos are now', () => {
    expect(readStoredDraft(JSON.stringify({ values: deskDraft, step: 'photos' }))?.step).toBe('describe');
  });

  it('drops a draft whose step was never a step', () => {
    expect(readStoredDraft(JSON.stringify({ values: deskDraft, step: 'somewhere' }))).toBeUndefined();
  });
});

describe('a task drafted signed out, carried through sign-up (J-V5)', () => {
  function memory() {
    const items = new Map<string, string>();
    return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); }, items };
  }

  it("becomes the account's draft on its review step, once, with the matching code only", () => {
    const tab = memory();
    storeHandoffDraft(tab, 'c0de', { values: deskDraft, step: 'budget' });
    expect(adoptHandoffDraft(tab, 'not-it', 'tasksnearme:post-task:gainesville:usr:v1')).toBe(false);
    expect(tab.items.has(HANDOFF_DRAFT_KEY)).toBe(true);
    expect(adoptHandoffDraft(tab, 'c0de', 'tasksnearme:post-task:gainesville:usr:v1')).toBe(true);
    expect(readStoredDraft(tab.getItem('tasksnearme:post-task:gainesville:usr:v1')!)).toMatchObject({ values: deskDraft, step: 'review' });
    expect(tab.items.has(HANDOFF_DRAFT_KEY)).toBe(false);
    expect(adoptHandoffDraft(tab, 'c0de', 'tasksnearme:post-task:gainesville:usr:v1')).toBe(false);
  });
});
