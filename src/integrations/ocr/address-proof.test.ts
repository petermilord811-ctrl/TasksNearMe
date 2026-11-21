import { describe, expect, it } from 'vitest';
import { addressOnDocument, documentKind, judgeAddressProof, nameOnDocument, parseStreetAddress, recentOnDocument } from './address-proof';
import { words } from './text';

const ADDRESS = '1234 Example Lane, Apt 2, Austin, TX 78723';
const expected = { name: 'Alex Sample', address: ADDRESS, declaredType: 'utility_bill' as const, submittedOn: '2026-11-12' };
const BILL = [
  'Riverbend Power & Water',
  'Statement date: October 28, 2026   Account 0042-118-7731',
  'Service address: ALEX R SAMPLE',
  '1234 EXAMPLE LN APT 2',
  'AUSTIN TX 78723-1234',
  'Electric service 612 kWh $71.20. Water service 4,100 gallons $17.25.',
  'Meter reading on 10/25/2026. Amount due $88.45 by 11/18/2026. Thank you for your payment this month.',
].join('\n');

describe('the name on a proof of address', () => {
  it('matches the first and last names in either order, with middle names, initials and small OCR slips', () => {
    for (const text of ['ALEX R SAMPLE', 'Alex River Sample', 'SAMPLE, ALEX', 'A. SAMPLE', 'A R SAMPLE', 'Mr. Alex Sarnple', 'ALEX SAMPLE JR']) {
      expect(nameOnDocument(words(`Dear customer ${text} thank you`), 'Alex Sample')).toBe(true);
    }
    expect(nameOnDocument(words('Juan De La Cruz'), 'Juan De La Cruz')).toBe(true);
  });

  it("doesn't match someone else, or the words far apart", () => {
    expect(nameOnDocument(words('JORDAN LEE'), 'Alex Sample')).toBe(false);
    expect(nameOnDocument(words('ALEX JORDAN'), 'Alex Sample')).toBe(false);
    expect(nameOnDocument(words('ALEX lives at 4 Main St with B SAMPLE'), 'Alex Sample')).toBe(false);
    expect(nameOnDocument(words('B SAMPLE'), 'Alex Sample')).toBe(false);
    expect(nameOnDocument(words('ALEX SAMPLE'), 'Alex')).toBeUndefined();
  });
});

describe('the address on a proof of address', () => {
  it('parses the address entered', () => {
    expect(parseStreetAddress(ADDRESS)).toEqual({ number: '1234', street: ['EXAMPLE'], suffix: 'LN', zip: '78723' });
    expect(parseStreetAddress('1100 N Lamar Blvd #4, Austin, TX 78703')).toEqual({ number: '1100', direction: 'N', street: ['LAMAR'], suffix: 'BLVD', zip: '78703' });
    expect(parseStreetAddress('4500 Avenue B, Austin, TX 78751')).toEqual({ number: '4500', street: ['AVE', 'B'], zip: '78751' });
    expect(parseStreetAddress('PO Box 12, Austin, TX 78701')).toBeUndefined();
  });

  it('matches the house number, the street and the ZIP, abbreviated or not', () => {
    for (const text of ['1234 EXAMPLE LN APT 2 AUSTIN TX 78723', '1234 Example Lane #2, Austin, Texas 78723-1234', '1234 N EXAMPLE LANE AUSTIN 78723', '1234 EXAMPLF LN AUSTIN TX 78723']) {
      expect(addressOnDocument(words(text), ADDRESS)).toBe(true);
    }
    expect(addressOnDocument(words('1100 North Lamar Boulevard, Austin TX 78703'), '1100 N Lamar Blvd, Austin, TX 78703')).toBe(true);
    expect(addressOnDocument(words('1100 S LAMAR BLVD AUSTIN TX 78703'), '1100 N Lamar Blvd, Austin, TX 78703')).toBe(false);
  });

  it("doesn't match another house, street, suffix or ZIP", () => {
    for (const text of ['1243 EXAMPLE LN AUSTIN TX 78723', '1234 SAMPLE LN AUSTIN TX 78723', '1234 EXAMPLE CT AUSTIN TX 78723', '1234 EXAMPLE LN AUSTIN TX 78724']) {
      expect(addressOnDocument(words(text), ADDRESS)).toBe(false);
    }
  });
});

describe('the date on a proof of address', () => {
  it('is recent when some date falls in the 90 days before it was sent', () => {
    expect(recentOnDocument('Statement date: October 28, 2026', '2026-11-12')).toBe(true);
    expect(recentOnDocument('Issued 08/20/2026', '2026-11-12')).toBe(true);
    expect(recentOnDocument('Issued 2026-08-13', '2026-11-12')).toBe(false);
    expect(recentOnDocument('Customer since 3/1/2015. Statement 7/1/2026', '2026-11-12')).toBe(false);
    // A due date in the future alone says nothing; no date at all says nothing.
    expect(recentOnDocument('Pay by December 5, 2026', '2026-11-12')).toBeUndefined();
    expect(recentOnDocument('No dates here', '2026-11-12')).toBeUndefined();
  });
});

describe('the kind of proof of address', () => {
  it('goes by its words, the declared kind winning a tie, and "other" when nothing points anywhere', () => {
    expect(documentKind(BILL, 'bank_statement')).toBe('utility_bill');
    expect(documentKind('Checking account statement. Beginning balance $10. Ending balance $12. Deposits.', 'utility_bill')).toBe('bank_statement');
    expect(documentKind('Residential lease agreement between the landlord and the tenant for the premises', 'utility_bill')).toBe('lease');
    expect(documentKind('Your wireless phone bill and internet plan', 'phone_or_internet_bill')).toBe('phone_or_internet_bill');
    expect(documentKind('Hello there, see you soon', 'lease')).toBe('other');
  });
});

describe('the reading of a proof of address', () => {
  it('answers all four questions from text read with confidence', () => {
    expect(judgeAddressProof({ text: BILL, confident: true }, expected)).toEqual({ readable: true, documentType: 'utility_bill', nameMatches: true, addressMatches: true, recent: true });
    const someoneElse = { name: 'Jordan Lee', address: '88 Other Road, Austin, TX 78701', declaredType: 'bank_statement' as const, submittedOn: '2027-06-01' };
    expect(judgeAddressProof({ text: BILL, confident: true }, someoneElse)).toEqual({ readable: true, documentType: 'utility_bill', nameMatches: false, addressMatches: false, recent: false });
  });

  it("says not sure rather than no when the text wasn't read with confidence, and unreadable with too little text", () => {
    const someoneElse = { ...expected, name: 'Jordan Lee' };
    expect(judgeAddressProof({ text: BILL, confident: false }, someoneElse)).toEqual({ readable: true, documentType: 'utility_bill', addressMatches: true, recent: true });
    expect(judgeAddressProof({ text: 'ALEX SAMPLE 1234 EXAMPLE LN 78723', confident: true }, expected)).toEqual({ readable: false });
  });
});
