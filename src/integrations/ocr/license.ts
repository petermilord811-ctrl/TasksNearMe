import type { IdentityDocumentType } from '@/contracts';
import type { IdDocumentReading } from '@/integrations/ai/id-document-reader';
import { foldText, usNumericDate } from './text';
import type { OcrBox, OcrLine, OcrWord } from './types';

/**
 * The front of a US driver's license or state ID card, from OCR words: the fields of the AAMVA card design
 * (1 family name, 2 given names, 3 date of birth, 4a issued, 4b expires, 4d license or ID number) and the
 * printed labels most states use (DOB, EXP, ISS, DL, DLN, LN, FN). A field counts only when its label was
 * found, its value has the right shape and every word of it was read with confidence; a name printed without
 * a label is never split into given names and surname. The issuing state comes from the card's header (its
 * full name above the fields), never from the holder's address.
 */

/** Word confidence (Tesseract's 0–100) a field's words all need. */
export const FIELD_CONFIDENCE = 70;

const STATES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR',
  PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
  VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'PUERTO RICO': 'PR',
  GUAM: 'GU', 'VIRGIN ISLANDS': 'VI', 'AMERICAN SAMOA': 'AS', 'NORTHERN MARIANA ISLANDS': 'MP',
};
/** Longest first, so "WEST VIRGINIA" wins over "VIRGINIA". */
const STATE_NAMES = Object.keys(STATES).sort((a, b) => b.length - a.length);

export interface LicenseFront {
  surname?: string;
  givenNames?: string;
  /** YYYY-MM-DD. */
  dateOfBirth?: string;
  /** YYYY-MM-DD. */
  expiryDate?: string;
  documentNumber?: string;
  issuingState?: string;
  documentType?: IdentityDocumentType | 'other';
}

/** A run of words on one line with no wide gap: a card prints its fields in columns, and OCR may join them. */
interface Segment {
  words: OcrWord[];
  box: OcrBox;
}

function segmentsOf(lines: readonly OcrLine[]): Segment[] {
  const out: Segment[] = [];
  for (const line of lines) {
    const words = line.words.filter((word) => word.text.trim());
    if (words.length === 0) continue;
    const height = Math.max(1, ...words.map((word) => word.box.y1 - word.box.y0));
    let current: OcrWord[] = [words[0]!];
    for (const word of words.slice(1)) {
      if (word.box.x0 - current.at(-1)!.box.x1 > height * 1.5) {
        out.push(segment(current));
        current = [];
      }
      current.push(word);
    }
    out.push(segment(current));
  }
  return out;
}

function segment(words: OcrWord[]): Segment {
  return {
    words,
    box: { x0: Math.min(...words.map((w) => w.box.x0)), y0: Math.min(...words.map((w) => w.box.y0)), x1: Math.max(...words.map((w) => w.box.x1)), y1: Math.max(...words.map((w) => w.box.y1)) },
  };
}

const confident = (words: readonly OcrWord[]) => words.length > 0 && words.every((word) => word.confidence >= FIELD_CONFIDENCE);
const upper = (word: OcrWord) => word.text.toUpperCase();

type DateLabel = 'birth' | 'expiry' | 'issue';
/** Each date's label as a word of its own, and joined to its value ("DOB04/02/1990"). */
const DATE_LABELS: Array<[DateLabel, RegExp, RegExp]> = [
  ['birth', /^(?:3)?D[O0]B[:.]?$/, /^(?:3)?D[O0]B[:.]?(\S+)$/],
  ['expiry', /^(?:4B)?EXP(?:IRES|IRATION)?[:.]?$/, /^(?:4B)?EXP(?:IRES|IRATION)?[:.]?(\S+)$/],
  ['issue', /^(?:4A)?ISS(?:UED)?[:.]?$/, /^(?:4A)?ISS(?:UED)?[:.]?(\S+)$/],
];
const NUMBER_LABEL = /^(?:4D)?(?:DLN|DL|DL#|DLNO|LIC|LIC#|LICENSE|IDN|ID|ID#)[:.#]?$/;
const NAME_LABELS: Array<['surname' | 'givenNames', RegExp]> = [
  ['surname', /^(?:1|I|L|\||LN|LN:)$/],
  ['givenNames', /^(?:2|FN|FN:)$/],
];
const NAME_WORD = /^[A-Z][A-Z'-]*$/;
const LABEL_WORDS = new Set(['DOB', 'EXP', 'ISS', 'DLN', 'DL', 'SEX', 'HGT', 'EYES', 'CLASS', 'END', 'RSTR', 'DD', 'LN', 'FN', 'DONOR', 'VETERAN']);

/** The date right after a label: the next one to three words of the segment (OCR may split "04/02/ 1990"). */
function dateAfter(words: readonly OcrWord[]): { date: string; words: OcrWord[] } | undefined {
  for (let take = 1; take <= Math.min(3, words.length); take++) {
    const part = words.slice(0, take);
    const date = usNumericDate(part.map((word) => word.text).join(''));
    if (date) return { date, words: part };
  }
  return undefined;
}

/** A license or ID number: letters, digits and dashes, at least three digits ("D1234567", "S123-456-78-901-0", "123 456 789"). */
function numberAfter(words: readonly OcrWord[]): { value: string; words: OcrWord[] } | undefined {
  const first = words[0];
  if (!first) return undefined;
  // New York prints its numbers in groups of three.
  const groups = words.slice(0, 3);
  if (groups.length === 3 && groups.every((word) => /^\d{3}$/.test(word.text))) return { value: groups.map((word) => word.text).join(''), words: groups };
  const value = upper(first).replace(/[.,;:]$/, '');
  if (!/^[A-Z0-9][A-Z0-9-]{3,19}$/.test(value) || (value.match(/\d/g)?.length ?? 0) < 3) return undefined;
  return { value, words: [first] };
}

/** Name words after a label word, up to the next label (OCR may join "LN SAMPLE FN ALEX"). */
function namesAfter(words: readonly OcrWord[]): OcrWord[] | undefined {
  const out: OcrWord[] = [];
  for (const word of words) {
    const text = upper(word).replace(/[.,]$/, '');
    if (LABEL_WORDS.has(text) || /^\d/.test(text)) break;
    if (!NAME_WORD.test(text)) return undefined;
    out.push({ ...word, text });
  }
  return out.length > 0 && out.length <= 4 ? out : undefined;
}

/** Values found for one field; two different ones mean neither is trusted. */
class Found {
  private readonly values = new Map<string, Set<string>>();
  private readonly doubtful = new Set<string>();
  add(field: string, value: string, words: readonly OcrWord[]) {
    if (!confident(words)) {
      this.doubtful.add(field);
      return;
    }
    const set = this.values.get(field) ?? new Set<string>();
    set.add(value);
    this.values.set(field, set);
  }
  get(field: string): string | undefined {
    const set = this.values.get(field);
    return set && set.size === 1 && !this.doubtful.has(field) ? [...set][0] : undefined;
  }
}

function documentTypeOf(text: string): IdentityDocumentType | 'other' | undefined {
  if (/\b(?:IDENTIFICATION|ID) CARD\b/.test(text)) return 'state_id';
  if (/\bDRIVERS? LICEN[CS]E\b/.test(text)) return 'drivers_license';
  if (/\bPERMIT\b/.test(text)) return 'other';
  return undefined;
}

function stateIn(text: string): string | undefined {
  const found = new Set<string>();
  let rest = ` ${text} `;
  for (const name of STATE_NAMES) {
    if (rest.includes(` ${name} `)) {
      found.add(STATES[name]!);
      rest = rest.replaceAll(` ${name} `, ' ');
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/** Years a license's dates may span from today: born within 125 years, expiring within 15. */
function plausible(found: { dateOfBirth?: string; expiryDate?: string; issueDate?: string }, today: Date): boolean {
  const year = today.getUTCFullYear();
  const { dateOfBirth, expiryDate, issueDate } = found;
  if (!dateOfBirth || !expiryDate) return false;
  const born = Number(dateOfBirth.slice(0, 4));
  const expires = Number(expiryDate.slice(0, 4));
  if (born < year - 125 || dateOfBirth > today.toISOString().slice(0, 10) || expires > year + 15 || expiryDate <= dateOfBirth) return false;
  return !issueDate || (issueDate > dateOfBirth && issueDate < expiryDate);
}

/** The fields of a license or ID card's front that were read confidently. `today` checks the dates are plausible. */
export function readLicenseFront(lines: readonly OcrLine[], today: Date): LicenseFront {
  const segments = segmentsOf(lines);
  const found = new Found();
  let firstFieldTop = Infinity;
  const noteField = (box: OcrBox) => (firstFieldTop = Math.min(firstFieldTop, box.y0));

  for (const seg of segments) {
    const words = seg.words.map((word) => ({ ...word, text: word.text.trim() }));
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      const text = upper(word);
      // "3 DOB 04/02/1990", "DOB: 04/02/1990", "DOB04/02/1990"
      for (const [field, label, joinedLabel] of DATE_LABELS) {
        const joined = text.match(joinedLabel)?.[1];
        const joinedDate = joined ? usNumericDate(joined) : undefined;
        if (label.test(text)) {
          const value = dateAfter(words.slice(i + 1));
          if (value) found.add(field, value.date, value.words);
          noteField(seg.box);
        } else if (joinedDate) {
          found.add(field, joinedDate, [word]);
          noteField(seg.box);
        }
      }
      // "4d DLN 12345678", "DL 12345678", "ID: 123 456 789"
      if (NUMBER_LABEL.test(text)) {
        const value = numberAfter(words.slice(i + 1));
        if (value) {
          found.add('number', value.value, value.words);
          noteField(seg.box);
        }
      }
    }
    // "1 SAMPLE", "2 ALEX RIVER", "LN SAMPLE", "FN ALEX", "1SAMPLE"
    const first = words[0] ? upper(words[0]) : '';
    for (const [field, label] of NAME_LABELS) {
      const joinedName = field === 'surname' ? first.match(/^[1|]([A-Z][A-Z'-]+)$/) : first.match(/^2([A-Z][A-Z'-]+)$/);
      const names = label.test(first) ? namesAfter(words.slice(1)) : joinedName ? namesAfter([{ ...words[0]!, text: joinedName[1]! }, ...words.slice(1)]) : undefined;
      if (names) {
        found.add(field, names.map((name) => name.text).join(' '), names);
        noteField(seg.box);
      }
    }
  }

  const dates = { dateOfBirth: found.get('birth'), expiryDate: found.get('expiry'), issueDate: found.get('issue') };
  const datesOk = plausible(dates, today);
  const allText = foldText(segments.map((seg) => seg.words.map((word) => word.text).join(' ')).join(' \n '));
  const header = foldText(segments.filter((seg) => seg.box.y1 <= firstFieldTop).map((seg) => seg.words.map((word) => word.text).join(' ')).join(' \n '));
  const surname = found.get('surname');
  const givenNames = found.get('givenNames');
  const number = found.get('number');
  const issuingState = Number.isFinite(firstFieldTop) ? stateIn(header) : undefined;
  const documentType = documentTypeOf(allText);
  return {
    ...(surname ? { surname } : {}),
    ...(givenNames ? { givenNames } : {}),
    ...(datesOk ? { dateOfBirth: dates.dateOfBirth!, expiryDate: dates.expiryDate! } : {}),
    ...(number ? { documentNumber: number } : {}),
    ...(issuingState ? { issuingState } : {}),
    ...(documentType ? { documentType } : {}),
  };
}

/** A front with all `readable` needs: the name, birth date and expiry. */
export const completeFront = (front: LicenseFront): boolean => Boolean(front.surname && front.givenNames && front.dateOfBirth && front.expiryDate);

/**
 * One reading from the passes made over the same photo: the name, birth date and expiry of the passes that read them
 * all, which must agree (passes that disagree are no reading at all). The number is kept only where those passes
 * agree on it; the card's kind and state come from any pass (the header doesn't depend on the fields), if no two
 * passes disagree. Unreadable when no pass read the fields.
 */
export function combineFronts(fronts: readonly LicenseFront[]): IdDocumentReading {
  const full = fronts.filter(completeFront);
  const essentials = (front: LicenseFront) => [front.surname, front.givenNames, front.dateOfBirth, front.expiryDate].join('|');
  if (full.length === 0 || new Set(full.map(essentials)).size > 1) return { readable: false };
  const agreed = <K extends 'documentNumber' | 'documentType' | 'issuingState'>(key: K, from: readonly LicenseFront[]): Partial<Pick<LicenseFront, K>> => {
    const values = new Set(from.map((front) => front[key]).filter((value) => value !== undefined));
    return values.size === 1 ? ({ [key]: [...values][0] } as Partial<Pick<LicenseFront, K>>) : {};
  };
  const { surname, givenNames, dateOfBirth, expiryDate } = full[0]!;
  return { readable: true, surname, givenNames, dateOfBirth, expiryDate, ...agreed('documentNumber', full), ...agreed('documentType', fronts), ...agreed('issuingState', fronts) };
}
