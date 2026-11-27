/**
 * US driver's license numbers: each state's formats, and the states whose number is built from the holder's name, birth
 * date and sex (owner, 2026-11-27: "verify the correct issued and non-fake DL"). Pure functions, no I/O.
 *
 * The formats are the table driver-license-validator 3.1.1 publishes (MIT, © Justin Lettau), itself from the NTSI
 * table. The derivations are rebuilt from published descriptions (A. De Smet, "US driver's license numbers";
 * J. Gallian, "Assigning Driver's License Numbers", Mathematics Magazine 64(1), 1991; COMAP, For All Practical
 * Purposes ch. 16): Florida's SSSS-FFF-YY-DDD-N, and Illinois' and Wisconsin's SSSS-FFFY-YDDD(-NN), with the same
 * first-name and middle-initial tables. Florida stopped deriving them for cards issued from 2024-07-31 (F.S.
 * 322.14(1)(a), ch. 2022-175: at least 4 random digits), so for those only the surname's initial is checked.
 */

/** Each state's license number formats (letters upper case, no spaces or dashes). */
const FORMATS: Readonly<Record<string, readonly RegExp[]>> = {
  AL: [/^\d{1,8}$/],
  AK: [/^\d{1,7}$/],
  AZ: [/^[A-Z]\d{8,9}$/, /^[A-Z]{2}\d{2,5}$/, /^\d{9}$/],
  AR: [/^\d{4,9}$/],
  CA: [/^[A-Z]\d{7}$/],
  CO: [/^\d{9}$/, /^[A-Z]\d{3,6}$/, /^[A-Z]{2}\d{2,5}$/],
  CT: [/^\d{9}$/],
  DE: [/^\d{1,7}$/],
  DC: [/^\d{7}$/, /^\d{9}$/],
  FL: [/^[A-Z]\d{12}$/],
  GA: [/^\d{7,9}$/],
  HI: [/^[A-Z]\d{8}$/, /^\d{9}$/],
  ID: [/^[A-Z]{2}\d{6}[A-Z]$/, /^\d{9}$/],
  IL: [/^[A-Z]\d{11,12}$/],
  IN: [/^[A-Z]\d{9}$/, /^\d{9,10}$/],
  IA: [/^\d{9}$/, /^\d{3}[A-Z]{2}\d{4}$/],
  KS: [/^(?:[A-Z]\d){2}[A-Z]$/, /^[A-Z]\d{8}$/, /^\d{9}$/],
  KY: [/^[A-Z]\d{8,9}$/, /^\d{9}$/],
  LA: [/^\d{1,9}$/],
  ME: [/^\d{7}$/, /^\d{7}[A-Z]$/, /^\d{8}$/],
  MD: [/^[A-Z]\d{12}$/],
  MA: [/^[A-Z]\d{8}$/, /^\d{9}$/],
  MI: [/^[A-Z]\d{10}$/, /^[A-Z]\d{12}$/],
  MN: [/^[A-Z]\d{12}$/],
  MS: [/^\d{9}$/],
  MO: [/^[A-Z]\d{5,9}$/, /^[A-Z]\d{6}R$/, /^\d{8}[A-Z]{2}$/, /^\d{9}[A-Z]$/, /^\d{9}$/, /^\d{3}[A-Z]\d{6}$/],
  MT: [/^[A-Z]\d{8}$/, /^\d{13}$/, /^\d{9}$/, /^\d{14}$/],
  NE: [/^[A-Z]\d{6,8}$/],
  NV: [/^\d{9,10}$/, /^\d{12}$/, /^X\d{8}$/],
  NH: [/^\d{2}[A-Z]{3}\d{5}$/],
  NJ: [/^[A-Z]\d{14}$/],
  NM: [/^\d{8,9}$/],
  NY: [/^[A-Z]\d{7}$/, /^[A-Z]\d{18}$/, /^\d{8,9}$/, /^\d{16}$/, /^[A-Z]{8}$/],
  NC: [/^\d{1,12}$/],
  ND: [/^[A-Z]{3}\d{6}$/, /^\d{9}$/],
  OH: [/^[A-Z]\d{4,8}$/, /^[A-Z]{2}\d{3,7}$/, /^\d{8}$/],
  OK: [/^[A-Z]\d{9}$/, /^\d{9}$/],
  OR: [/^\d{1,9}$/],
  PA: [/^\d{8}$/],
  RI: [/^\d{7}$/, /^[A-Z]\d{6}$/],
  SC: [/^\d{5,11}$/],
  SD: [/^\d{6,10}$/, /^\d{12}$/],
  TN: [/^\d{7,9}$/],
  TX: [/^\d{7,8}$/],
  UT: [/^\d{4,10}$/],
  VT: [/^\d{8}$/, /^\d{7}A$/],
  VA: [/^[A-Z]\d{8,11}$/, /^\d{9}$/],
  WA: [/^(?=.{12}$)[A-Z]{1,7}[A-Z0-9*]{4,11}$/],
  WV: [/^\d{7}$/, /^[A-Z]{1,2}\d{5,6}$/],
  WI: [/^[A-Z]\d{13}$/],
  WY: [/^\d{9,10}$/],
};

/** The number as states print and encode it, without spaces or dashes, upper case. */
export const licenseNumberKey = (number: string) => number.toUpperCase().replace(/[\s-]/g, '');

/** Whether the number has one of the state's formats; undefined for a state not in the table (territories, Canada). */
export function matchesStateFormat(state: string, number: string): boolean | undefined {
  const formats = FORMATS[state.toUpperCase()];
  if (!formats) return undefined;
  const key = licenseNumberKey(number);
  return formats.some((format) => format.test(key));
}

// ---- Soundex ----------------------------------------------------------------------------------------

const SOUNDEX_CODES: Record<string, string> = {
  B: '1', F: '1', P: '1', V: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

/**
 * American Soundex of a surname: its first letter and three digits. `nara`: the National Archives' rule (H and W don't
 * separate letters with the same code, so "ASHCRAFT" is A261), else the plain one (they do: A226). Prefixes and spaces
 * are kept as letters ("VAN DYKE" → VANDYKE). Null without a letter.
 */
export function soundex(name: string, nara = true): string | null {
  const letters = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (!letters) return null;
  const first = letters[0]!;
  let digits = '';
  let previous = SOUNDEX_CODES[first] ?? '';
  for (let i = 1; i < letters.length && digits.length < 3; i++) {
    const letter = letters[i]!;
    const code = SOUNDEX_CODES[letter];
    if (code) {
      if (code !== previous) digits += code;
      previous = code;
    } else if (nara && (letter === 'H' || letter === 'W')) {
      // NARA: H and W are skipped without resetting the previous code.
      continue;
    } else {
      // Vowels (and, in the plain rule, H and W) separate letters with the same code.
      previous = '';
    }
  }
  return `${first}${digits.padEnd(3, '0')}`;
}

// ---- Florida, Illinois, Wisconsin --------------------------------------------------------------------

/** Common first names' codes (the tables Florida, Illinois and Wisconsin share). */
const FIRST_NAMES: Readonly<Record<string, number>> = {
  ALBERT: 20, ALICE: 20, ANN: 40, ANNA: 40, ANNE: 40, ANNIE: 40, ARTHUR: 40, BERNARD: 80, BETTE: 80, BETTIE: 80, BETTY: 80, CARL: 120, CATHERINE: 120,
  CHARLES: 140, CLARA: 140, DONALD: 180, DOROTHY: 180, EDWARD: 220, ELIZABETH: 220, FLORENCE: 260, FRANK: 260, GEORGE: 300, GRACE: 300, HAROLD: 340,
  HARRIET: 340, HARRY: 360, HAZEL: 360, HELEN: 380, HENRY: 380, JAMES: 440, JANE: 440, JAYNE: 440, JEAN: 460, JOHN: 460, JOAN: 480, JOSEPH: 480,
  MARGARET: 560, MARTIN: 560, MARVIN: 580, MARY: 580, MELVIN: 600, MILDRED: 600, PATRICIA: 680, PAUL: 680, RICHARD: 740, RUBY: 740, ROBERT: 760,
  RUTH: 760, THELMA: 820, THOMAS: 820, WALTER: 900, WANDA: 900, WILLIAM: 920, WILMA: 920,
};
/** Other first names: by their initial. */
const FIRST_INITIALS: Readonly<Record<string, number>> = {
  A: 0, B: 60, C: 100, D: 160, E: 200, F: 240, G: 280, H: 320, I: 400, J: 420, K: 500, L: 520, M: 540, N: 620, O: 640, P: 660, Q: 700, R: 720, S: 780,
  T: 800, U: 840, V: 860, W: 880, X: 940, Y: 960, Z: 980,
};
/** The middle initial (none: 0). */
const MIDDLE_INITIALS: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10, K: 11, L: 12, M: 13, N: 14, O: 14, P: 15, Q: 15, R: 16, S: 17, T: 18, U: 18, V: 18, W: 19,
  X: 19, Y: 19, Z: 19,
};

const lettersOnly = (value: string | undefined) => (value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

/** The first name and middle initial's code (FFF). Undefined without a first name. */
export function firstNameCode(firstName: string, middleName?: string): number | undefined {
  const first = lettersOnly(firstName.split(/\s+/)[0]);
  if (!first) return undefined;
  const code = FIRST_NAMES[first] ?? FIRST_INITIALS[first[0]!]!;
  const middle = lettersOnly(middleName)[0];
  return code + (middle ? MIDDLE_INITIALS[middle]! : 0);
}

export interface Holder {
  surname: string;
  givenNames: string;
  middleNames?: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  sex?: 'male' | 'female' | 'unspecified';
}

/** How a number built from the holder compares, part by part: `birth` (year, month, day and sex) is the strong part. */
export interface DerivationCheck {
  state: 'FL' | 'IL' | 'WI';
  /** The surname's Soundex (either rule), the first-name code, the birth date and sex. */
  surname: boolean;
  firstName: boolean;
  birth: boolean;
}

const pad = (value: number, length: number) => String(value).padStart(length, '0');
const birthParts = (date: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : undefined;
};

/** The day code: (month − 1) × `perMonth` + day, plus `female` for women. */
const dayCode = (month: number, day: number, perMonth: number, female: number, sex: Holder['sex']) => (month - 1) * perMonth + day + (sex === 'female' ? female : 0);

/**
 * Checks a Florida, Illinois or Wisconsin number against the holder. Null for other states, a number that isn't in the
 * derived layout, a Florida card issued from 2024-07-31 (random digits), or a holder without a known sex (the day code
 * depends on it).
 *
 * - Florida: S SSS FFF YY DDD N — Soundex, first name, birth year, (month−1)×40+day (+500 female), overflow digit.
 * - Illinois: S SSS FFF Y YD DD (+ 1 digit on newer cards) — Soundex, first name, birth year, (month−1)×31+day (+600 female).
 * - Wisconsin: S SSS FFF Y YD DD NN — Soundex, first name, birth year, (month−1)×40+day (+500 female), 2 overflow digits.
 */
export function checkDerivedNumber(state: string, number: string, holder: Holder, issueDate?: string): DerivationCheck | null {
  const key = licenseNumberKey(number);
  const born = birthParts(holder.dateOfBirth);
  if (!born || (holder.sex !== 'male' && holder.sex !== 'female')) return null;
  const surnames = [soundex(holder.surname, true), soundex(holder.surname, false)].filter((code): code is string => code !== null);
  const first = firstNameCode(holder.givenNames, holder.middleNames);
  if (surnames.length === 0 || first === undefined) return null;
  const year = pad(born.year % 100, 2);
  if (state === 'FL') {
    if (!/^[A-Z]\d{12}$/.test(key)) return null;
    if (issueDate && issueDate >= '2024-07-31') return null;
    return {
      state: 'FL',
      surname: surnames.includes(key.slice(0, 4)),
      firstName: key.slice(4, 7) === pad(first, 3),
      birth: key.slice(7, 9) === year && key.slice(9, 12) === pad(dayCode(born.month, born.day, 40, 500, holder.sex), 3),
    };
  }
  if (state === 'IL') {
    if (!/^[A-Z]\d{11,12}$/.test(key)) return null;
    return {
      state: 'IL',
      surname: surnames.includes(key.slice(0, 4)),
      firstName: key.slice(4, 7) === pad(first, 3),
      birth: key.slice(7, 9) === year && key.slice(9, 12) === pad(dayCode(born.month, born.day, 31, 600, holder.sex), 3),
    };
  }
  if (state === 'WI') {
    if (!/^[A-Z]\d{13}$/.test(key)) return null;
    return {
      state: 'WI',
      surname: surnames.includes(key.slice(0, 4)),
      firstName: key.slice(4, 7) === pad(first, 3),
      birth: key.slice(7, 9) === year && key.slice(9, 12) === pad(dayCode(born.month, born.day, 40, 500, holder.sex), 3),
    };
  }
  return null;
}

/** A Florida card from 2024-07-31 on: the number still starts with the surname's initial (it changes only with the name). */
export function floridaInitialMatches(number: string, surname: string): boolean | undefined {
  const key = licenseNumberKey(number);
  const initial = lettersOnly(surname)[0];
  if (!/^[A-Z]\d{12}$/.test(key) || !initial) return undefined;
  return key[0] === initial;
}
