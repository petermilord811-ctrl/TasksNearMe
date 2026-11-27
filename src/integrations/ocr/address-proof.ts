import type { AddressDocumentType, AddressSignal } from '@/contracts';
import type { AddressDocumentInput, AddressDocumentReading } from '@/integrations/ai/document-reader';
import { findIssuer } from './issuers';
import { judgePdf, type PdfReaderFacts, type PdfStructure } from './pdf-forensics';
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
  /** Where the text came from (the server's reader says; older callers and tests may not). */
  source?: 'pdf' | 'photo';
  /** A PDF's markers (pdf-forensics.ts): how it was made and whether anything was laid over it. */
  pdf?: { structure: PdfStructure; reader?: PdfReaderFacts };
  /** A PDF's first-page text behind an envelope's window: the name and address it's mailed to. */
  mailingBlock?: string;
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
  const at = nameAt(tokens, name);
  return at === undefined ? undefined : at >= 0;
}

/** Where `nameOnDocument` finds the name: the surname's word index, -1 when it isn't there, undefined for a one-word name. */
export function nameAt(tokens: readonly string[], name: string): number | undefined {
  const parts = words(name);
  if (parts.length < 2) return undefined;
  const first = parts[0]!;
  const last = parts.at(-1)!;
  const initial = (token: string | undefined) => token === first[0];
  for (let i = 0; i < tokens.length; i++) {
    if (!sameWord(last, tokens[i]!)) continue;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      if (sameWord(first, tokens[j]!)) return i;
      // An initial, then only initials up to the surname.
      if (initial(tokens[j]) && tokens.slice(j + 1, i).every((token) => token.length === 1)) return i;
    }
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 2); j++) {
      if (sameWord(first, tokens[j]!) || (j === i + 1 && initial(tokens[j]))) return i;
    }
  }
  return -1;
}

/** Street words as USPS abbreviates them, so "Avenue" and "Ave", or "North" and "N", are the same word. */
const STREET_WORDS: Record<string, string> = {
  STREET: 'ST', STR: 'ST', AVENUE: 'AVE', AV: 'AVE', AVN: 'AVE', ROAD: 'RD', BOULEVARD: 'BLVD', DRIVE: 'DR', LANE: 'LN', COURT: 'CT',
  PLACE: 'PL', PARKWAY: 'PKWY', HIGHWAY: 'HWY', CIRCLE: 'CIR', TERRACE: 'TER', TRAIL: 'TRL', SQUARE: 'SQ', CROSSING: 'XING', COVE: 'CV',
  POINT: 'PT', RIDGE: 'RDG', HOLLOW: 'HOLW', BEND: 'BND', CREEK: 'CRK', GROVE: 'GRV', HEIGHTS: 'HTS', MEADOW: 'MDW', MEADOWS: 'MDWS',
  PLAZA: 'PLZ', EXPRESSWAY: 'EXPY', FREEWAY: 'FWY', CENTER: 'CTR', ALLEY: 'ALY', CANYON: 'CYN', GLEN: 'GLN', HILL: 'HL', HILLS: 'HLS',
  JUNCTION: 'JCT', LAKE: 'LK', MANOR: 'MNR', MOUNT: 'MT', MOUNTAIN: 'MTN', SPRINGS: 'SPGS', STATION: 'STA', VALLEY: 'VLY', VIEW: 'VW',
  VILLAGE: 'VLG', VISTA: 'VIS', PASS: 'PASS', PATH: 'PATH', LOOP: 'LOOP', WAY: 'WAY', RUN: 'RUN', ROW: 'ROW', WALK: 'WALK', PIKE: 'PIKE',
  // More of USPS Publication 28's suffixes (appendix C1), as common names and their usual misspellings read.
  ALY: 'ALY', ANEX: 'ANX', ANNEX: 'ANX', ARCADE: 'ARC', BAYOU: 'BYU', BEACH: 'BCH', BLUFF: 'BLF', BOTTOM: 'BTM', BRANCH: 'BR', BRIDGE: 'BRG',
  BROOK: 'BRK', BROOKS: 'BRKS', BYPASS: 'BYP', CAMP: 'CP', CAUSEWAY: 'CSWY', CAUSWAY: 'CSWY', CLIFF: 'CLF', CLUB: 'CLB', COMMON: 'CMN',
  CORNER: 'COR', CORNERS: 'CORS', COURSE: 'CRSE', COURTS: 'CTS', CRESCENT: 'CRES', CREST: 'CRST', CROSSROAD: 'XRD', CURVE: 'CURV',
  DALE: 'DL', DAM: 'DM', DIVIDE: 'DV', DRIVES: 'DRS', ESTATE: 'EST', ESTATES: 'ESTS', EXTENSION: 'EXT', FALLS: 'FLS', FERRY: 'FRY',
  FIELD: 'FLD', FIELDS: 'FLDS', FLAT: 'FLT', FLATS: 'FLTS', FORD: 'FRD', FOREST: 'FRST', FORGE: 'FRG', FORK: 'FRK', FORT: 'FT',
  FREEWY: 'FWY', GARDEN: 'GDN', GARDENS: 'GDNS', GATEWAY: 'GTWY', GLENS: 'GLNS', GREEN: 'GRN', GROVES: 'GRVS', HARBOR: 'HBR',
  HAVEN: 'HVN', HIGHWY: 'HWY', HWAY: 'HWY', ISLE: 'ISLE', KEY: 'KY', KNOLL: 'KNL', KNOLLS: 'KNLS',
  LAKES: 'LKS', LANDING: 'LNDG', LIGHT: 'LGT', LODGE: 'LDG', MALL: 'MALL', MANORS: 'MNRS', MEWS: 'MEWS', MILL: 'ML', MILLS: 'MLS',
  MISSION: 'MSN', MOTORWAY: 'MTWY', NECK: 'NCK', ORCHARD: 'ORCH', OVAL: 'OVAL', OVERPASS: 'OPAS', PARK: 'PARK', PARKS: 'PARK',
  PARKWY: 'PKWY', PKY: 'PKWY', PINE: 'PNE', PINES: 'PNES', PLAIN: 'PLN', PLAINS: 'PLNS', PORT: 'PRT', PRAIRIE: 'PR', RANCH: 'RNCH',
  RAPID: 'RPD', RAPIDS: 'RPDS', RIVER: 'RIV', ROADS: 'RDS', ROUTE: 'RTE', SHOAL: 'SHL', SHOALS: 'SHLS', SHORE: 'SHR',
  SHORES: 'SHRS', SKYWAY: 'SKWY', SPRING: 'SPG', SPUR: 'SPUR', SQUARES: 'SQS', STRAVENUE: 'STRA', STREAM: 'STRM', STREETS: 'STS',
  SUMMIT: 'SMT', THROUGHWAY: 'TRWY', TRACE: 'TRCE', TRACK: 'TRAK', TRAFFICWAY: 'TRFY', TRAILER: 'TRLR', TUNNEL: 'TUNL', TURNPIKE: 'TPKE',
  UNDERPASS: 'UPAS', UNION: 'UN', VIADUCT: 'VIA', VILLE: 'VL', WALKS: 'WALK', WAYS: 'WAYS',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
  FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH', SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH',
};
const SUFFIXES = new Set(Object.values(STREET_WORDS).filter((word) => !/^(?:[NSEW]|NE|NW|SE|SW|\d+(?:ST|ND|RD|TH))$/.test(word)));
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
/**
 * Secondary unit designators (USPS Publication 28, appendix C2): the spelled-out ones only where no street is named so
 * ("Front", "Key", "Side" and "Upper" are; their abbreviations aren't).
 */
const UNIT_WORDS = new Set([
  'APT', 'APARTMENT', 'UNIT', 'STE', 'SUITE', 'NO', 'NUMBER', 'BLDG', 'BUILDING', 'LOT', 'RM', 'ROOM', 'FL', 'FLOOR', 'DEPT',
  'HNGR', 'SPC', 'TRLR', 'BSMT', 'FRNT', 'LBBY', 'LOWR', 'OFC', 'PH', 'UPPR',
]);

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
  const at = addressAt(tokens, address);
  return at === undefined ? undefined : at >= 0;
}

/** Where `addressOnDocument` finds the address: the house number's word index, -1 when it isn't there, undefined when the address entered can't be parsed. */
export function addressAt(tokens: readonly string[], address: string): number | undefined {
  const expected = parseStreetAddress(address);
  if (!expected) return undefined;
  const read = tokens.map(streetWord);
  if (!read.includes(expected.zip)) return -1;
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
    return i;
  }
  return -1;
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

/**
 * The newest date the document shows up to the day it was sent (a day's leeway for time zones): its statement or issue
 * date, as near as text can say. Undefined without one.
 */
export function documentDateOf(text: string, submittedOn: string): string | undefined {
  return datesIn(text, new Date(`${submittedOn}T12:00:00Z`))
    .filter((date) => daysBetween(submittedOn, date) <= 1)
    .at(-1);
}

/** Labels whose date ends a statement's period ("Statement Period 10/01/26 - 10/31/26", "Billing Period: …"). */
const PERIOD_LABELS = /\b(?:STATEMENT PERIOD|BILLING PERIOD|BILLING CYCLE|SERVICE PERIOD|SERVICE FROM|OPENING\s*\/?\s*CLOSING DATE|STATEMENT FOR|FOR THE PERIOD|PERIOD COVERED|ACCOUNT PERIOD)\b/g;
/** Labels with the statement's or bill's own date ("Statement Date", "Closing Date", never "Next Closing Date"). */
const DATE_LABELS = /\b(?<!NEXT\s)(?<!NEXT\s\s)(?:STATEMENT CLOSING DATE|STATEMENT DATE|CLOSING DATE|BILL DATE|BILLING DATE|ISSUE DATE|DATE ISSUED|INVOICE DATE|NOTICE DATE|DATE OF NOTICE|LETTER DATE|AS OF)\b/g;
/** An unlabeled period ("October 1, 2026 through October 31, 2026"): its end date. */
const RANGE_JOINERS = /\s(?:THROUGH|THRU|TO|-|–)\s/g;
const RANGE_REACH = 24;
/** A due date, when nothing else says: bills are usually due about three weeks after their date. */
const DUE_LABELS = /\b(?:PAYMENT DUE DATE|DUE DATE|PAYMENT DUE|DUE BY|PLEASE PAY BY|PAY BY)\b/g;
const DUE_DAYS = 21;
/** How far after a label its date may be (a label's line, not the next paragraph's dates). */
const LABEL_REACH = 48;

const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The date a statement or bill states as its own, from its labels: the end of its statement or billing period, else its
 * statement, closing, bill or issue date, else three weeks before its due date. Undefined when it labels none, or the
 * labeled date is after the day it was sent (a day's leeway).
 */
export function statementDateOf(text: string, submittedOn: string): string | undefined {
  const upper = text.toUpperCase();
  const today = new Date(`${submittedOn}T12:00:00Z`);
  // `shift`: days added to the labeled date (a due date's statement date); the result can't be after the upload.
  const after = (pattern: RegExp, pick: (dates: string[]) => string | undefined, shift = 0): string | undefined => {
    const found: string[] = [];
    for (const match of upper.matchAll(pattern)) {
      const window = upper.slice(match.index! + match[0].length, match.index! + match[0].length + LABEL_REACH);
      const picked = pick(datesIn(window, today));
      const date = picked && shift ? shiftDays(picked, shift) : picked;
      if (date && daysBetween(submittedOn, date) <= 1) found.push(date);
    }
    return found.sort().at(-1);
  };
  const range = (): string | undefined => {
    const found: string[] = [];
    for (const match of upper.matchAll(RANGE_JOINERS)) {
      const before = datesIn(upper.slice(Math.max(0, match.index! - RANGE_REACH), match.index!), today);
      const end = datesIn(upper.slice(match.index! + match[0].length, match.index! + match[0].length + RANGE_REACH), today)[0];
      if (before.length > 0 && end && end >= before.at(-1)! && daysBetween(before.at(-1)!, end) <= 62 && daysBetween(submittedOn, end) <= 1) found.push(end);
    }
    return found.sort().at(-1);
  };
  return (
    after(PERIOD_LABELS, (dates) => dates.at(-1)) ??
    after(DATE_LABELS, (dates) => dates[0]) ??
    range() ??
    after(DUE_LABELS, (dates) => dates[0], -DUE_DAYS)
  );
}

/** The mailing block: the name within this many words of the address (a window envelope's lines). */
const MAILING_BLOCK_WORDS = 14;
/** The letterhead and mailing window: the first share of a document's words. */
const HEADER_SHARE = 0.4;

/**
 * The reading of a proof of address from its text: the four answers, and since 2026-11-27 what the automatic decision
 * needs (src/modules/verification/address-verdict.ts): who sent it (issuers.ts), its date, where its text came from and
 * whether that text can be trusted, whether it looks unedited (a PDF's markers, pdf-forensics.ts; a photo shows none),
 * and the findings staff see. Unreadable with too little text: a scanned PDF (no text of its own) or a photo OCR
 * couldn't read.
 */
export function judgeAddressProof(proof: ProofText, expected: AddressDocumentInput['expected']): AddressDocumentReading {
  const source = proof.source;
  const sourceSignals: AddressSignal[] = source === 'photo' ? ['photo'] : [];
  if (!proof.confident) sourceSignals.push('low_confidence_text');
  const tokens = words(proof.text);
  if (tokens.filter((token) => token.length >= 2 && /[A-Z]/.test(token)).length < MIN_WORDS) {
    if (!source) return { readable: false };
    return { readable: false, textSource: source, confident: false, signals: source === 'pdf' ? ['scanned_pdf'] : sourceSignals };
  }
  // A shaky OCR's "not found" is "not sure", never "no".
  const answer = (value: boolean | undefined) => (value === undefined || (value === false && !proof.confident) ? undefined : value);
  const nameIndex = nameAt(tokens, expected.name);
  const addressIndex = addressAt(tokens, expected.address);
  const nameMatches = answer(nameIndex === undefined ? undefined : nameIndex >= 0);
  const addressMatches = answer(addressIndex === undefined ? undefined : addressIndex >= 0);
  // The date it labels as its own decides; any other date only keeps a "no" from being sure (a statement can quote a
  // newer date, a "printed on" or a payment, so an old labeled date with a recent one elsewhere is for staff).
  const labeled = statementDateOf(proof.text, expected.submittedOn);
  const anyRecent = recentOnDocument(proof.text, expected.submittedOn);
  const recent = answer(labeled ? (daysBetween(labeled, expected.submittedOn) <= MAX_AGE_DAYS ? true : anyRecent === false ? false : undefined) : anyRecent);
  const issuer = findIssuer(proof.text);
  const kind = documentKind(proof.text, expected.declaredType);
  // A letter from a sender we know is their kind of document even without its usual words.
  const documentType = kind === 'other' && issuer ? issuer.kind : kind;
  const documentDate = labeled ?? documentDateOf(proof.text, expected.submittedOn);
  const signals: AddressSignal[] = [...sourceSignals, issuer ? 'issuer_known' : 'issuer_unknown'];
  if (documentType !== 'other' && documentType !== expected.declaredType) signals.push('kind_differs');
  // Where it's mailed to: a PDF's envelope window when it has text there, else the name and address close together.
  const block = proof.mailingBlock ? words(proof.mailingBlock) : [];
  if (block.length > 0) {
    const blockAddress = addressAt(block, expected.address);
    const blockName = nameAt(block, expected.name);
    if (blockAddress !== undefined && blockAddress >= 0) {
      signals.push('address_in_header');
      if (blockName !== undefined && blockName >= 0) signals.push('name_near_address');
    }
  } else {
    if (nameIndex !== undefined && nameIndex >= 0 && addressIndex !== undefined && addressIndex >= 0 && Math.abs(addressIndex - nameIndex) <= MAILING_BLOCK_WORDS) signals.push('name_near_address');
    if (addressIndex !== undefined && addressIndex >= 0 && addressIndex < tokens.length * HEADER_SHARE) signals.push('address_in_header');
  }
  let unedited: AddressDocumentReading['unedited'];
  if (source === 'pdf' && proof.pdf) {
    const pdf = judgePdf(proof.pdf.structure, proof.pdf.reader, labeled);
    signals.push(...pdf.findings);
    unedited = pdf.unedited;
  } else if (source === 'photo') {
    // A photo carries no editing marks once it's re-encoded: nothing here says it was edited.
    unedited = 'pass';
  }
  return {
    readable: true,
    documentType,
    ...(nameMatches !== undefined ? { nameMatches } : {}),
    ...(addressMatches !== undefined ? { addressMatches } : {}),
    ...(recent !== undefined ? { recent } : {}),
    ...(source
      ? {
          ...(issuer ? { issuer } : {}),
          ...(documentDate ? { documentDate } : {}),
          textSource: source,
          confident: proof.confident,
          ...(unedited ? { unedited } : {}),
          signals: [...new Set(signals)],
        }
      : {}),
  };
}
