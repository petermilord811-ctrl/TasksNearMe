import { describe, expect, it } from 'vitest';
import { addressOnDocument, documentDateOf, documentKind, judgeAddressProof, nameOnDocument, parseStreetAddress, recentOnDocument, statementDateOf } from './address-proof';
import type { PdfStructure } from './pdf-forensics';
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

describe("the date a statement states as its own", () => {
  it('takes the end of a labeled period, else a labeled statement or bill date, else an unlabeled range', () => {
    expect(statementDateOf('Statement Period 10/01/26 - 10/31/26  Account ending 1234', '2026-11-12')).toBe('2026-10-31');
    expect(statementDateOf('STATEMENT PERIOD Aug 1 - Aug 31, 2026', '2026-11-12')).toBe('2026-08-31');
    expect(statementDateOf('Billing Period: Sep 28, 2026 to Oct 27, 2026', '2026-11-12')).toBe('2026-10-27');
    expect(statementDateOf('Opening/Closing Date 10/05/26 - 11/04/26', '2026-11-12')).toBe('2026-11-04');
    expect(statementDateOf('Statement Date: October 28, 2026   Amount due by 11/18/2026', '2026-11-12')).toBe('2026-10-28');
    expect(statementDateOf('Bill Date 11/01/2026', '2026-11-12')).toBe('2026-11-01');
    expect(statementDateOf('October 01, 2026 through October 31, 2026', '2026-11-12')).toBe('2026-10-31');
  });

  it('never takes the next closing date, a date after it was sent, or a span of years', () => {
    expect(statementDateOf('Next Closing Date 11/30/2026. Statement date 10/31/2026', '2026-11-12')).toBe('2026-10-31');
    expect(statementDateOf('Statement date 12/31/2026', '2026-11-12')).toBeUndefined();
    expect(statementDateOf('Customer from 2019-01-01 to 2026-10-31', '2026-11-12')).toBeUndefined();
  });

  it('falls back to three weeks before a due date', () => {
    expect(statementDateOf('Please pay by November 21, 2026', '2026-11-12')).toBe('2026-10-31');
    expect(statementDateOf('No dates here', '2026-11-12')).toBeUndefined();
  });

  it('or, for the document date shown to staff, the newest date up to the day it was sent', () => {
    expect(documentDateOf('Customer since 3/1/2015. Statement 10/1/2026. Due 12/5/2026', '2026-11-12')).toBe('2026-10-01');
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

  const structure: PdfStructure = { revisions: 1, linearized: false, signed: false, encrypted: false, javascript: false, acroForm: false, formFields: false, annotationKinds: [], embeddedFiles: false };

  it("adds what the automatic decision needs from the server's reader: the sender, the date, the source and the findings", () => {
    const bill = BILL.replace('Riverbend Power & Water', 'Gainesville Regional Utilities');
    expect(judgeAddressProof({ text: bill, confident: true, source: 'pdf', pdf: { structure, reader: { producer: 'BFO Report Engine' } } }, expected)).toEqual({
      readable: true,
      documentType: 'utility_bill',
      nameMatches: true,
      addressMatches: true,
      recent: true,
      issuer: { name: 'Gainesville Regional Utilities', kind: 'utility_bill' },
      documentDate: '2026-10-28',
      textSource: 'pdf',
      confident: true,
      unedited: 'pass',
      signals: ['issuer_known', 'name_near_address', 'address_in_header'],
    });
  });

  it("finds an edited PDF's marks, a photo's source, and a sender's kind of document", () => {
    const edited = judgeAddressProof({ text: BILL, confident: true, source: 'pdf', pdf: { structure: { ...structure, producer: 'iLovePDF' } } }, expected);
    expect(edited).toMatchObject({ unedited: 'fail', signals: expect.arrayContaining(['pdf_editor_tool', 'issuer_unknown']) });
    const photo = judgeAddressProof({ text: BILL, confident: false, source: 'photo' }, expected);
    expect(photo).toMatchObject({ textSource: 'photo', confident: false, unedited: 'pass', signals: expect.arrayContaining(['photo', 'low_confidence_text']) });
    // A letter from a sender we know is their kind of document, and a different kind than declared is noted.
    const letter = 'Duke Energy\nDear customer ALEX R SAMPLE of 1234 EXAMPLE LN APT 2 AUSTIN TX 78723, thank you for choosing us, we value you as a customer and we look forward to serving you this year with care. October 28, 2026';
    expect(judgeAddressProof({ text: letter, confident: true, source: 'pdf', pdf: { structure } }, { ...expected, declaredType: 'bank_statement' })).toMatchObject({ documentType: 'utility_bill', signals: expect.arrayContaining(['kind_differs', 'issuer_known']) });
  });

  it("goes by the envelope window's lines when a PDF has them", () => {
    const reading = judgeAddressProof({ text: BILL, confident: true, source: 'pdf', pdf: { structure }, mailingBlock: 'ALEX R SAMPLE\n1234 EXAMPLE LN APT 2\nAUSTIN TX 78723-1234' }, expected);
    expect(reading.signals).toEqual(expect.arrayContaining(['address_in_header', 'name_near_address']));
    const elsewhere = judgeAddressProof({ text: BILL, confident: true, source: 'pdf', pdf: { structure }, mailingBlock: 'JORDAN LEE\n88 OTHER ROAD\nAUSTIN TX 78701' }, expected);
    expect(elsewhere.signals).not.toContain('address_in_header');
  });

  it('decides "recent" by the date it labels, and leaves an old label with a newer date elsewhere to staff', () => {
    const old = 'Statement date: July 1, 2026\n' + BILL.split('\n').slice(2).join('\n').replace(/10\/25\/2026|11\/18\/2026/g, '06/25/2026');
    expect(judgeAddressProof({ text: old, confident: true, source: 'pdf', pdf: { structure } }, expected).recent).toBe(false);
    const printed = `${old}\nPrinted on 11/10/2026`;
    expect(judgeAddressProof({ text: printed, confident: true, source: 'pdf', pdf: { structure } }, expected).recent).toBeUndefined();
  });

  it('says a scanned PDF and an unreadable photo are unreadable, and why', () => {
    expect(judgeAddressProof({ text: ' ', confident: true, source: 'pdf', pdf: { structure } }, expected)).toEqual({ readable: false, textSource: 'pdf', confident: false, signals: ['scanned_pdf'] });
    expect(judgeAddressProof({ text: 'x', confident: false, source: 'photo' }, expected)).toEqual({ readable: false, textSource: 'photo', confident: false, signals: ['photo', 'low_confidence_text'] });
  });
});

describe('USPS street words', () => {
  it('reads Publication 28 suffixes and units both ways, and never mistakes a street named Front for a unit', () => {
    expect(addressOnDocument(words('1234 EXAMPLE PKWY UNIT 4 GAINESVILLE FL 32601'), '1234 Example Parkway, Gainesville, FL 32601')).toBe(true);
    expect(addressOnDocument(words('77 Harbor Crescent Gainesville FL 32601'), '77 Harbor Cres, Gainesville, FL 32601')).toBe(true);
    expect(parseStreetAddress('12 Front St, Gainesville, FL 32601')).toEqual({ number: '12', street: ['FRONT'], suffix: 'ST', zip: '32601' });
    expect(parseStreetAddress('12 Oak Lane Bsmt, Gainesville, FL 32601')).toEqual({ number: '12', street: ['OAK'], suffix: 'LN', zip: '32601' });
  });
});
