import { describe, expect, it } from 'vitest';
import { parseAamva } from './aamva';
import { aamvaText as barcodeText, TEXAS_LICENSE as TEXAS } from './test-barcodes';

/**
 * The AAMVA parser on barcode texts built here: fictional people, the header's offsets and lengths right unless a test
 * breaks them on purpose.
 */

const today = new Date('2026-11-21T12:00:00Z');

const TEXAS_DETAILS = {
  documentType: 'drivers_license',
  issuingState: 'TX',
  givenNames: 'ALEX',
  middleNames: 'RIVER',
  surname: 'SAMPLE',
  dateOfBirth: '1990-04-02',
  expiryDate: '2030-04-02',
  issueDate: '2022-04-02',
  documentNumber: '12345678',
  address: { line1: '1234 EXAMPLE LANE', line2: 'APT 2', city: 'AUSTIN', state: 'TX', zip: '78723' },
  sex: 'female',
  height: `5'5"`,
  eyeColor: 'BRO',
};
/** The same elements with some replaced or added (by ID), or dropped (`null`). */
const texasWith = (changes: Record<string, string | null>) => [
  ...TEXAS.flatMap((element) => {
    const id = element.slice(0, 3);
    if (!(id in changes)) return [element];
    const value = changes[id];
    return value === null ? [] : [`${id}${value}`];
  }),
  ...Object.entries(changes).flatMap(([id, value]) => (value !== null && !TEXAS.some((element) => element.startsWith(id)) ? [`${id}${value}`] : [])),
];

describe('an AAMVA barcode', () => {
  it("reads every field of a 2020 Texas license, and none of the jurisdiction's own subfile", () => {
    const text = barcodeText({ subfiles: [['DL', TEXAS], ['ZT', ['ZTAEXAMPLE', 'ZTB0']]] });
    expect(parseAamva(text, today)).toEqual(TEXAS_DETAILS);
  });

  it('reads a state ID (subfile ID), its state from the IIN rather than the address, a suffix, and the other ways to write sex and height', () => {
    const florida = barcodeText({
      iin: '636010',
      version: '09',
      subfiles: [['ID', texasWith({ DCS: 'TESTER', DAC: 'JORDAN', DAD: 'LEE,MORGAN', DCU: 'JR', DBC: '1', DAU: '070 in', DAY: 'UNK', DAI: 'GAINESVILLE', DAJ: 'GA', DAK: '32601-1234', DAH: null })]],
    });
    expect(parseAamva(florida, today)).toEqual({
      ...TEXAS_DETAILS,
      documentType: 'state_id',
      issuingState: 'FL',
      givenNames: 'JORDAN',
      middleNames: 'LEE MORGAN',
      surname: 'TESTER',
      suffix: 'JR',
      address: { line1: '1234 EXAMPLE LANE', city: 'GAINESVILLE', state: 'GA', zip: '32601' },
      sex: 'male',
      height: `5'10"`,
      eyeColor: undefined,
    });
    const sexes = ['M', 'F', '9', 'X', '0'].map((code) => parseAamva(barcodeText({ subfiles: [['DL', texasWith({ DBC: code })]] }), today)?.sex);
    expect(sexes).toEqual(['male', 'female', 'unspecified', 'unspecified', undefined]);
    const heights = ['175 cm', '068IN', '511', '178', '5-08'].map((height) => parseAamva(barcodeText({ subfiles: [['DL', texasWith({ DAU: height })]] }), today)?.height);
    expect(heights).toEqual(['175 cm', `5'8"`, `5'11"`, '178 cm', '5-08']);
  });

  it('reads dates month first in the US and year first in Canada (from DCG or the IIN), and either way when a card uses the other', () => {
    const canada = { DBA: '20300402', DBB: '19900402', DBD: '20220402', DAJ: 'ON', DAK: 'K1A 0B1' };
    // Ontario: a Canadian IIN, CAN in DCG; the issuing jurisdiction from DAJ (the IIN isn't a US one).
    expect(parseAamva(barcodeText({ iin: '636012', version: '03', subfiles: [['DL', texasWith({ ...canada, DCG: 'CAN' })]] }), today)).toMatchObject({
      issuingState: 'ON',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      issueDate: '2022-04-02',
      address: { state: 'ON', zip: 'K1A 0B1' },
    });
    // A Canadian IIN alone; CAN alone on a jurisdiction the table doesn't know.
    expect(parseAamva(barcodeText({ iin: '636028', subfiles: [['DL', texasWith({ ...canada, DAJ: 'BC', DCG: null })]] }), today)).toMatchObject({ issuingState: 'BC', dateOfBirth: '1990-04-02' });
    expect(parseAamva(barcodeText({ iin: '636099', subfiles: [['DL', texasWith({ ...canada, DCG: 'CAN' })]] }), today)).toMatchObject({ issuingState: 'ON', expiryDate: '2030-04-02' });
    // A US card with year-first dates, and one with a letter after its birth date.
    expect(parseAamva(barcodeText({ subfiles: [['DL', texasWith({ DBA: '20300402', DBB: '19900402', DBD: '20220402' })]] }), today)).toMatchObject({ dateOfBirth: '1990-04-02', issueDate: '2022-04-02' });
    expect(parseAamva(barcodeText({ subfiles: [['DL', texasWith({ DBB: '04021990M' })]] }), today)).toMatchObject({ dateOfBirth: '1990-04-02' });
    // An issue date of zeros is no issue date.
    expect(parseAamva(barcodeText({ subfiles: [['DL', texasWith({ DBD: '00000000' })]] }), today)).not.toHaveProperty('issueDate');
  });

  it("reads the 2000 standard's full name and year-first dates, and the 2003 and 2005 ones' given names", () => {
    const v1 = ['DAQ102639206', 'DAASAMPLE,ALEX,RIVER', 'DAG1234 EXAMPLE LANE', 'DAICOLUMBIA', 'DAJSC', 'DAK292010000  ', 'DARD', 'DBA20300402', 'DBB19900402', 'DBC2', 'DBD20220402', 'DAU505', 'DAYBLU'];
    const southCarolina = barcodeText({ iin: '636005', version: '01', subfiles: [['DL', v1]] });
    // No jurisdiction version in this header: the entry count right after the version.
    expect(southCarolina.slice(9, 25)).toBe('6360050101DL0029');
    expect(parseAamva(southCarolina, today)).toEqual({
      documentType: 'drivers_license',
      issuingState: 'SC',
      givenNames: 'ALEX',
      middleNames: 'RIVER',
      surname: 'SAMPLE',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      issueDate: '2022-04-02',
      documentNumber: '102639206',
      address: { line1: '1234 EXAMPLE LANE', city: 'COLUMBIA', state: 'SC', zip: '29201' },
      sex: 'female',
      height: `5'5"`,
      eyeColor: 'BLU',
    });
    // "AAMVA" for the file type; the given and middle names in one part; a suffix at the end.
    const older = barcodeText({ iin: '636006', version: '01', subfiles: [['DL', v1.map((e) => (e.startsWith('DAA') ? 'DAASAMPLE,ALEX RIVER,,JR' : e.replace('DAJSC', 'DAJCT')))]] }).replace('ANSI ', 'AAMVA');
    expect(parseAamva(older, today)).toMatchObject({ issuingState: 'CT', surname: 'SAMPLE', givenNames: 'ALEX', middleNames: 'RIVER', suffix: 'JR' });
    // Version 03: the family name in DCS (a trailing comma), every given name in DCT.
    const v3 = barcodeText({ version: '03', jurisdictionVersion: '00', subfiles: [['DL', texasWith({ DCS: 'SAMPLE,', DAC: null, DAD: null, DCT: 'ALEX,RIVER JAMES' })]] });
    expect(parseAamva(v3, today)).toMatchObject({ surname: 'SAMPLE', givenNames: 'ALEX', middleNames: 'RIVER JAMES' });
    // A full name without its separators isn't split (no guessing which part is the family name).
    expect(parseAamva(barcodeText({ iin: '636025', version: '01', subfiles: [['DL', v1.map((e) => (e.startsWith('DAA') ? 'DAAALEX R SAMPLE' : e))]] }), today)).toBeNull();
  });

  it("takes the state from the holder's address only when the IIN is unknown", () => {
    expect(parseAamva(barcodeText({ iin: '636099', subfiles: [['DL', TEXAS]] }), today)).toMatchObject({ issuingState: 'TX' });
    // The US Department of State's diplomatic licenses: not a state's IIN.
    expect(parseAamva(barcodeText({ iin: '636027', subfiles: [['DL', texasWith({ DAJ: 'DC' })]] }), today)).toMatchObject({ issuingState: 'DC' });
    expect(parseAamva(barcodeText({ iin: '636099', subfiles: [['DL', texasWith({ DAJ: null })]] }), today)).toBeNull();
  });

  it('is null for a broken payload: no number, name or birth date, implausible dates, or not AAMVA at all', () => {
    const without = (changes: Record<string, string | null>) => parseAamva(barcodeText({ subfiles: [['DL', texasWith(changes)]] }), today);
    expect(without({ DAQ: null })).toBeNull();
    expect(without({ DAQ: 'NONE' })).toBeNull();
    expect(without({ DCS: null })).toBeNull();
    expect(without({ DAC: 'unavail' })).toBeNull();
    expect(without({ DBB: null })).toBeNull();
    expect(without({ DBA: '99999999' })).toBeNull();
    // Born in the future or before 1900; expiring before it was issued, or before birth; issued in the future.
    expect(without({ DBB: '04022027' })).toBeNull();
    expect(without({ DBB: '04021899' })).toBeNull();
    expect(without({ DBA: '04022021' })).toBeNull();
    expect(without({ DBA: '04021985', DBD: null })).toBeNull();
    expect(without({ DBD: '04022027' })).toBeNull();
    // A placeholder far in the future isn't an expiry.
    expect(without({ DBA: '12319999' })).toBeNull();
    expect(parseAamva('', today)).toBeNull();
    expect(parseAamva('M1SAMPLE/ALEX EABC123 LAXJFKAA 0123 325Y012A0001 100', today)).toBeNull();
    expect(parseAamva('@\n\x1e\rANSI 6360', today)).toBeNull();
    // No subfile type anywhere: neither a license nor an ID.
    expect(parseAamva(barcodeText({ subfiles: [['DL', TEXAS]] }).replace(/DL00/, 'XX00').replace(/XX(\d{8})DL/, 'XX$1'), today)).toBeNull();
  });

  it("forgives real cards' quirks: \\r\\n, lower case, a mangled header, wrong offsets, padding, and a count that's off", () => {
    const text = barcodeText({ subfiles: [['DL', TEXAS]] });
    expect(parseAamva(text.replaceAll('\n', '\r\n'), today)).toEqual(TEXAS_DETAILS);
    expect(parseAamva(text.toLowerCase(), today)).toEqual(TEXAS_DETAILS);
    // A byte-order mark and stray bytes before the header, its separators missing or replaced, every offset zero.
    expect(parseAamva(`﻿  ${text.replace('@\n\x1e\r', '@')}`, today)).toEqual(TEXAS_DETAILS);
    expect(parseAamva(text.replace('@\n\x1e\r', '@\n\n'), today)).toEqual(TEXAS_DETAILS);
    expect(parseAamva(text.replace(/DL\d{4}(\d{4})/, 'DL0000$1'), today)).toEqual(TEXAS_DETAILS);
    // Letters where an offset goes (a jurisdiction did), and a designator count that leaves one out.
    expect(parseAamva(text.replace(/DL\d{4}(\d{4})/, 'DLabac$1'), today)).toEqual(TEXAS_DETAILS);
    const twoSubfiles = barcodeText({ subfiles: [['DL', TEXAS], ['ZT', ['ZTAEXAMPLE']]] });
    expect(parseAamva(twoSubfiles.replace('ANSI 636015100102', 'ANSI 636015100101'), today)).toEqual(TEXAS_DETAILS);
    // The data on its own line after the header; a separator a scanner substituted for LF (declared in the header).
    expect(parseAamva(text.replace(/(DL\d{8})DL/, '$1DL\n'), today)).toEqual(TEXAS_DETAILS);
    expect(parseAamva(text.replaceAll('\n', '|'), today)).toEqual(TEXAS_DETAILS);
    // C1 control characters a scanner wrapped around every element.
    expect(parseAamva(text.replace(/[\n\r]/g, (separator) => `\u0090${separator}\u0090`), today)).toEqual(TEXAS_DETAILS);
    // Padding, trailing commas and spaces inside values.
    const padded = barcodeText({ subfiles: [['DL', texasWith({ DCS: 'SAMPLE,     ', DAC: '  ALEX ', DAG: '1234  EXAMPLE LANE,', DAQ: '12345678   ' })]] });
    expect(parseAamva(padded, today)).toEqual(TEXAS_DETAILS);
  });
});
