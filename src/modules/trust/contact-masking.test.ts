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

  it.each([
    // Payment and social usernames (abuse rehearsal J-AB1), spaced-out numbers and emails (J-AB5).
    ['Pay me on Venmo @maya-r instead', 'Pay me on Venmo [hidden] instead'],
    ['cash app $MayaR1 and cancel the booking', 'cash app [hidden] and cancel the booking'],
    ['IG @maya.cleans or telegram @mayar_23', 'IG [hidden] or telegram [hidden]'],
    ['Snapchat: @maya.r', 'Snapchat: [hidden]'],
    ['paypal.me/mayar', '[hidden]'],
    ['text 3 5 2 5 5 5 0 1 0 1', 'text [hidden]'],
    ['or 1 3 5 2 5 5 5 0 1 0 1', 'or [hidden]'],
    ['write maya @ gmail . com', 'write [hidden]'],
    ['escríbeme a maya @gmail.com', 'escríbeme a [hidden]'],
    ['Págame por Venmo @maya-r y cancela', 'Págame por Venmo [hidden] y cancela'],
  ])('hides %j as %j', (input, output) => {
    expect(maskContactDetails(input)).toEqual({ text: output, masked: true });
  });

  it("leaves tasksnearme.com's own links readable, and hides a longer host that only starts with it (J-AB2)", () => {
    for (const text of ['See https://tasksnearme.com/tasks/desk-1 for the photos.', 'Help is at www.tasksnearme.com/help.', 'Book on tasksnearme.com.']) expect(maskContactDetails(text)).toEqual({ text, masked: false });
    expect(maskContactDetails('Verify at https://tasksnearme.com.pay-now.io/login').text).toBe('Verify at [hidden]');
    expect(maskContactDetails('Visit tasksnearme.co today').text).toBe('Visit [hidden] today');
  });

  it.each([
    // Ordinary sentences, prices, times, dates, quantities and addresses, in English and Spanish, stay as written.
    'The desk is $80, or $12.50 an hour, $1,200 for the whole move.',
    'Son $80 por 2 horas; el total es US$150.',
    'Between 9am and 5pm, or around 10:30 / 10.30, see you @ the park.',
    'Te veo @ las 5, o a las 17:30. Bienvenid@s tod@s.',
    'Saturday 2026-11-21, Nov 21 or 11/21/2026, then 21.11.2026.',
    'Apt 5B, 1234 Elm St, Gainesville, FL 32601.',
    'Calle 5 #12-34, 2º piso, Gainesville FL 32601.',
    'Two boxes of 40 parts, 6 shelves, 3 flights of stairs, 1.5 baths.',
    'Codes 1 2 3 on the box, room 4 5 6.',
    'Version 2.0 of the app, 4K TV, 55" screen, 120Hz.',
    'Email works best: I check it at night.',
    'I use Venmo and Cash App, but I pay through TasksNearMe.',
  ])('leaves ordinary text alone in both languages: %j', (input) => {
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
