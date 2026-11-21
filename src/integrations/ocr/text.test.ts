import { describe, expect, it } from 'vitest';
import { datesIn, foldText, isoDate, sameWord, usNumericDate, words } from './text';

describe('document text helpers', () => {
  it('folds words to plain upper-case ASCII', () => {
    expect(foldText("Núñez-O'Brien, Jr.")).toBe('NUNEZ OBRIEN JR');
    expect(words('  1234 Example Ln., #2 ')).toEqual(['1234', 'EXAMPLE', 'LN', '2']);
  });

  it('forgives small OCR slips in long words only', () => {
    expect(sameWord('SAMPLE', 'SAMPLE')).toBe(true);
    expect(sameWord('SAMPLE', 'SARNPLE')).toBe(true);
    expect(sameWord('SAMPLE', '5AMPLE')).toBe(true);
    expect(sameWord('EXAMPLE', 'EXAMPLF')).toBe(true);
    expect(sameWord('LEE', 'LEO')).toBe(false);
    expect(sameWord('SAMPLE', 'SIMPLER')).toBe(false);
    expect(sameWord('78723', '78728')).toBe(false);
  });

  it('reads US dates, and only real ones', () => {
    expect(usNumericDate('04/02/1990')).toBe('1990-04-02');
    expect(usNumericDate('O4-O2-199O')).toBe('1990-04-02');
    expect(usNumericDate('02/30/1990')).toBeUndefined();
    expect(usNumericDate('04/02/90')).toBeUndefined();
    expect(isoDate(2028, 2, 29)).toBe('2028-02-29');
    expect(isoDate(2027, 2, 29)).toBeUndefined();
    const today = new Date('2026-11-21T12:00:00Z');
    expect(datesIn('Statement 11/12/26, due Dec. 5, 2026; period 2026-10-01 to 31 Oct 2026. Since 3/1/2015.', today)).toEqual(['2015-03-01', '2026-10-01', '2026-10-31', '2026-11-12', '2026-12-05']);
    expect(datesIn('Account 0042-118-7731, 612 kWh, $88.45, 13/45/2026', today)).toEqual([]);
  });
});
