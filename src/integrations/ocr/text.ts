/**
 * Text helpers shared by the server's document readers: words folded to plain upper-case ASCII, small OCR
 * slips forgiven, and dates read from the ways US documents print them. Pure functions, no I/O.
 */

/** "Núñez-O'Brien" → "NUNEZ OBRIEN": accents dropped, apostrophes removed, other punctuation is a space. */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/['’‘`´]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** The folded words of a text, in order. */
export function words(text: string): string[] {
  const folded = foldText(text);
  return folded ? folded.split(' ') : [];
}

/** Edit distance, stopping early once it passes `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/** Letters OCR reads as digits, put back for words that should be all letters (names, streets). */
const LETTER_FOR_DIGIT: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };

/** Letter pairs OCR reads for one letter ("rn" for "m", "vv" for "w"), as that letter. */
const squash = (word: string) => word.replace(/RN/g, 'M').replace(/VV/g, 'W');

/**
 * The same word, allowing for small OCR slips: equal once digits that look like letters are read as letters,
 * and "rn" as "m"; or one letter off for words of five letters or more. Short words, and anything with a digit
 * in it (a house number, a ZIP, "1ST"), must be exact.
 */
export function sameWord(expected: string, read: string): boolean {
  if (expected === read) return true;
  if (/[0-9]/.test(expected)) return false;
  const lettered = squash(read.replace(/[012568]/g, (digit) => LETTER_FOR_DIGIT[digit] ?? digit));
  const target = squash(expected);
  if (target === lettered) return true;
  return expected.length >= 5 && editDistance(target, lettered, 1) <= 1;
}

/** "YYYY-MM-DD" for a real calendar date (Feb 30 is none). */
export function isoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Digits OCR reads as letters, put back inside a date or a number. */
const DIGIT_FOR_LETTER: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', l: '1', '|': '1', Z: '2', S: '5', G: '6', B: '8' };

export function digitsOnly(text: string): string {
  return text.replace(/[OQDILl|ZSGB]/g, (letter) => DIGIT_FOR_LETTER[letter] ?? letter);
}

/**
 * A US-style numeric date with a four-digit year, as licenses print them: "04/02/1990", "04-02-1990",
 * "04.02.1990" (month first). Undefined for anything else, including two-digit years.
 */
export function usNumericDate(text: string): string | undefined {
  const match = digitsOnly(text.trim()).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return undefined;
  return isoDate(Number(match[3]), Number(match[1]), Number(match[2]));
}

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7,
  AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
};
const MONTH_NAME = 'JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?';

/** A two-digit year on a statement: this century, unless that lands in the future. */
function fullYear(two: number, today: Date): number {
  const year = 2000 + two;
  return year > today.getUTCFullYear() + 1 ? year - 100 : year;
}

/**
 * Every date a document's text shows, in the formats US bills, statements and letters use: 11/12/2026,
 * 11/12/26, 11-12-2026, 2026-11-12, Nov 12, 2026, November 12 2026, 12 Nov 2026 and Nov. 12, 2026.
 * Numeric dates are read month first. `today` only settles two-digit years.
 */
export function datesIn(text: string, today: Date): string[] {
  const found = new Set<string>();
  const upper = text.toUpperCase();
  const add = (date: string | undefined) => {
    if (date) found.add(date);
  };
  // A sentence may end right after a date ("since 3/1/2015."), so only a digit after the dot rules it out.
  for (const match of upper.matchAll(/(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/-]|\.\d)/g)) {
    const year = match[3]!.length === 4 ? Number(match[3]) : fullYear(Number(match[3]), today);
    add(isoDate(year, Number(match[1]), Number(match[2])));
  }
  for (const match of upper.matchAll(/(?<![\d/.-])(\d{4})-(\d{2})-(\d{2})(?![\d/-]|\.\d)/g)) add(isoDate(Number(match[1]), Number(match[2]), Number(match[3])));
  for (const match of upper.matchAll(new RegExp(`\\b(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?,?\\s+(\\d{4})\\b`, 'g'))) {
    add(isoDate(Number(match[3]), MONTHS[match[1]!]!, Number(match[2])));
  }
  for (const match of upper.matchAll(new RegExp(`\\b(\\d{1,2})(?:ST|ND|RD|TH)?\\s+(${MONTH_NAME})\\.?,?\\s+(\\d{4})\\b`, 'g'))) {
    add(isoDate(Number(match[3]), MONTHS[match[2]!]!, Number(match[1])));
  }
  return [...found].sort();
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
