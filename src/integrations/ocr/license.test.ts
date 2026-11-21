import { describe, expect, it } from 'vitest';
import { combineFronts, readLicenseFront } from './license';
import type { OcrLine, OcrWord } from './types';

const today = new Date('2026-11-21T12:00:00Z');

/**
 * OCR lines from text, one line every 60 px from the top: words 22 px a letter apart, and three spaces for a wide
 * gap (the next column). `low` lists words read with low confidence.
 */
function lines(rows: string[], low: string[] = []): OcrLine[] {
  return rows.map((row, index) => {
    const y0 = 40 + index * 60;
    let x = 60;
    const words: OcrWord[] = [];
    for (const column of row.split(/ {3,}/)) {
      for (const text of column.split(' ').filter(Boolean)) {
        words.push({ text, confidence: low.includes(text) ? 45 : 94, box: { x0: x, y0, x1: x + text.length * 22, y1: y0 + 40 } });
        x += text.length * 22 + 18;
      }
      x += 400;
    }
    return { words, confidence: 94, box: { x0: 60, y0, x1: x, y1: y0 + 40 } };
  });
}

const AAMVA = ['TEXAS   USA', 'DRIVER LICENSE', '4d DLN 12345678   9 CLASS C', '3 DOB 04/02/1990', '4a ISS 04/02/2022   4b EXP 04/02/2030', '1 SAMPLE', '2 ALEX RIVER', '8 1234 EXAMPLE LANE APT 2', 'AUSTIN, TX 78723', '15 SEX F   16 HGT 5-05'];

describe("a license or ID card's front", () => {
  it('reads the AAMVA fields, the header state and the kind of card', () => {
    expect(readLicenseFront(lines(AAMVA), today)).toEqual({
      surname: 'SAMPLE',
      givenNames: 'ALEX RIVER',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      documentNumber: '12345678',
      issuingState: 'TX',
      documentType: 'drivers_license',
    });
  });

  it('reads the printed labels other states use, joined or not', () => {
    const card = ['CALIFORNIA', 'IDENTIFICATION CARD', 'ID D1234567', 'EXP: 08/31/2030', 'LN SAMPLE-RIVERS', 'FN ALEX', 'DOB08/31/1990'];
    expect(readLicenseFront(lines(card), today)).toEqual({
      surname: 'SAMPLE-RIVERS',
      givenNames: 'ALEX',
      dateOfBirth: '1990-08-31',
      expiryDate: '2030-08-31',
      documentNumber: 'D1234567',
      issuingState: 'CA',
      documentType: 'state_id',
    });
    expect(readLicenseFront(lines(['NEW YORK STATE', 'LEARNER PERMIT', 'ID: 123 456 789', '1SAMPLE', '2ALEX']), today)).toMatchObject({ surname: 'SAMPLE', givenNames: 'ALEX', documentNumber: '123456789', issuingState: 'NY', documentType: 'other' });
  });

  it('leaves out what was read without confidence, or twice differently', () => {
    expect(readLicenseFront(lines(AAMVA, ['04/02/1990']), today)).not.toHaveProperty('dateOfBirth');
    expect(readLicenseFront(lines(AAMVA, ['SAMPLE']), today)).not.toHaveProperty('surname');
    const twice = readLicenseFront(lines([...AAMVA, 'DOB 05/02/1990']), today);
    expect(twice).not.toHaveProperty('dateOfBirth');
    expect(twice).not.toHaveProperty('expiryDate');
  });

  it('never splits a name without labels, and never guesses dates that make no sense', () => {
    const unlabeled = readLicenseFront(lines(['TEXAS', 'DRIVER LICENSE', 'DL 12345678', 'ALEX RIVER SAMPLE', 'DOB 04/02/1990', 'EXP 04/02/2030']), today);
    expect(unlabeled).not.toHaveProperty('surname');
    expect(unlabeled).not.toHaveProperty('givenNames');
    expect(unlabeled).toMatchObject({ dateOfBirth: '1990-04-02', expiryDate: '2030-04-02' });
    // Expiring before birth, born in the future, two-digit years.
    for (const dates of [['DOB 04/02/2031', 'EXP 04/02/2030'], ['DOB 04/02/2027', 'EXP 04/02/2035'], ['DOB 04/02/90', 'EXP 04/02/30']]) {
      expect(readLicenseFront(lines(['1 SAMPLE', '2 ALEX', ...dates]), today)).not.toHaveProperty('dateOfBirth');
    }
  });

  it("takes the state from the header only, never from the holder's address", () => {
    const front = readLicenseFront(lines(['DRIVER LICENSE', 'DL 12345678', 'DOB 04/02/1990', 'EXP 04/02/2030', '1 SAMPLE', '2 ALEX', '8 1234 WASHINGTON AVE', 'AUSTIN TEXAS 78723']), today);
    expect(front).not.toHaveProperty('issuingState');
    expect(front).toMatchObject({ documentType: 'drivers_license', documentNumber: '12345678' });
  });
});

describe('passes over the same card', () => {
  const fields = { surname: 'SAMPLE', givenNames: 'ALEX RIVER', dateOfBirth: '1990-04-02', expiryDate: '2030-04-02' };

  it('take the fields from the passes that read them all, and the header from any pass', () => {
    expect(combineFronts([{ ...fields, documentNumber: '12345678' }, { documentType: 'drivers_license', issuingState: 'TX' }])).toEqual({
      readable: true,
      ...fields,
      documentNumber: '12345678',
      documentType: 'drivers_license',
      issuingState: 'TX',
    });
  });

  it('are no reading when they disagree on the fields, and drop a number or header they disagree on', () => {
    expect(combineFronts([fields, { ...fields, givenNames: 'ALEX RIV' }])).toEqual({ readable: false });
    expect(combineFronts([{ surname: 'SAMPLE', dateOfBirth: '1990-04-02' }, { givenNames: 'ALEX' }])).toEqual({ readable: false });
    expect(combineFronts([
      { ...fields, documentNumber: '12345678', issuingState: 'TX' },
      { ...fields, documentNumber: '12345679', issuingState: 'NM' },
    ])).toEqual({ readable: true, ...fields });
  });
});
