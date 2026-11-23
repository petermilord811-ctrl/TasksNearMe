import { describe, expect, it } from 'vitest';
import { mentionedUsernames, shortenSegments, toMessageSegments, type Mentions } from './message-segments';

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

  it('hides links and payment or social usernames before a booking, but not tasksnearme.com (abuse rehearsal J-AB1, J-AB2)', () => {
    expect(toMessageSegments('Pay here https://bit.ly/3xYz or Venmo @maya-r, $MayaR1.', { mask: true })).toEqual([
      { kind: 'text', text: 'Pay here ' },
      { kind: 'masked', detail: 'link' },
      { kind: 'text', text: ' or Venmo ' },
      { kind: 'masked', detail: 'handle' },
      { kind: 'text', text: ', ' },
      { kind: 'masked', detail: 'handle' },
      { kind: 'text', text: '.' },
    ]);
    expect(toMessageSegments('The task: https://tasksnearme.com/tasks/desk-1', { mask: true })).toEqual([{ kind: 'text', text: 'The task: https://tasksnearme.com/tasks/desk-1' }]);
    // After the booking, everything as written.
    expect(toMessageSegments('See example.com or @maya', { mask: false })).toEqual([{ kind: 'text', text: 'See example.com or @maya' }]);
  });

  it('leaves longer runs of digits alone', () => {
    expect(toMessageSegments('Tracking 151255501012 arrives Friday', { mask: true })).toEqual([{ kind: 'text', text: 'Tracking 151255501012 arrives Friday' }]);
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

describe('people named by @username (2026-11-23)', () => {
  const mentions: Mentions = new Map([
    ['minh', { userId: 'usr_minh', name: 'Minh T.', helperHandle: 'minh-t' }],
    ['sam_r', { userId: 'usr_sam', name: 'Sam R.' }],
  ]);

  it('finds every "@name", lowercase and without "@", but not an email or a time', () => {
    expect(mentionedUsernames('Ask @Minh or @sam_r. Mail maya@gmail.com @5pm')).toEqual(['minh', 'sam_r']);
  });

  it('shows a TasksNearMe @username as the person, masked or not, and keeps other handles hidden before a booking', () => {
    expect(toMessageSegments('Ask @Minh, or pay @venmo_guy', { mask: true, mentions })).toEqual([
      { kind: 'text', text: 'Ask ' },
      { kind: 'mention', userId: 'usr_minh', name: 'Minh T.', helperHandle: 'minh-t' },
      { kind: 'text', text: ', or pay ' },
      { kind: 'masked', detail: 'handle' },
    ]);
    expect(toMessageSegments('Ask @sam_r or @venmo_guy', { mask: false, mentions })).toEqual([
      { kind: 'text', text: 'Ask ' },
      { kind: 'mention', userId: 'usr_sam', name: 'Sam R.' },
      { kind: 'text', text: ' or @venmo_guy' },
    ]);
  });

  it('keeps a longer handle that only starts with a username hidden (a dot or a dash makes it another handle)', () => {
    expect(toMessageSegments('IG @minh.tran', { mask: true, mentions })).toEqual([{ kind: 'text', text: 'IG ' }, { kind: 'masked', detail: 'handle' }]);
    expect(toMessageSegments('IG @minh.tran', { mask: false, mentions })).toEqual([{ kind: 'text', text: 'IG @minh.tran' }]);
  });

  it('counts a person as "@" and their name when a quote is cut, and leaves them out whole', () => {
    const cut = shortenSegments([{ kind: 'text', text: 'a'.repeat(150) }, { kind: 'mention', userId: 'usr_minh', name: 'Minh T.' }, { kind: 'text', text: 'b'.repeat(20) }]);
    expect(cut).toEqual([{ kind: 'text', text: `${'a'.repeat(150)}…` }]);
  });
});
