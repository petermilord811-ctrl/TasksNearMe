import { isoDate } from './text';

/**
 * The machine-readable zone of a passport's photo page (ICAO Doc 9303 part 4, TD3: two lines of 44
 * characters), read from OCR lines. Every check digit must pass: the document number's, the birth date's, the
 * expiry's, the personal number's and the composite one; any failure is no reading at all. OCR slips are
 * corrected only within the MRZ's alphabet (A–Z, 0–9 and the filler `<`), in the cheapest way the check digits
 * accept: a letter read in a digit field (O for 0), a dropped or doubled character, a run of fillers read as
 * K or L. When two different corrections both pass, the zone is ambiguous and nothing is returned.
 */

const FILLER = '<';
const WEIGHTS = [7, 3, 1] as const;

function charValue(ch: string): number {
  if (ch === FILLER) return 0;
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return code - 55;
  return -1;
}

/** The ICAO 9303 check digit of a field (weights 7, 3, 1; letters A=10 … Z=35; the filler is 0). -1 for a character outside the alphabet. */
export function mrzCheckDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const value = charValue(field[i]!);
    if (value < 0) return -1;
    sum += value * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

/** An OCR line as MRZ characters: upper case, look-alikes of the filler read as fillers, everything else dropped. */
export function mrzCharacters(line: string): string {
  return line
    .toUpperCase()
    .replace(/«/g, '<<')
    .replace(/[‹(\[{⟨]/g, FILLER)
    .replace(/[^A-Z0-9<]/g, '');
}

/** Digits a letter stands for in a digit-only field. */
const DIGIT_FOR: Record<string, string> = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
/** Letters a digit stands for in a letter-only field. */
const LETTER_FOR: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };
/** Look-alikes a letter-and-digit field may hold either way; trying one costs one correction. */
const SWAPS: Record<string, string> = { O: '0', '0': 'O', D: '0', Q: '0', I: '1', '1': 'I', L: '1', B: '8', '8': 'B', S: '5', '5': 'S', Z: '2', '2': 'Z', G: '6', '6': 'G' };

function asDigits(field: string): string | null {
  let out = '';
  for (const ch of field) {
    const digit = ch >= '0' && ch <= '9' ? ch : DIGIT_FOR[ch];
    if (!digit) return null;
    out += digit;
  }
  return out;
}

function asLetters(field: string): string | null {
  let out = '';
  for (const ch of field) {
    const letter = (ch >= 'A' && ch <= 'Z') || ch === FILLER ? ch : LETTER_FOR[ch];
    if (!letter) return null;
    out += letter;
  }
  return out;
}

/** "YYMMDD" as a date: a birth date is in the past, an expiry within 30 years of `today`. */
function zoneDate(yymmdd: string, kind: 'birth' | 'expiry', today: Date): string | undefined {
  const [yy, mm, dd] = [Number(yymmdd.slice(0, 2)), Number(yymmdd.slice(2, 4)), Number(yymmdd.slice(4, 6))];
  const thisYear = today.getUTCFullYear();
  const year = kind === 'birth' ? (2000 + yy > thisYear ? 1900 + yy : 2000 + yy) : 2000 + yy > thisYear + 30 ? 1900 + yy : 2000 + yy;
  return isoDate(year, mm, dd);
}

/**
 * What the second line gives: only fields its check digits cover. The nationality and sex aren't covered, so a
 * correction there can't be told from another; they're checked for shape and not kept.
 */
interface LineTwo {
  documentNumber: string;
  dateOfBirth: string;
  expiryDate: string;
}

/** Up to `budget` look-alike swaps in a letter-and-digit field, cheapest first, as [text, swaps used]. */
function swapVariants(field: string, budget: number): Array<[string, number]> {
  const out: Array<[string, number]> = [[field, 0]];
  if (budget < 1) return out;
  const positions = [...field].flatMap((ch, index) => (SWAPS[ch] ? [index] : []));
  const swap = (text: string, index: number) => text.slice(0, index) + SWAPS[text[index]!]! + text.slice(index + 1);
  for (const a of positions) out.push([swap(field, a), 1]);
  if (budget >= 2) for (const a of positions) for (const b of positions) if (b > a) out.push([swap(swap(field, a), b), 2]);
  return out;
}

/** A run of fillers at the end of the personal number, misread as K, L or C, read back as fillers. */
function fillerTail(field: string): string {
  const match = field.match(/[<KLC]{2,}$/);
  return match ? field.slice(0, match.index) + FILLER.repeat(match[0].length) : field;
}

/** Every reading of a 44-character second line whose check digits all pass, each with the swaps it took. */
function readLineTwo(line: string, budget: number, today: Date): Array<[LineTwo, number]> {
  if (line.length !== 44) return [];
  const checks = asDigits(line[9]! + line[19]! + line[27]! + line[43]!);
  const nationality = asLetters(line.slice(10, 13));
  const birth = asDigits(line.slice(13, 19));
  const expiry = asDigits(line.slice(21, 27));
  const sex = /[KLC]/.test(line[20]!) ? FILLER : line[20]!;
  if (!checks || !nationality || !birth || !expiry || !'MFX<'.includes(sex)) return [];
  const [numberCheck, birthCheck, expiryCheck, composite] = [...checks].map(Number) as [number, number, number, number];
  if (mrzCheckDigit(birth) !== birthCheck || mrzCheckDigit(expiry) !== expiryCheck) return [];
  const dateOfBirth = zoneDate(birth, 'birth', today);
  const expiryDate = zoneDate(expiry, 'expiry', today);
  if (!dateOfBirth || !expiryDate) return [];
  const out: Array<[LineTwo, number]> = [];
  const personalFields = [...new Set([line.slice(28, 42), fillerTail(line.slice(28, 42))])];
  for (const [number, numberSwaps] of swapVariants(line.slice(0, 9), budget)) {
    if (mrzCheckDigit(number) !== numberCheck) continue;
    for (const personalRead of personalFields) {
      for (const [personal, personalSwaps] of swapVariants(personalRead, budget - numberSwaps)) {
        const empty = /^<+$/.test(personal);
        // No personal number (a US passport): its check digit may be a filler too, misread like the rest.
        const personalCheck = empty && /[KLC]/.test(line[42]!) ? FILLER : line[42]!;
        const personalOk = empty ? personalCheck === FILLER || personalCheck === '0' : asDigits(personalCheck) === String(mrzCheckDigit(personal));
        if (!personalOk) continue;
        const personalDigit = empty ? personalCheck : asDigits(personalCheck)!;
        const compositeField = `${number}${numberCheck}${birth}${birthCheck}${expiry}${expiryCheck}${personal}${personalDigit}`;
        if (mrzCheckDigit(compositeField) !== composite) continue;
        out.push([{ documentNumber: number.replaceAll(FILLER, ''), dateOfBirth, expiryDate }, numberSwaps + personalSwaps]);
      }
    }
  }
  return out;
}

/** Ways to make a line 44 characters long by dropping or adding (filler) characters, with how many it took. */
function lengthVariants(line: string): Array<[string, number]> {
  const n = line.length;
  if (n === 44) return [[line, 0]];
  const out = new Map<string, number>();
  if (n === 45) for (let i = 0; i < n; i++) out.set(line.slice(0, i) + line.slice(i + 1), 1);
  if (n === 46) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.set(line.slice(0, i) + line.slice(i + 1, j) + line.slice(j + 1), 2);
  if (n === 43) for (let i = 0; i <= n; i++) out.set(line.slice(0, i) + FILLER + line.slice(i), 1);
  if (n === 42) for (let i = 0; i <= n; i++) for (let j = i; j <= n; j++) out.set(`${line.slice(0, i)}${FILLER}${line.slice(i, j)}${FILLER}${line.slice(j)}`, 2);
  return [...out];
}

/** The most corrections a reading may take (dropped, added or swapped characters). */
const MAX_CORRECTIONS = 2;

/** The second line's reading at the lowest cost the check digits accept, or null when there's none or two disagree. */
export function readSecondLine(raw: string, today: Date): LineTwo | null {
  const results = new Map<string, LineTwo>();
  let bestCost = Infinity;
  for (const [line, lengthCost] of lengthVariants(raw)) {
    for (const [reading, swaps] of readLineTwo(line, MAX_CORRECTIONS - lengthCost, today)) {
      const cost = lengthCost + swaps;
      if (cost > bestCost) continue;
      if (cost < bestCost) {
        bestCost = cost;
        results.clear();
      }
      results.set(JSON.stringify(reading), reading);
    }
  }
  return results.size === 1 ? [...results.values()][0]! : null;
}

interface LineOne {
  issuingState: string;
  surname: string[];
  givenNames: string[];
}

/** The first line: "P", the passport's type, the issuing state and the names (no check digit covers them). */
export function readFirstLine(line: string): LineOne | null {
  if (line[0] !== 'P' || line.length < 10) return null;
  const issuingState = asLetters(line.slice(2, 5));
  if (!issuingState || issuingState.startsWith(FILLER)) return null;
  const names = line.slice(5);
  const split = names.indexOf('<<');
  if (split <= 0) return null;
  const surname = names.slice(0, split).split(FILLER).filter(Boolean);
  const rest = names.slice(split + 2);
  const end = rest.indexOf('<<');
  const givenNames = (end >= 0 ? rest.slice(0, end) : rest).split(FILLER).filter(Boolean);
  if (surname.length === 0 || surname.some((word) => !/^[A-Z]+$/.test(word))) return null;
  return { issuingState: issuingState.replaceAll(FILLER, ''), surname, givenNames: givenNames.filter((word) => /^[A-Z]+$/.test(word)) };
}

/** A passport's machine-readable zone, every check digit passed. The names are as line 1 reads (see `confirmedNames`). */
export interface PassportZone extends LineOne, LineTwo {}

/**
 * The TD3 zone among OCR lines: a first line starting with "P" right above a second line whose check digits
 * pass. Null when there's no such pair.
 */
export function findPassportZone(lines: readonly string[], today: Date): PassportZone | null {
  const rows = lines.map(mrzCharacters);
  for (let i = 1; i < rows.length; i++) {
    const second = rows[i]!;
    if (second.length < 42 || second.length > 46 || (second.match(/\d/g)?.length ?? 0) < 12) continue;
    const lineTwo = readSecondLine(second, today);
    if (!lineTwo) continue;
    const lineOne = readFirstLine(rows[i - 1]!);
    if (lineOne) return { ...lineOne, ...lineTwo };
  }
  return null;
}

/** Fillers OCR reads as letters: what a name word may carry after its last real letter. */
const FILLER_LOOKALIKES = /^[KLC<]+$/;

/** The longest start of `word` that's a printed word, when what's cut off looks like fillers. */
function printedForm(word: string, printed: ReadonlySet<string>): string | undefined {
  if (printed.has(word)) return word;
  for (let end = word.length - 1; end >= 2; end--) {
    if (FILLER_LOOKALIKES.test(word.slice(end)) && printed.has(word.slice(0, end))) return word.slice(0, end);
  }
  return undefined;
}

/**
 * The names of line 1, kept only when the page's printed text shows the same words: no check digit covers line 1,
 * and OCR reads a run of fillers as letters. Every surname word and the first given name must be printed on the
 * page (folded words); later given names are kept while they are too. Null when the names aren't confirmed.
 */
export function confirmedNames(zone: Pick<PassportZone, 'surname' | 'givenNames'>, printed: ReadonlySet<string>): { surname: string; givenNames: string } | null {
  if (zone.givenNames.length === 0 || zone.surname.some((word) => !printed.has(word))) return null;
  const given: string[] = [];
  for (const word of zone.givenNames) {
    const form = printedForm(word, printed);
    if (!form) break;
    given.push(form);
  }
  if (given.length === 0) return null;
  return { surname: zone.surname.join(' '), givenNames: given.join(' ') };
}
