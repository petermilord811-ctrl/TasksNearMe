import { describe, expect, it } from 'vitest';
import { shortenSegments, toMessageSegments } from './message-segments';

describe('message segments', () => {
  it('masks a phone with the country code run into it, keeping the last 4 digits as a hint (security review 2026-11-20)', () => {
    expect(toMessageSegments('Text +15125550101 or 15125550134.', { mask: true })).toEqual([
      { kind: 'text', text: 'Text ' },
      { kind: 'masked', detail: 'phone', hint: '0101' },
      { kind: 'text', text: ' or ' },
      { kind: 'masked', detail: 'phone', hint: '0134' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('masks styled digits with a plain hint, other separators, and "name at domain.com" (sweep MN4)', () => {
    expect(toMessageSegments('Llama al ３５２５５５０１０１', { mask: true })).toEqual([
      { kind: 'text', text: 'Llama al ' },
      { kind: 'masked', detail: 'phone', hint: '0101' },
    ]);
    expect(toMessageSegments('352/555/0134 or 352 555 01 34', { mask: true })).toEqual([
      { kind: 'masked', detail: 'phone', hint: '0134' },
      { kind: 'text', text: ' or ' },
      { kind: 'masked', detail: 'phone', hint: '0134' },
    ]);
    expect(toMessageSegments('Mail lee at gmail.com today', { mask: true })).toEqual([
      { kind: 'text', text: 'Mail ' },
      { kind: 'masked', detail: 'email' },
      { kind: 'text', text: ' today' },
    ]);
  });

  it('leaves links and longer runs of digits alone', () => {
    expect(toMessageSegments('Tracking 151255501012, see example.com', { mask: true })).toEqual([{ kind: 'text', text: 'Tracking 151255501012, see example.com' }]);
  });
});

describe('shortening a quote', () => {
  it('cuts after masking, so a number at the cut never shows its first digits (sweep MN4)', () => {
    const body = `${'a'.repeat(146)} call 352-555-0101 tonight`;
    expect(shortenSegments(toMessageSegments(body, { mask: true }))).toEqual([{ kind: 'text', text: `${'a'.repeat(146)} call …` }]);
  });

  it('keeps short text whole and cuts long text to 157 characters and "…"', () => {
    expect(shortenSegments([{ kind: 'text', text: 'Short' }])).toEqual([{ kind: 'text', text: 'Short' }]);
    expect(shortenSegments(toMessageSegments('b'.repeat(200), { mask: false }))).toEqual([{ kind: 'text', text: `${'b'.repeat(157)}…` }]);
  });
});
