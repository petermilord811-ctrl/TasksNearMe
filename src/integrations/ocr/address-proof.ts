import type { AddressDocumentType } from '@/contracts';
import type { AddressDocumentInput, AddressDocumentReading } from '@/integrations/ai/document-reader';
import { datesIn, daysBetween, foldText, sameWord, words } from './text';

/**
 * The answers about a proof of address, from its text (a PDF's own text, or OCR of a photo): is there enough
 * text to read, is it addressed to the account's name, does it show the address entered, is it dated within
 * 90 days of the upload, and what kind of document it looks like. Only the answers leave this module.
 * A "no" needs text read with confidence: from a shaky OCR, a name, address or date that isn't found is left
 * out ("not sure") rather than answered no.
 */

export interface ProofText {
  text: string;
  /** A PDF's own text, or OCR read with confidence. */
  confident: boolean;
}

/** Words a document needs before anything is judged. */
export const MIN_WORDS = 20;
/** How old a proof may be (ADDRESS_PROOF_RULES.maxAgeDays). */
const MAX_AGE_DAYS = 90;

/**
 * The account's name on the document: the first and last names (the expected name's first and last words)
 * within three words of each other, either order ("ALEX R SAMPLE", "SAMPLE, ALEX"), the first name allowed to be
 * an initial ("A SAMPLE", "A. R. SAMPLE"). Middle names, case, punctuation and small OCR slips don't matter.
 */
export function nameOnDocument(tokens: readonly string[], name: string): boolean | undefined {
  const parts = words(name);
  if (parts.length < 2) return undefined;
  const first = parts[0]!;
  const last = parts.at(-1)!;
  const initial = (token: string | undefined) => token === first[0];
  for (let i = 0; i < tokens.length; i++) {
    if (!sameWord(last, tokens[i]!)) continue;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (sameWord(first, tokens[j]!)) return true;
      // An initial, then only initials up to the surname.
      if (initial(tokens[j]) && tokens.slice(j + 1, i).every((token) => token.length === 1)) return true;
    }
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 2); j++) {
      if (sameWord(first, tokens[j]!) || (j === i + 1 && initial(tokens[j]))) return true;
    }
  }
  return false;
}

/** Street words as USPS abbreviates them, so "Avenue" and "Ave", or "North" and "N", are the same word. */
const STREET_WORDS: Record<string, string> = {
  STREET: 'ST', STR: 'ST', AVENUE: 'AVE', AV: 'AVE', AVN: 'AVE', ROAD: 'RD', BOULEVARD: 'BLVD', DRIVE: 'DR', LANE: 'LN', COURT: 'CT',
  PLACE: 'PL', PARKWAY: 'PKWY', HIGHWAY: 'HWY', CIRCLE: 'CIR', TERRACE: 'TER', TRAIL: 'TRL', SQUARE: 'SQ', CROSSING: 'XING', COVE: 'CV',
  POINT: 'PT', RIDGE: 'RDG', HOLLOW: 'HOLW', BEND: 'BND', CREEK: 'CRK', GROVE: 'GRV', HEIGHTS: 'HTS', MEADOW: 'MDW', MEADOWS: 'MDWS',
  PLAZA: 'PLZ', EXPRESSWAY: 'EXPY', FREEWAY: 'FWY', CENTER: 'CTR', ALLEY: 'ALY', CANYON: 'CYN', GLEN: 'GLN', HILL: 'HL', HILLS: 'HLS',
  JUNCTION: 'JCT', LAKE: 'LK', MANOR: 'MNR', MOUNT: 'MT', MOUNTAIN: 'MTN', SPRINGS: 'SPGS', STATION: 'STA', VALLEY: 'VLY', VIEW: 'VW',
  VILLAGE: 'VLG', VISTA: 'VIS', PASS: 'PASS', PATH: 'PATH', LOOP: 'LOOP', WAY: 'WAY', RUN: 'RUN', ROW: 'ROW', WALK: 'WALK', PIKE: 'PIKE',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
  FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH',
};
const SUFFIXES = new Set(Object.values(STREET_WORDS).filter((word) => !/^(?:[NSEW]|NE|NW|SE|SW|\d+(?:ST|ND|RD|TH))$/.test(word)));
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
const UNIT_WORDS = new Set(['APT', 'APARTMENT', 'UNIT', 'STE', 'SUITE', 'NO', 'NUMBER', 'BLDG', 'BUILDING', 'LOT', 'RM', 'ROOM', 'FL', 'FLOOR']);

const streetWord = (word: string) => STREET_WORDS[word] ?? word;

interface StreetAddress {
  number: string;
  direction?: string;
  street: string[];
  suffix?: string;
  zip: string;
}

/** "1234 Example Lane, Apt 2, Austin, TX 78723" → the house number, the street's own words, its suffix and the ZIP. */
export function parseStreetAddress(address: string): StreetAddress | undefined {
  const zip = address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  const firstLine = address.split(',')[0] ?? '';
  const line = words(firstLine.replace(/#.*$/, '')).map(streetWord);
  const unit = line.findIndex((word) => UNIT_WORDS.has(word));
  const parts = unit > 0 ? line.slice(0, unit) : line;
  const number = parts[0];
  if (!zip || !number || !/^\d+[A-Z]?$/.test(number)) return undefined;
  let street = parts.slice(1);
  if (street.length > 1 && DIRECTIONS.has(street.at(-1)!)) street = street.slice(0, -1);
  const suffix = street.length > 1 && SUFFIXES.has(street.at(-1)!) ? street.at(-1) : undefined;
  if (suffix) street = street.slice(0, -1);
  const direction = street.length > 1 && DIRECTIONS.has(street[0]!) ? street[0] : undefined;
  if (direction) street = street.slice(1);
  if (street.length === 0) return undefined;
  return { number, ...(direction ? { direction } : {}), street, ...(suffix ? { suffix } : {}), zip };
}

/**
 * The address entered, on the document: its house number followed by its street (a direction like "N" may be
 * there or not; the suffix may be missing, but not a different one: "Example Ct" isn't "Example Ln"), and its
 * five-digit ZIP anywhere (a ZIP+4 counts). The unit doesn't matter.
 */
export function addressOnDocument(tokens: readonly string[], address: string): boolean | undefined {
  const expected = parseStreetAddress(address);
  if (!expected) return undefined;
  const read = tokens.map(streetWord);
  if (!read.includes(expected.zip)) return false;
  for (let i = 0; i < read.length; i++) {
    if (read[i] !== expected.number) continue;
    let j = i + 1;
    // A direction may be left out on either side, but not a different one.
    if (DIRECTIONS.has(read[j] ?? '')) {
      if (expected.direction && read[j] !== expected.direction) continue;
      j++;
    }
    if (!expected.street.every((word, k) => read[j + k] !== undefined && sameWord(word, read[j + k]!))) continue;
    const next = read[j + expected.street.length];
    if (expected.suffix && next !== undefined && SUFFIXES.has(next) && next !== expected.suffix) continue;
    return true;
  }
  return false;
}

/**
 * Dated within 90 days of the upload: some date on it falls in the 90 days up to the day it was sent (a day's
 * leeway for time zones). No when every date up to then is older; not sure when it shows no such date (a due
 * date in the future alone says nothing).
 */
export function recentOnDocument(text: string, submittedOn: string): boolean | undefined {
  const past = datesIn(text, new Date(`${submittedOn}T12:00:00Z`)).filter((date) => daysBetween(submittedOn, date) <= 1);
  if (past.length === 0) return undefined;
  return past.some((date) => daysBetween(date, submittedOn) <= MAX_AGE_DAYS);
}

/** Words and phrases (folded) that point to each kind of document: 3 points for telling ones, 1 for the rest. */
const KIND_WORDS: Record<AddressDocumentType, { strong: string[]; weak: string[] }> = {
  utility_bill: {
    strong: ['KWH', 'KILOWATT', 'KILOWATT HOURS', 'METER READING', 'METER NUMBER', 'ELECTRIC SERVICE', 'WATER SERVICE', 'SEWER', 'WASTEWATER', 'NATURAL GAS', 'GAS SERVICE', 'UTILITY', 'UTILITIES', 'ELECTRICITY', 'THERMS', 'CCF'],
    weak: ['ELECTRIC', 'WATER', 'ENERGY', 'POWER', 'TRASH', 'SOLID WASTE', 'STORMWATER', 'USAGE', 'GALLONS'],
  },
  phone_or_internet_bill: {
    strong: ['INTERNET', 'WIRELESS', 'BROADBAND', 'CELLULAR', 'MOBILE', 'TELEPHONE', 'PHONE', 'DATA PLAN', 'FIBER', 'WIFI', 'WI FI', 'MBPS', 'GBPS'],
    weak: ['CABLE', 'TV', 'LINE', 'DEVICE', 'MINUTES', 'TEXT'],
  },
  bank_statement: {
    strong: ['BANK', 'CHECKING', 'SAVINGS', 'BEGINNING BALANCE', 'ENDING BALANCE', 'STATEMENT PERIOD', 'DEPOSITS', 'WITHDRAWALS', 'CREDIT UNION', 'ROUTING', 'AVAILABLE BALANCE', 'DAILY BALANCE'],
    weak: ['BALANCE', 'TRANSACTIONS', 'INTEREST', 'FDIC', 'ACCOUNT SUMMARY'],
  },
  lease: {
    strong: ['LEASE', 'RENTAL AGREEMENT', 'LEASE AGREEMENT', 'LANDLORD', 'TENANT', 'LESSEE', 'LESSOR', 'SECURITY DEPOSIT', 'PREMISES', 'MONTHLY RENT'],
    weak: ['RENT', 'OCCUPANT', 'PROPERTY MANAGER', 'MOVE IN'],
  },
  government_letter: {
    strong: ['DEPARTMENT OF', 'INTERNAL REVENUE SERVICE', 'IRS', 'SOCIAL SECURITY', 'MOTOR VEHICLES', 'DMV', 'TAX COLLECTOR', 'PROPERTY APPRAISER', 'VOTER REGISTRATION', 'SUPERVISOR OF ELECTIONS', 'COUNTY CLERK', 'STATE OF', 'COUNTY OF', 'CITY OF', 'COMPTROLLER'],
    weak: ['COUNTY', 'GOVERNMENT', 'OFFICIAL', 'AGENCY', 'ADMINISTRATION'],
  },
  insurance_statement: {
    strong: ['INSURANCE', 'POLICY NUMBER', 'POLICYHOLDER', 'PREMIUM', 'DECLARATIONS', 'COVERAGE', 'DEDUCTIBLE', 'INSURED', 'POLICY PERIOD'],
    weak: ['POLICY', 'AGENT', 'CLAIM'],
  },
};

/**
 * What the document looks like, by its words: the kind with the most points (at least 3), the declared kind when
 * it ties for the most, otherwise "other".
 */
export function documentKind(text: string, declared: AddressDocumentType): AddressDocumentType | 'other' {
  const folded = ` ${foldText(text)} `;
  const scores = (Object.entries(KIND_WORDS) as Array<[AddressDocumentType, { strong: string[]; weak: string[] }]>).map(([kind, { strong, weak }]) => {
    const has = (phrase: string) => folded.includes(` ${phrase} `);
    return [kind, strong.filter(has).length * 3 + weak.filter(has).length] as const;
  });
  const best = Math.max(...scores.map(([, score]) => score));
  if (best < 3) return 'other';
  const top = scores.filter(([, score]) => score === best).map(([kind]) => kind);
  if (top.includes(declared)) return declared;
  return top.length === 1 ? top[0]! : 'other';
}

/** The reading of a proof of address from its text. */
export function judgeAddressProof(proof: ProofText, expected: AddressDocumentInput['expected']): AddressDocumentReading {
  const tokens = words(proof.text);
  if (tokens.filter((token) => token.length >= 2 && /[A-Z]/.test(token)).length < MIN_WORDS) return { readable: false };
  // A shaky OCR's "not found" is "not sure", never "no".
  const answer = (value: boolean | undefined) => (value === undefined || (value === false && !proof.confident) ? undefined : value);
  const nameMatches = answer(nameOnDocument(tokens, expected.name));
  const addressMatches = answer(addressOnDocument(tokens, expected.address));
  const recent = answer(recentOnDocument(proof.text, expected.submittedOn));
  return {
    readable: true,
    documentType: documentKind(proof.text, expected.declaredType),
    ...(nameMatches !== undefined ? { nameMatches } : {}),
    ...(addressMatches !== undefined ? { addressMatches } : {}),
    ...(recent !== undefined ? { recent } : {}),
  };
}
