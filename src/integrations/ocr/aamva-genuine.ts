import type { CheckOutcome, IdSignal } from '@/contracts';
import type { IdBarcodeDetails } from './aamva';
import { verifyBarcodeSignature, type BarcodeSignatureStatus } from './barcode-signature';
import { checkDerivedNumber, floridaInitialMatches, licenseNumberKey, matchesStateFormat } from './dl-numbers';

/**
 * Whether a license or state ID's barcode is encoded the way its state encodes it (owner, 2026-11-27: "verify the
 * correct issued and non-fake DL"), judged on the barcode's own text, apart from the forgiving parser that reads its
 * fields (aamva.ts). It checks what forgers get wrong and issuers get right (the AAMVA DL/ID Card Design Standard,
 * annex D, 2000–2026, and each state's own rules):
 *
 * - the header and the subfile designators: each subfile where its offset says, as long as its length says, one after
 *   the other (strong);
 * - the issuer: a known IIN, consistent with the jurisdiction's own subfile letter where we know it, and with the state
 *   printed on the front (strong);
 * - the AAMVA version against the issue date: no card carries a version published more than a year after it (strong);
 * - the issue and expiry dates (strong), Florida's and Texas's longest validity, Florida's expiry on the birthday (strong);
 * - the license number: the state's format (strong in Florida and Texas, soft elsewhere), and where the state builds it
 *   from the holder (Florida before 2024-07-31; Illinois and Wisconsin, soft), the birth date and sex in it (strong in
 *   Florida);
 * - the 1D barcode's inventory control number against the PDF417's (DCK, Florida; strong);
 * - a state's ECDSA signature where one is used (New York, Virginia, North Carolina): valid is a strong pass, invalid
 *   goes to our team;
 * - the version's required elements and the formats of sex, truncation flags, ZIP and country (soft).
 *
 * `fail` when any strong sign shows (our team decides: nothing is turned down on this alone), `pass` when the structure
 * is clean, the issuer and number check out and nothing soft is left (a valid signature passes over soft signs), else
 * `unsure`. A forger who copies a genuine layout passes these: the face match and our team cover the rest.
 */

/** AAMVA's issuer identification numbers (aamva.org, read 2026-11-27): US states, DC, territories, Canada, Mexico. */
export const IIN_JURISDICTIONS: Readonly<Record<string, string>> = {
  '604426': 'PE', '604427': 'AS', '604428': 'QC', '604429': 'YT', '604430': 'MP', '604431': 'PR', '604432': 'AB', '604433': 'NU', '604434': 'NT',
  '636000': 'VA', '636001': 'NY', '636002': 'MA', '636003': 'MD', '636004': 'NC', '636005': 'SC', '636006': 'CT', '636007': 'LA', '636008': 'MT',
  '636009': 'NM', '636010': 'FL', '636011': 'DE', '636012': 'ON', '636013': 'NS', '636014': 'CA', '636015': 'TX', '636016': 'NL', '636017': 'NB',
  '636018': 'IA', '636019': 'GU', '636020': 'CO', '636021': 'AR', '636022': 'KS', '636023': 'OH', '636024': 'VT', '636025': 'PA', '636026': 'AZ',
  '636027': 'US-DOS', '636028': 'BC', '636029': 'OR', '636030': 'MO', '636031': 'WI', '636032': 'MI', '636033': 'AL', '636034': 'ND', '636035': 'IL',
  '636036': 'NJ', '636037': 'IN', '636038': 'MN', '636039': 'NH', '636040': 'UT', '636041': 'ME', '636042': 'SD', '636043': 'DC', '636044': 'SK',
  '636045': 'WA', '636046': 'KY', '636047': 'HI', '636048': 'MB', '636049': 'NV', '636050': 'ID', '636051': 'MS', '636052': 'RI', '636053': 'TN',
  '636054': 'NE', '636055': 'GA', '636056': 'MX-COA', '636057': 'MX-HID', '636058': 'OK', '636059': 'AK', '636060': 'WY', '636061': 'WV', '636062': 'VI',
};

/** The jurisdiction subfile's letter where we've seen it on calibration sheets: Florida "ZF", Texas "ZT", California "ZC". */
const OWN_SUBFILE_LETTER: Readonly<Record<string, string>> = { FL: 'F', TX: 'T', CA: 'C', VA: 'V', NY: 'N', NC: 'N' };

/** When each AAMVA version's standard came out (YYYY-MM): a card can't carry a version much newer than its issue. */
const VERSION_DATES: Readonly<Record<number, string>> = {
  1: '2000-01', 2: '2003-09', 3: '2005-03', 4: '2009-07', 5: '2010-07', 6: '2011-07', 7: '2012-06', 8: '2013-08', 9: '2016-09', 10: '2020-10', 11: '2025-06', 12: '2026-10',
};

/** The elements each version requires on a license or ID subfile (D.12.5.1). Florida leaves out eye color (DAY) on every card. */
const REQUIRED: Readonly<Record<string, readonly string[]>> = {
  v1: ['DAA', 'DAG', 'DAI', 'DAJ', 'DAK', 'DAQ', 'DAR', 'DAS', 'DAT', 'DBA', 'DBB', 'DBC', 'DBD'],
  v2: ['DCA', 'DCB', 'DCD', 'DBA', 'DCS', 'DCT', 'DCU', 'DBD', 'DBB', 'DBC', 'DAY', 'DAU', 'DCE', 'DAG', 'DAI', 'DAJ', 'DAK', 'DAQ', 'DCF', 'DCG', 'DCH'],
  v3: ['DCA', 'DCB', 'DCD', 'DBA', 'DCS', 'DCT', 'DBD', 'DBB', 'DBC', 'DAY', 'DAU', 'DAG', 'DAI', 'DAJ', 'DAK', 'DAQ', 'DCF', 'DCG', 'DCH'],
  v4: ['DCA', 'DCB', 'DCD', 'DBA', 'DCS', 'DAC', 'DAD', 'DBD', 'DBB', 'DBC', 'DAY', 'DAU', 'DAG', 'DAI', 'DAJ', 'DAK', 'DAQ', 'DCF', 'DCG', 'DDE', 'DDF', 'DDG'],
};
const NOT_ENCODED: Readonly<Record<string, readonly string[]>> = { FL: ['DAY'] };

/** The longest a license runs from its issue, where we know it (months): Florida 8 years to the birthday, Texas 8 years. */
const LONGEST_VALIDITY_MONTHS: Readonly<Record<string, number>> = { FL: 8 * 12 + 12, TX: 8 * 12 + 1 };

/** Signals that make `genuine` fail; the rest leave it unsure. */
const STRONG: ReadonlySet<IdSignal> = new Set<IdSignal>([
  'subfile_layout_off',
  'issuer_unknown',
  'issuer_mismatch',
  'version_unknown',
  'version_too_new',
  'dates_inconsistent',
  'validity_too_long',
  'expiry_not_on_birthday',
  'inventory_mismatch',
]);

export interface BarcodeLayout {
  iin: string;
  version: number;
  jurisdictionVersion?: number;
  /** Each subfile as its designator states it. */
  subfiles: { type: string; offset: number; length: number }[];
  /** Where the header starts in the text (the compliance indicator, or where it should be). */
  base: number;
  /** The license or ID subfile's elements, by ID (the first of each); and the jurisdiction's own, apart. */
  elements: Map<string, string>;
  own: Map<string, string>;
  /** The subfiles sit where and as long as the designators say. */
  layoutOk: boolean;
  /** The four header bytes `@`, LF, RS, CR are there. */
  headerOk: boolean;
}

const HEADER = /ANSI ?(\d{6})(\d{2})/;

/** Splits a subfile's text ("DLDAQ…\nDCS…\r") into its elements. */
function subfileElements(body: string): Map<string, string> {
  const elements = new Map<string, string>();
  const text = body.replace(/^(?:DL|ID|Z[A-Z])/, '').replace(/\r$/, '');
  for (const line of text.split(/[\n\r]/)) {
    const element = /^([A-Z]{3})([\s\S]*)$/.exec(line.trimStart());
    if (element && !elements.has(element[1]!)) elements.set(element[1]!, element[2]!);
  }
  return elements;
}

/** The header, the designators and the elements, read strictly. Null when there's no AAMVA header at all. */
export function readBarcodeLayout(raw: string): BarcodeLayout | null {
  const match = HEADER.exec(raw.slice(0, 64));
  if (!match) return null;
  const ansi = match.index;
  const base = Math.max(0, ansi - 4);
  const headerOk = raw.slice(ansi - 4, ansi) === '@\n\x1e\r' && raw.slice(ansi, ansi + 5) === 'ANSI ';
  const version = Number(match[2]);
  let position = ansi + (raw[ansi + 4] === ' ' ? 5 : 4) + 6 + 2;
  let jurisdictionVersion: number | undefined;
  if (version >= 2) {
    jurisdictionVersion = /^\d{2}$/.test(raw.slice(position, position + 2)) ? Number(raw.slice(position, position + 2)) : undefined;
    position += 2;
  }
  const count = /^\d{2}$/.test(raw.slice(position, position + 2)) ? Number(raw.slice(position, position + 2)) : 0;
  position += 2;
  const subfiles: BarcodeLayout['subfiles'] = [];
  for (let k = 0; k < count; k++) {
    const designator = /^([A-Z]{2})(\d{4})(\d{4})$/.exec(raw.slice(position, position + 10));
    if (!designator) break;
    subfiles.push({ type: designator[1]!, offset: Number(designator[2]), length: Number(designator[3]) });
    position += 10;
  }
  // Each subfile where it says (counted from the header's start), and the next right after it.
  let layoutOk = count > 0 && subfiles.length === count;
  for (const [index, subfile] of subfiles.entries()) {
    const at = base + subfile.offset;
    if (raw.slice(at, at + 2) !== subfile.type) layoutOk = false;
    const next = subfiles[index + 1];
    if (next && next.offset !== subfile.offset + subfile.length) layoutOk = false;
    // The last one ends with the text (a reader may leave a final CR or LF off, or add one).
    if (!next && Math.abs(base + subfile.offset + subfile.length - raw.length) > 1) layoutOk = false;
  }
  const elements = new Map<string, string>();
  const own = new Map<string, string>();
  for (const subfile of subfiles) {
    const body = raw.slice(base + subfile.offset, base + subfile.offset + subfile.length);
    const target = subfile.type === 'DL' || subfile.type === 'ID' ? elements : subfile.type.startsWith('Z') ? own : null;
    if (!target) continue;
    for (const [id, value] of subfileElements(body)) if (!target.has(id)) target.set(id, value);
  }
  // A layout that doesn't hold still has elements: read them from the license subfile's type on.
  if (elements.size === 0) {
    const start = raw.search(/(?:DL|ID)D[A-Z]{2}/);
    if (start >= 0) for (const [id, value] of subfileElements(raw.slice(start))) if (id.startsWith('D') && !elements.has(id)) elements.set(id, value);
  }
  return { iin: match[1]!, version, ...(jurisdictionVersion !== undefined ? { jurisdictionVersion } : {}), subfiles, base, elements, own, layoutOk, headerOk };
}

const clean = (value: string | undefined) => value?.replace(/[\u0000-\u001f]/g, ' ').trim().toUpperCase() ?? '';

/** The required elements this version and state leave out. */
function missingRequired(layout: BarcodeLayout, state: string): string[] {
  const list = REQUIRED[layout.version <= 1 ? 'v1' : layout.version === 2 ? 'v2' : layout.version === 3 ? 'v3' : 'v4']!;
  const exempt = new Set(NOT_ENCODED[state] ?? []);
  return list.filter((id) => !exempt.has(id) && !layout.elements.has(id));
}

/** Months from one YYYY-MM-DD date to another (whole months, the day of month counted). */
function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/** The expiry falls on the birthday (a February 29 birthday expires on the 28th or March 1 in common years). */
function onBirthday(dateOfBirth: string, expiryDate: string): boolean {
  const birth = dateOfBirth.slice(5);
  const expiry = expiryDate.slice(5);
  if (birth === expiry) return true;
  return birth === '02-29' && (expiry === '02-28' || expiry === '03-01');
}

export interface GenuineInput {
  /** The barcode's text, as decoded. */
  raw: string;
  /** Its fields, from the forgiving parser. */
  details: IdBarcodeDetails;
  today: Date;
  /** The state printed on the front, when the front read. */
  frontState?: string;
  /** The 1D barcode on the back (an inventory control number), when one decoded. */
  inventory?: string;
}

export interface GenuineJudgement {
  outcome: CheckOutcome;
  signals: IdSignal[];
  /** What staff see beside it: the versions, and the signature's status. */
  aamvaVersion?: number;
  jurisdictionVersion?: number;
  signature?: BarcodeSignatureStatus;
}

export function judgeBarcode({ raw, details, today, frontState, inventory }: GenuineInput): GenuineJudgement {
  const signals = new Set<IdSignal>();
  const layout = readBarcodeLayout(raw);
  if (!layout) return { outcome: 'fail', signals: ['header_malformed'] };
  if (!layout.headerOk) signals.add('header_malformed');
  if (!layout.layoutOk) signals.add('subfile_layout_off');

  // The issuer.
  const state = IIN_JURISDICTIONS[layout.iin];
  if (!state) signals.add('issuer_unknown');
  const ownLetter = state ? OWN_SUBFILE_LETTER[state] : undefined;
  const ownSubfile = layout.subfiles.find((subfile) => subfile.type.startsWith('Z'));
  if (ownLetter && ownSubfile && ownSubfile.type !== `Z${ownLetter}`) signals.add('issuer_mismatch');
  if (state && frontState && /^[A-Z]{2}$/.test(frontState) && frontState !== state) signals.add('issuer_mismatch');

  // The version against the issue date: a standard can be adopted from its drafts, not years before them.
  const published = VERSION_DATES[layout.version];
  if (!published) signals.add('version_unknown');
  else if (details.issueDate) {
    const [year, month] = published.split('-').map(Number) as [number, number];
    const earliest = `${year - 1}-${String(month).padStart(2, '0')}-01`;
    if (details.issueDate < earliest) signals.add('version_too_new');
  }

  // Required elements and their formats (soft: issuers have their quirks).
  if (state && missingRequired(layout, state).length > 0) signals.add('required_fields_missing');
  const sex = clean(layout.elements.get('DBC'));
  if (sex && !(layout.version <= 1 ? /^[12MF9X]$/ : /^[129]$/).test(sex)) signals.add('field_format_off');
  for (const flag of ['DDE', 'DDF', 'DDG']) {
    const value = clean(layout.elements.get(flag));
    if (layout.version >= 4 && value && !/^[TNU]$/.test(value)) signals.add('field_format_off');
  }
  // A US ZIP: 5 digits, ZIP+4 without its dash, or that padded to 11 with zeros.
  const zip = clean(layout.elements.get('DAK')).replace(/[\s-]/g, '');
  const country = clean(layout.elements.get('DCG'));
  if (zip && country !== 'CAN' && !/^(?:\d{5}|\d{9}|\d{11})$/.test(zip)) signals.add('field_format_off');
  if (layout.version >= 2 && country && country !== 'USA' && country !== 'CAN') signals.add('field_format_off');

  // Dates (UTC dates; a day's grace for the card's local ones).
  const tomorrow = new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10);
  if (details.issueDate && (details.issueDate > tomorrow || details.issueDate >= details.expiryDate || details.issueDate <= details.dateOfBirth)) signals.add('dates_inconsistent');
  const longest = state ? LONGEST_VALIDITY_MONTHS[state] : undefined;
  if (longest && details.issueDate && monthsBetween(details.issueDate, details.expiryDate) > longest) signals.add('validity_too_long');
  const limitedTerm = clean(layout.elements.get('DDD')) === '1';
  if (state === 'FL' && !limitedTerm && !onBirthday(details.dateOfBirth, details.expiryDate)) signals.add('expiry_not_on_birthday');

  // The number.
  const number = licenseNumberKey(details.documentNumber);
  const format = state ? matchesStateFormat(state, number) : undefined;
  if (format === false) signals.add('number_format_off');
  // Florida's birth date and sex part of a derived number is exact: a mismatch there is a strong sign.
  let derivedBirthOff = false;
  if (state) {
    const derived = checkDerivedNumber(state, number, details, details.issueDate);
    if (derived) {
      signals.add(derived.surname && derived.firstName && derived.birth ? 'number_derivation_ok' : 'number_derivation_off');
      derivedBirthOff = derived.state === 'FL' && !derived.birth;
    } else if (state === 'FL' && floridaInitialMatches(number, details.surname) === false) {
      signals.add('number_derivation_off');
    }
  }

  // The 1D barcode's inventory number (Florida prints the DCK there).
  const dck = clean(layout.elements.get('DCK')).replace(/\D/g, '');
  const oneD = (inventory ?? '').replace(/\D/g, '');
  if (state === 'FL' && dck && oneD && dck !== oneD) signals.add('inventory_mismatch');

  // A state's signature.
  const signature = verifyBarcodeSignature(raw, layout.iin);
  if (signature === 'valid') signals.add('barcode_signature_ok');
  if (signature === 'invalid' || signature === 'malformed') signals.add('barcode_signature_bad');

  const list = [...signals];
  const strong = list.some((signal) => STRONG.has(signal)) || ((state === 'FL' || state === 'TX') && format === false) || derivedBirthOff;
  const soft = list.some((signal) => !STRONG.has(signal) && signal !== 'number_derivation_ok' && signal !== 'barcode_signature_ok');
  const outcome: CheckOutcome = strong ? 'fail' : !soft || signature === 'valid' ? 'pass' : 'unsure';
  return {
    outcome,
    signals: list,
    aamvaVersion: layout.version,
    ...(layout.jurisdictionVersion !== undefined ? { jurisdictionVersion: layout.jurisdictionVersion } : {}),
    ...(signature !== 'unsupported' ? { signature } : {}),
  };
}

/** The elements staff see beside the fields: class, restrictions, endorsements, the document discriminator and inventory number. */
export function barcodeExtras(raw: string): { licenseClass?: string; restrictions?: string; endorsements?: string; documentDiscriminator?: string; inventoryControl?: string; aamvaVersion?: number; jurisdictionVersion?: number } {
  const layout = readBarcodeLayout(raw);
  if (!layout) return {};
  const value = (id: string) => {
    const text = clean(layout.elements.get(id));
    return text && !/^(?:NONE|UNAVL|UNAVAIL|N\/A)$/.test(text) ? text.slice(0, 40) : undefined;
  };
  const extras = {
    licenseClass: value('DCA'),
    restrictions: value('DCB'),
    endorsements: value('DCD'),
    documentDiscriminator: value('DCF'),
    inventoryControl: value('DCK'),
  };
  return {
    ...Object.fromEntries(Object.entries(extras).filter(([, text]) => text !== undefined)),
    aamvaVersion: layout.version,
    ...(layout.jurisdictionVersion !== undefined ? { jurisdictionVersion: layout.jurisdictionVersion } : {}),
  };
}
