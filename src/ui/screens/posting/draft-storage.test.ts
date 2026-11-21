import { describe, expect, it } from 'vitest';
import { deskDraft } from '@/fixtures';
import { readStoredDraft } from './draft-storage';

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
