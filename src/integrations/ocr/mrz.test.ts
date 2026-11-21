import { describe, expect, it } from 'vitest';
import { confirmedNames, findPassportZone, mrzCharacters, mrzCheckDigit, readFirstLine, readSecondLine } from './mrz';

// The specimen of ICAO Doc 9303 part 4 (a fictional passport of Utopia).
const LINE_1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const LINE_2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
const today = new Date('2026-11-21T12:00:00Z');
const specimen = { documentNumber: 'L898902C3', dateOfBirth: '1974-08-12', expiryDate: '2012-04-15' };

describe('the passport MRZ', () => {
  it('computes ICAO check digits', () => {
    expect(mrzCheckDigit('L898902C3')).toBe(6);
    expect(mrzCheckDigit('740812')).toBe(2);
    expect(mrzCheckDigit('120415')).toBe(9);
    expect(mrzCheckDigit('ZE184226B<<<<<')).toBe(1);
    // The composite: number, birth date, expiry and personal number, each with its digit.
    expect(mrzCheckDigit('L898902C36' + '7408122' + '1204159' + 'ZE184226B<<<<<1')).toBe(0);
    expect(mrzCheckDigit('ab')).toBe(-1);
  });

  it('reads the specimen: the names from line 1, the checked fields from line 2', () => {
    expect(findPassportZone(['PASSPORT', LINE_1, LINE_2], today)).toEqual({ issuingState: 'UTO', surname: ['ERIKSSON'], givenNames: ['ANNA', 'MARIA'], ...specimen });
    expect(readFirstLine('P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<')).toEqual({ issuingState: 'D', surname: ['MUSTERMANN'], givenNames: ['ERIKA'] });
  });

  it('corrects OCR slips only within the MRZ alphabet, as the check digits allow', () => {
    // O read as 0 in the nationality, a doubled character, fillers read as K and L, spaces and a «.
    expect(readSecondLine('L898902C36UT07408122F12041597ZE184226B<<<<<10', today)).toEqual(specimen);
    expect(readSecondLine('L898902C36UTO740812ZF1204159ZE184226BKKLLL10', today)).toEqual(specimen);
    expect(readSecondLine('L898902C36UTO7408122F1204159ZE184226B<<<<10', today)).toEqual(specimen);
    // No personal number: every filler, its check digit included, read as K or L.
    const empty = `L898902C36UTO7408122F1204159<<<<<<<<<<<<<<<${mrzCheckDigit('L898902C3674081221204159<<<<<<<<<<<<<<<')}`;
    expect(readSecondLine(empty.replace(/</g, 'L'), today)).toEqual(specimen);
    expect(mrzCharacters('P<UTOERIKSSON«ANNA<MARIA << <')).toBe('P<UTOERIKSSON<<ANNA<MARIA<<<');
    expect(findPassportZone(['P<UTOERIKSSON<<ANNA<MARIA<<KKLLLLLLLLLLLLLLLL', 'L898902C36UT07408122F12041597ZE184226B<<<<<10'], today)).toMatchObject(specimen);
  });

  it('is no reading when a check digit fails, or when two corrections disagree', () => {
    // The composite digit, then the birth date's.
    expect(readSecondLine('L898902C36UTO7408122F1204159ZE184226B<<<<<13', today)).toBeNull();
    expect(readSecondLine('L898902C36UTO7408125F1204159ZE184226B<<<<<10', today)).toBeNull();
    expect(findPassportZone([LINE_1, 'L898902C36UTO7408125F1204159ZE184226B<<<<<10'], today)).toBeNull();
    // Too short or too long to repair, or not a passport.
    expect(readSecondLine(LINE_2.slice(0, 40), today)).toBeNull();
    expect(findPassportZone(['V<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', LINE_2], today)).toBeNull();
    // The month 13 doesn't exist, even with its check digit right.
    expect(readSecondLine(`L898902C36UTO741312${mrzCheckDigit('741312')}F1204159ZE184226B<<<<<1${mrzCheckDigit(`L898902C36741312${mrzCheckDigit('741312')}1204159ZE184226B<<<<<1`)}`, today)).toBeNull();
  });

  it('keeps the names only when the printed page shows them, dropping fillers read as letters', () => {
    const printed = new Set(['PASSPORT', 'ERIKSSON', 'ANNA', 'MARIA']);
    expect(confirmedNames({ surname: ['ERIKSSON'], givenNames: ['ANNA', 'MARIA'] }, printed)).toEqual({ surname: 'ERIKSSON', givenNames: 'ANNA MARIA' });
    expect(confirmedNames({ surname: ['ERIKSSON'], givenNames: ['ANNA', 'MARIAKKLLL'] }, printed)).toEqual({ surname: 'ERIKSSON', givenNames: 'ANNA MARIA' });
    // A misread second given name is left out; a misread surname or first name means no names.
    expect(confirmedNames({ surname: ['ERIKSSON'], givenNames: ['ANNA', 'MARTIA'] }, printed)).toEqual({ surname: 'ERIKSSON', givenNames: 'ANNA' });
    expect(confirmedNames({ surname: ['ERIKSS0N'], givenNames: ['ANNA'] }, printed)).toBeNull();
    expect(confirmedNames({ surname: ['ERIKSSON'], givenNames: ['ANNE'] }, printed)).toBeNull();
    expect(confirmedNames({ surname: ['ERIKSSON'], givenNames: [] }, printed)).toBeNull();
  });
});
