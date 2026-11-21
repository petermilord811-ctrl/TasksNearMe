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
