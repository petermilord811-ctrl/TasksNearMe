import { describe, expect, it } from 'vitest';
import { isSamePage, peekHref, peekKey, peekTargetOfHref } from './peek-links';

const origin = 'https://tasksnearme.com';

describe('what a link opens in a peek sheet (2026-11-23)', () => {
  it('reads helper profiles, the help center, help articles and policies, in any language', () => {
    expect(peekTargetOfHref('/helpers/jordan-t', origin)).toEqual({ kind: 'helper', handle: 'jordan-t' });
    expect(peekTargetOfHref('/es/helpers/jordan-t/', origin)).toEqual({ kind: 'helper', handle: 'jordan-t' });
    expect(peekTargetOfHref(`${origin}/help`, origin)).toEqual({ kind: 'help' });
    expect(peekTargetOfHref('/help#payments', origin)).toEqual({ kind: 'help' });
    expect(peekTargetOfHref('/es/help/what-to-pay-for-a-task?x=1', origin)).toEqual({ kind: 'help', slug: 'what-to-pay-for-a-task' });
    expect(peekTargetOfHref('/legal/terms', origin)).toEqual({ kind: 'legal', doc: 'terms' });
  });

  it('leaves everything else to its page', () => {
    expect(peekTargetOfHref('/app/helpers/jordan-t/request', origin)).toBeNull();
    expect(peekTargetOfHref('/helpers/jordan-t/reviews', origin)).toBeNull();
    expect(peekTargetOfHref('/help/contact', origin)).toBeNull();
    expect(peekTargetOfHref('/legal/not-a-policy', origin)).toBeNull();
    expect(peekTargetOfHref('/helpers', origin)).toBeNull();
    expect(peekTargetOfHref('https://example.com/helpers/jordan-t', origin)).toBeNull();
    expect(peekTargetOfHref('/helpers/Jordan_T', origin)).toBeNull();
    expect(peekTargetOfHref('/app/messages/thr_1', origin)).toBeNull();
  });

  it('tells a link to the page it’s on (its anchors still scroll there), in any language', () => {
    expect(isSamePage('/help#payments', `${origin}/help`)).toBe(true);
    expect(isSamePage('/help', `${origin}/es/help/`)).toBe(true);
    expect(isSamePage('/es/help/when-am-i-charged', `${origin}/help/when-am-i-charged?from=x`)).toBe(true);
    expect(isSamePage('/help/when-am-i-charged', `${origin}/help`)).toBe(false);
    expect(isSamePage('/help', `${origin}/help/when-am-i-charged`)).toBe(false);
    expect(isSamePage('https://example.com/help', `${origin}/help`)).toBe(false);
  });

  it('knows each peek’s own page and key', () => {
    expect(peekHref({ kind: 'helper', handle: 'jordan-t' })).toBe('/helpers/jordan-t');
    expect(peekHref({ kind: 'help' })).toBe('/help');
    expect(peekHref({ kind: 'help', slug: 'when-am-i-charged' })).toBe('/help/when-am-i-charged');
    expect(peekHref({ kind: 'legal', doc: 'privacy' })).toBe('/legal/privacy');
    expect(peekKey({ kind: 'help' })).not.toBe(peekKey({ kind: 'help', slug: 'x' }));
  });
});
