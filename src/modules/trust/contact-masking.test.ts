import { describe, expect, it } from 'vitest';
import { findProhibitedPhrase, maskContactDetails, MASK, publicExcerpt } from './contact-masking';

describe('maskContactDetails', () => {
  it.each([
    'Email me at maya.r+tasks@example.com',
    'maya at example dot com',
    'Call 512-555-0101',
    'text (512) 555 0101 please',
    'or +1 512.555.0101',
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
  ])('leaves ordinary text alone: %j', (input) => {
    expect(maskContactDetails(input)).toEqual({ text: input, masked: false });
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
