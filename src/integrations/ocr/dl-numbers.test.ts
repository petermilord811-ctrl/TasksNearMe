import { describe, expect, it } from 'vitest';
import { checkDerivedNumber, firstNameCode, floridaInitialMatches, matchesStateFormat, soundex } from './dl-numbers';

/**
 * License numbers: state formats, and the numbers Florida (before 2024-07-31), Illinois and Wisconsin build from the
 * holder. The Florida examples were checked against A. De Smet's calculator (2026-11-27).
 */

describe('Soundex', () => {
  it('codes surnames by the National Archives rule, and the plain one', () => {
    expect(soundex('Public')).toBe('P142');
    expect(soundex('Fakename')).toBe('F255');
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    expect(soundex('Tymczak')).toBe('T522');
    expect(soundex('Pfister')).toBe('P236');
    // H and W don't separate letters with the same code (NARA); they do in the plain rule.
    expect(soundex('Ashcraft')).toBe('A261');
    expect(soundex('Ashcraft', false)).toBe('A226');
    expect(soundex("O'Neil-Smith")).toBe('O542');
    expect(soundex('')).toBeNull();
  });
});

describe('the first-name code', () => {
  it('uses the common names, else the initial, plus the middle initial', () => {
    expect(firstNameCode('John', 'Q')).toBe(475);
    expect(firstNameCode('Maria', 'L')).toBe(552);
    expect(firstNameCode('William', 'A')).toBe(921);
    expect(firstNameCode('Zoe')).toBe(980);
    expect(firstNameCode('')).toBeUndefined();
  });
});

describe('a derived number', () => {
  it("checks a Florida number's surname, first name, birth year and day", () => {
    expect(checkDerivedNumber('FL', 'P142-475-85-471-0', { surname: 'Public', givenNames: 'John', middleNames: 'Q', dateOfBirth: '1985-12-31', sex: 'male' }, '2019-05-01')).toEqual({ state: 'FL', surname: true, firstName: true, birth: true });
    // A woman's day code adds 500: July 27 is 6 × 40 + 27 + 500.
    expect(checkDerivedNumber('FL', 'A261552907670', { surname: 'Ashcraft', givenNames: 'Maria', middleNames: 'L', dateOfBirth: '1990-07-27', sex: 'female' })).toEqual({ state: 'FL', surname: true, firstName: true, birth: true });
    // Either Soundex rule counts for the surname.
    expect(checkDerivedNumber('FL', 'A226552907670', { surname: 'Ashcraft', givenNames: 'Maria', middleNames: 'L', dateOfBirth: '1990-07-27', sex: 'female' })?.surname).toBe(true);
    expect(checkDerivedNumber('FL', 'F255921501210', { surname: 'Fakename', givenNames: 'William', middleNames: 'A', dateOfBirth: '1950-04-01', sex: 'male' })).toEqual({ state: 'FL', surname: true, firstName: true, birth: true });
  });

  it("tells a Florida number made for another birth date or sex", () => {
    // The same person a day later, and as a woman.
    expect(checkDerivedNumber('FL', 'P142475854720', { surname: 'Public', givenNames: 'John', middleNames: 'Q', dateOfBirth: '1985-12-31', sex: 'male' })?.birth).toBe(false);
    expect(checkDerivedNumber('FL', 'P142475854710', { surname: 'Public', givenNames: 'John', middleNames: 'Q', dateOfBirth: '1985-12-31', sex: 'female' })?.birth).toBe(false);
    // A nickname changes the first-name part only.
    expect(checkDerivedNumber('FL', 'P142475854710', { surname: 'Public', givenNames: 'Jack', middleNames: 'Q', dateOfBirth: '1985-12-31', sex: 'male' })).toMatchObject({ firstName: false, birth: true });
  });

  it("doesn't check Florida cards issued from 2024-07-31 (random digits), or without a known sex", () => {
    expect(checkDerivedNumber('FL', 'P142475854710', { surname: 'Public', givenNames: 'John', middleNames: 'Q', dateOfBirth: '1985-12-31', sex: 'male' }, '2024-07-31')).toBeNull();
    expect(checkDerivedNumber('FL', 'P142475854710', { surname: 'Public', givenNames: 'John', dateOfBirth: '1985-12-31', sex: 'unspecified' })).toBeNull();
    expect(checkDerivedNumber('TX', '12345678', { surname: 'Public', givenNames: 'John', dateOfBirth: '1985-12-31', sex: 'male' })).toBeNull();
  });

  it('checks Illinois (31 a month, +600) and Wisconsin numbers', () => {
    // Illinois: July 27 for a woman is 6 × 31 + 27 + 600 = 813.
    expect(checkDerivedNumber('IL', 'A26155290813', { surname: 'Ashcraft', givenNames: 'Maria', middleNames: 'L', dateOfBirth: '1990-07-27', sex: 'female' })).toEqual({ state: 'IL', surname: true, firstName: true, birth: true });
    expect(checkDerivedNumber('WI', 'A2615529076701', { surname: 'Ashcraft', givenNames: 'Maria', middleNames: 'L', dateOfBirth: '1990-07-27', sex: 'female' })).toEqual({ state: 'WI', surname: true, firstName: true, birth: true });
  });

  it("checks a newer Florida number's first letter only", () => {
    expect(floridaInitialMatches('P123456789012', 'Public')).toBe(true);
    expect(floridaInitialMatches('S123456789012', 'Public')).toBe(false);
    expect(floridaInitialMatches('12345678', 'Public')).toBeUndefined();
  });
});

describe('state formats', () => {
  it("knows Florida's and Texas's, and tells numbers that don't fit", () => {
    expect(matchesStateFormat('FL', 'S123-456-57-901-0')).toBe(true);
    expect(matchesStateFormat('FL', '12345678')).toBe(false);
    expect(matchesStateFormat('TX', '12345678')).toBe(true);
    expect(matchesStateFormat('TX', 'A1234567')).toBe(false);
    expect(matchesStateFormat('CA', 'A1234567')).toBe(true);
    expect(matchesStateFormat('WA', 'WDLABCD123EF')).toBe(true);
    expect(matchesStateFormat('ON', 'X1234')).toBeUndefined();
  });
});
