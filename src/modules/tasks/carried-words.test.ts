import { describe, expect, it } from 'vitest';
import { carriedWords, handoffCode } from './carried-words';

describe('what a link carries into the post form', () => {
  it('reads a known service, a tidy title and the words, and ignores the rest', () => {
    expect(carriedWords({ category: 'furniture-assembly', title: '  Assemble   a desk ', describe: 'Two  boxes\r\n\n\n\nin the hall' })).toEqual({ initialCategory: 'furniture-assembly', title: 'Assemble a desk', describe: 'Two boxes\n\nin the hall' });
    expect(carriedWords({ category: 'rocket-repair' })).toEqual({ title: '', describe: '' });
  });

  it('takes a handoff code only in the shape the form makes (J-V5)', () => {
    expect(handoffCode('0F8A3C2E-1B4D-4E5F-9A6B-7C8D9E0F1A2B')).toBe('0f8a3c2e-1b4d-4e5f-9a6b-7c8d9e0f1a2b');
    expect(handoffCode('c0de')).toBeUndefined();
    expect(handoffCode(['0f8a3c2e-1b4d-4e5f-9a6b-7c8d9e0f1a2b'])).toBeUndefined();
  });
});
