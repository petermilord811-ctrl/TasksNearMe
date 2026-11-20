import { describe, expect, it } from 'vitest';
import { findProhibitedPhrase, maskContactDetails, MASK, publicExcerpt } from './contact-masking';

describe('maskContactDetails', () => {
  it.each([
    'Email me at maya.r+tasks@example.com',
    'maya at example dot com',
    'Call 512-555-0101',
    'text (512) 555 0101 please',
    'or +1 512.555.0101',
    // The country code run into the number, other separators, other countries, styled digits, a number run into a
    // word, and "name at domain.com" (security review and sweep MN4, 2026-11-20).
    'text +15125550101',
    'call 15125550101 after 5',
    'or 512/555/0101',
    'call 512 555 01 01',
    'llama al ５１２５５５０１０１',
    'my number is5125550101',
    'in London +447700900123',
    'maya at example.com',
    'maya (at) example (dot) com',
    'see https://example.com/listing',
    'www.example.org has photos',
    'my site example.io/desk',
  ])('hides contact details in %j', (input) => {
    const result = maskContactDetails(input);
    expect(result.masked).toBe(true);
    expect(result.text).toContain(MASK);
    expect(result.text).not.toMatch(/\d{3}.?\d{4}|example\.(com|org|io)/);
  });

  it.each([
    'Flat-pack desk, about 40 parts, 2nd floor with an elevator.',
    'Between 10 and 1 on Saturday, budget $60.',
    'Two bedrooms, 1.5 baths, 3 flights of stairs.',
    'Model number 40112 from the store.',
    // A longer run of digits isn't a phone number, nor is a date with a time.
    'Tracking 151255501012 arrives Friday.',
    'Saturday 2026-11-21 at 10:30, 2 boxes.',
  ])('leaves ordinary text alone: %j', (input) => {
    expect(maskContactDetails(input)).toEqual({ text: input, masked: false });
  });

  it('keeps the rest of the text as written while it reads styled digits as digits', () => {
    expect(maskContactDetails('1º piso: llama al ３５２５５５０１０１, ½ hora antes')).toEqual({ text: '1º piso: llama al [hidden], ½ hora antes', masked: true });
  });
});

describe('publicExcerpt', () => {
  it('shortens on a word boundary and hides contacts', () => {
    const excerpt = publicExcerpt(
      'Flat-pack desk, about 40 parts, still in the box in my living room. Call me at 512-555-0101 when you are close. 2nd floor with an elevator, and parking is on the street out front.',
      100,
    );
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(101);
    expect(excerpt).toContain(MASK);
  });
});

describe('findProhibitedPhrase', () => {
  const phrases = ['piano', 'gun safe', 'your truck', 'haul away'];
  it('matches whole words and phrases', () => {
    expect(findProhibitedPhrase('Move my Piano upstairs', phrases)).toBe('piano');
    expect(findProhibitedPhrase('Can you bring your truck?', phrases)).toBe('your truck');
    expect(findProhibitedPhrase('Haul-away of old couch', phrases)).toBe('haul away');
  });
  it('ignores parts of words and unrelated uses', () => {
    expect(findProhibitedPhrase('Load my rented truck safely', phrases)).toBeNull();
    expect(findProhibitedPhrase('Pianos are not involved, just a pianist', phrases)).toBeNull();
  });
});
