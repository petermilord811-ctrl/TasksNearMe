import { describe, expect, it } from 'vitest';
import { ageOn, compareIdDetails, sameAddress } from './id-details';
import { readingEmailText, readingVerdict } from './notify-deciders';

const home = { line1: '4401 SW 34th Street', line2: 'Apt 12', city: 'Gainesville', state: 'FL', zip: '32608' };

describe('the same address', () => {
  it('ignores how the street is written, the unit and the city spelling, but not the number, street or ZIP', () => {
    expect(sameAddress({ line1: '4401 sw 34th st apt 12', city: 'GAINESVILLE', state: 'FL', zip: '32608-1234' }, home)).toBe(true);
    expect(sameAddress({ line1: '4401 Southwest 34th St.', line2: '#12', city: 'Gainesville', state: 'FL', zip: '32608' }, home)).toBe(true);
    expect(sameAddress({ line1: '4401 SW 34th Street', city: 'Gainesvile', state: 'FL', zip: '32608' }, home)).toBe(true);
    expect(sameAddress({ line1: '4403 SW 34th Street', city: 'Gainesville', state: 'FL', zip: '32608' }, home)).toBe(false);
    expect(sameAddress({ line1: '4401 SW 35th Street', city: 'Gainesville', state: 'FL', zip: '32608' }, home)).toBe(false);
    expect(sameAddress({ line1: '4401 SW 34th Street', city: 'Gainesville', state: 'FL', zip: '32609' }, home)).toBe(false);
    expect(sameAddress({ line1: 'PO Box 12', city: 'Gainesville', state: 'FL', zip: '32608' }, { ...home, line1: 'PO Box 12' })).toBe(false);
  });
});

describe('age', () => {
  it('counts whole years, with a Feb 29 birthday on Mar 1 in a common year', () => {
    expect(ageOn('2008-11-21', { year: 2026, month: 11, day: 21 })).toBe(18);
    expect(ageOn('2008-11-22', { year: 2026, month: 11, day: 21 })).toBe(17);
    expect(ageOn('2008-02-29', { year: 2026, month: 2, day: 28 })).toBe(17);
    expect(ageOn('2008-02-29', { year: 2026, month: 3, day: 1 })).toBe(18);
    expect(ageOn('not a date', { year: 2026, month: 3, day: 1 })).toBeUndefined();
  });
});

describe('comparing an ID with the account', () => {
  const now = new Date('2026-11-21T15:00:00Z');
  const details = { givenNames: 'Rosa', surname: 'Torres', dateOfBirth: '1994-03-12', expiryDate: '2029-04-30', address: { line1: '4401 SW 34th St', city: 'Gainesville', state: 'FL', zip: '32608' } };

  it('checks the legal name, the home address on file, 18 or older and not expired', () => {
    expect(compareIdDetails(details, { firstName: 'Rosa', lastName: 'Torres' }, home, now, 'America/New_York')).toEqual({
      age: 32,
      matches: { name: true, address: true, adult: true, notExpired: true },
    });
    expect(compareIdDetails({ ...details, surname: 'Lopez', expiryDate: '2026-11-20' }, { firstName: 'Rosa', lastName: 'Torres' }, { ...home, zip: '32601' }, now, 'America/New_York').matches).toEqual({
      name: false,
      address: false,
      adult: true,
      notExpired: false,
    });
  });

  it('says nothing about the address without one on file or on the ID', () => {
    expect(compareIdDetails(details, { firstName: 'Rosa', lastName: 'Torres' }, null, now, 'America/New_York').matches.address).toBeNull();
    const { address: _none, ...noAddress } = details;
    expect(compareIdDetails(noAddress, { firstName: 'Rosa', lastName: 'Torres' }, home, now, 'America/New_York').matches.address).toBeNull();
  });

  it('is good through its expiry date on the market clock', () => {
    const lastDay = new Date('2029-05-01T03:00:00Z'); // still Apr 30 in New York
    expect(compareIdDetails(details, { firstName: 'Rosa', lastName: 'Torres' }, home, lastDay, 'America/New_York').matches.notExpired).toBe(true);
  });
});

describe('telling staff a reading is ready', () => {
  const at = '2026-11-21T15:00:00.000Z';

  it('names what to check in the subject, and carries the answers only, never personal details', () => {
    const check = { readable: true, nameMatches: true, addressMatches: false, isAdult: true, notExpired: true, source: 'barcode' as const, frontAgrees: true, by: 'server:ocr', at };
    expect(readingVerdict(check)).toBe('check: address');
    expect(readingVerdict({ ...check, addressMatches: true })).toBe('everything read matches');
    expect(readingVerdict({ readable: false, by: 'server:ocr', at })).toBe("couldn't be read automatically");
    const text = readingEmailText(check, 'https://tasksnearme.com/admin/users/usr_rosa');
    expect(text).toContain('Read from: the barcode on the back');
    expect(text).toContain('Address matches the home address on file: no');
    expect(text).toContain('Front and barcode agree: yes');
    expect(text).toContain('https://tasksnearme.com/admin/users/usr_rosa');
    expect(readingEmailText({ readable: true, nameMatches: false, by: 'server:ocr', at }, 'x')).toContain('Address matches the home address on file: no address to compare');
  });

  it('leads with the ID\'s fraud score when there is one (owner, 2026-11-27: "show fraud score to me")', () => {
    const check = { readable: true, nameMatches: true, by: 'server:ocr', at };
    const text = readingEmailText(check, 'x', { score: 65, level: 'high', factors: [{ key: 'id_face_mismatch', points: 50 }, { key: 'id_barcode_doubtful', points: 15 }] });
    expect(text.split('\n')[0]).toBe('Fraud score: 65 of 100 (high). The reasons are on the person page.');
    expect(readingEmailText(check, 'x')).not.toContain('Fraud score');
  });
});
