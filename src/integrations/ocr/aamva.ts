import { isoDate } from './text';

/**
 * The PDF417 barcode on the back of a US driver's license or state ID card, as the AAMVA DL/ID Card Design Standard
 * lays it out (annex D), from its decoded text. A pure parser: no I/O, nothing logged.
 *
 * The header: the compliance indicator `@`, the data element separator (LF), the record separator (RS, 0x1E) and the
 * segment terminator (CR); the file type, `ANSI ` (`AAMVA` before the 2000 standard); the issuer's 6-digit IIN; the
 * AAMVA version (01 for the 2000 standard, 02 for 2003 … 10 for 2020); the jurisdiction's own version (from 02 on);
 * the number of entries; and a designator per subfile (`DL` or `ID`, or `Z` and a letter for the jurisdiction's own:
 * its type, then a 4-digit offset and length). The license or ID subfile follows: its type, then its data elements,
 * each a three-letter ID and its value, separated by LF, the subfile ended by CR.
 *
 * Every version's way of writing the fields is read: the 2000 standard's full name (`DAA`, "FAMILY,GIVEN,MIDDLE") and
 * year-first dates, the 2003 and 2005 ones' given names in one element (`DCT`), the family name in `DCS` or `DAB`.
 * Real cards' quirks are forgiven: a header whose separators went missing or were mangled, offsets that are off (they
 * aren't used: the elements are read in order), `\r\n` line ends, lower case, padding, trailing commas, a letter after
 * a date, a date in the other order, "NONE" or "unavail" for an empty field. Null unless the name, birth date, expiry
 * and number are all there and the dates make sense: never a guess.
 */

export interface IdBarcodeDetails {
  documentType: 'drivers_license' | 'state_id';
  /** Two-letter state code of the issuing jurisdiction (from the IIN). */
  issuingState: string;
  givenNames: string;
  middleNames?: string;
  surname: string;
  suffix?: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  expiryDate: string;
  issueDate?: string;
  documentNumber: string;
  address?: { line1: string; line2?: string; city: string; state: string; zip: string };
  sex?: 'male' | 'female' | 'unspecified';
  height?: string;
  eyeColor?: string;
}

/**
 * The IINs AAMVA assigned to US jurisdictions (aamva.org, "Issuer Identification Numbers (IIN)", read 2026-11-21).
 * The issuing state comes from here: `DAJ` is the holder's address, which may be in another state.
 */
const US_IINS: Readonly<Record<string, string>> = {
  '636033': 'AL', '636059': 'AK', '604427': 'AS', '636026': 'AZ', '636021': 'AR', '636014': 'CA', '636020': 'CO', '636006': 'CT',
  '636011': 'DE', '636043': 'DC', '636010': 'FL', '636055': 'GA', '636019': 'GU', '636047': 'HI', '636050': 'ID', '636035': 'IL',
  '636037': 'IN', '636018': 'IA', '636022': 'KS', '636046': 'KY', '636007': 'LA', '636041': 'ME', '636003': 'MD', '636002': 'MA',
  '636032': 'MI', '636038': 'MN', '636051': 'MS', '636030': 'MO', '636008': 'MT', '636054': 'NE', '636049': 'NV', '636039': 'NH',
  '636036': 'NJ', '636009': 'NM', '636001': 'NY', '636004': 'NC', '636034': 'ND', '604430': 'MP', '636023': 'OH', '636058': 'OK',
  '636029': 'OR', '636025': 'PA', '604431': 'PR', '636052': 'RI', '636005': 'SC', '636042': 'SD', '636053': 'TN', '636015': 'TX',
  '636040': 'UT', '636024': 'VT', '636062': 'VI', '636000': 'VA', '636045': 'WA', '636061': 'WV', '636031': 'WI', '636060': 'WY',
};

/** Canada's provinces and territories (the same list): their cards write dates year first. */
const CANADIAN_IINS = new Set(['604426', '604428', '604429', '604432', '604433', '604434', '636012', '636013', '636016', '636017', '636028', '636044', '636048']);

/** The file type, the IIN and the AAMVA version, wherever stray or missing characters left them near the start. */
const FILE_TYPE = /(?:ANSI ?|AAMVA)(\d{6})(\d{2})/i;
/** How far into the text the file type may start (the compliance indicator, the separators, a few stray bytes). */
const HEADER_REACH = 40;
/** A subfile's type: the license or ID subfile, or a jurisdiction's own (`Z` and a letter). */
const SUBFILE_TYPE = /^(?:DL|ID|Z[A-Z])$/i;
/** The license or ID subfile's data starting with its type: `DLDAQ…`. */
const PREFIXED = /^(DL|ID)(?=D[A-Z]{2})/i;
/** What empty fields hold. */
const ABSENT = /^(?:NONE|UNAVAIL|UNAVL|UNAVAILABLE|N\/A)$/;
const NAME_SUFFIX = /^(?:JR|SR|I{1,3}|IV|V|VI{1,3}|[1-9](?:ST|ND|RD|TH))\.?$/;

interface Header {
  iin: string;
  version: number;
  /** The subfile types its designators list, in order. */
  subfiles: string[];
  /** Where the first subfile's data starts. */
  dataStart: number;
  /** The characters that end a data element. */
  separators: Set<string>;
}

function readHeader(text: string): Header | null {
  const match = FILE_TYPE.exec(text.slice(0, HEADER_REACH + 16));
  if (!match || match.index > HEADER_REACH) return null;
  const separators = new Set(['\n', '\r', '\x1e']);
  // The separators the header declares (after `@`): normally LF, RS and CR, but a reader may have turned LF into another one.
  const at = text.lastIndexOf('@', match.index);
  const declared = at >= 0 && match.index - at <= 6 ? text[at + 1] : undefined;
  if (declared && !/[\p{L}\p{N}\s@]/u.test(declared)) separators.add(declared);
  const version = Number(match[2]);
  let pos = match.index + match[0].length + (version >= 2 ? 2 : 0);
  const entries = /^\d{2}$/.test(text.slice(pos, pos + 2)) ? Number(text.slice(pos, pos + 2)) : 1;
  pos += 2;
  const subfiles: string[] = [];
  const designatorAt = (index: number, strict: boolean) => {
    const chunk = text.slice(index, index + 10);
    if (chunk.length < 10 || [...chunk].some((ch) => separators.has(ch)) || !SUBFILE_TYPE.test(chunk.slice(0, 2))) return false;
    // Strictly 8 digits for designators past the count; within it, anything but the start of the data (some
    // jurisdictions write letters where the offset goes).
    return strict ? /^\d{8}$/.test(chunk.slice(2)) : !/^D[A-Z]{2}/i.test(chunk.slice(2));
  };
  for (let k = 0; k < Math.max(1, entries) && designatorAt(pos, false); k++, pos += 10) subfiles.push(text.slice(pos, pos + 2).toUpperCase());
  for (; designatorAt(pos, true); pos += 10) subfiles.push(text.slice(pos, pos + 2).toUpperCase());
  return { iin: match[1]!, version, subfiles, dataStart: pos, separators };
}

/** The license or ID subfile's data elements (the first of each ID), and its type. */
function readElements(text: string, header: Header): { elements: Map<string, string>; subfile?: string } {
  const elements = new Map<string, string>();
  let subfile: string | undefined = header.subfiles.find((type) => type === 'DL' || type === 'ID');
  let record = '';
  const flush = () => {
    let line = record.replace(/^\s+/, '');
    record = '';
    if (/^(?:DL|ID)$/i.test(line.trim())) {
      subfile ??= line.trim().toUpperCase();
      return;
    }
    const prefixed = PREFIXED.exec(line);
    if (prefixed) {
      subfile ??= prefixed[1]!.toUpperCase();
      line = line.slice(2);
    }
    const element = /^([A-Za-z]{3})([\s\S]*)$/.exec(line);
    if (!element) return;
    const id = element[1]!.toUpperCase();
    // A jurisdiction's own elements (`Z…`) aren't read.
    if (id.startsWith('D') && !elements.has(id)) elements.set(id, element[2]!);
  };
  for (const ch of text.slice(header.dataStart)) {
    if (header.separators.has(ch)) flush();
    else record += ch;
  }
  flush();
  return { elements, ...(subfile ? { subfile } : {}) };
}

/** A field's value: control characters and padding dropped, upper case; undefined when empty or "NONE". */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return text && !ABSENT.test(text) ? text : undefined;
}

/** A name or address part: cleaned, without the commas some jurisdictions leave around it. */
function part(value: string | undefined): string | undefined {
  return clean(value)?.replace(/^[\s,]+|[\s,]+$/g, '') || undefined;
}

const nameWords = (value: string | undefined) => (value ? value.split(/[\s,$]+/).filter(Boolean) : []);

/**
 * An 8-digit date: MMDDCCYY on US cards, CCYYMMDD on Canadian ones and in the 2000 standard; the other order when the
 * expected one isn't a date (some jurisdictions use it anyway). The two never both fit a year from 1900 to 2199, since
 * no month is 19 to 21. Characters after the date are ignored.
 */
function dateOf(value: string | undefined, yearFirst: boolean): string | undefined {
  const digits = clean(value)?.replace(/\D/g, '');
  if (!digits || digits.length < 8 || /^0{8}/.test(digits)) return undefined;
  const d = digits.slice(0, 8);
  const inRange = (date: string | undefined) => (date && date >= '1900-01-01' && date < '2200-01-01' ? date : undefined);
  const monthFirst = inRange(isoDate(Number(d.slice(4, 8)), Number(d.slice(0, 2)), Number(d.slice(2, 4))));
  const yearFirstDate = inRange(isoDate(Number(d.slice(0, 4)), Number(d.slice(4, 6)), Number(d.slice(6, 8))));
  return yearFirst ? (yearFirstDate ?? monthFirst) : (monthFirst ?? yearFirstDate);
}

/** Born from 1900 to today, an expiry after the birth and the issue, an issue date not after today. */
function plausible(dates: { dateOfBirth: string; expiryDate: string; issueDate?: string }, today: Date): boolean {
  const { dateOfBirth, expiryDate, issueDate } = dates;
  const day = today.toISOString().slice(0, 10);
  // A day's grace: the card's dates are local, `today` is UTC.
  const tomorrow = new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10);
  if (dateOfBirth < '1900-01-01' || dateOfBirth > day) return false;
  // A license lasts a few years (until 65 in some states); a year past that is a placeholder, not an expiry.
  if (expiryDate <= dateOfBirth || Number(expiryDate.slice(0, 4)) > today.getUTCFullYear() + 60) return false;
  return !issueDate || (issueDate > dateOfBirth && issueDate < expiryDate && issueDate <= tomorrow);
}

/** The ZIP code's first 5 digits (ZIP+4 and padding dropped), or a Canadian postal code. */
function postalCode(value: string | undefined): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const zip = /^(\d{5})/.exec(text);
  if (zip) return zip[1];
  const canadian = /^([A-Z]\d[A-Z]) ?(\d[A-Z]\d)$/.exec(text);
  return canadian ? `${canadian[1]} ${canadian[2]}` : undefined;
}

function sexOf(value: string | undefined): IdBarcodeDetails['sex'] {
  const code = clean(value);
  if (code === '1' || code === 'M') return 'male';
  if (code === '2' || code === 'F') return 'female';
  if (code === '9' || code === 'X') return 'unspecified';
  return undefined;
}

/**
 * `5'10"` from inches ("070 IN"; the 2000 standard's feet and inches, "510"), `178 cm` from centimeters; else as
 * written. Without a unit, three digits from 100 up can't be inches: feet and inches when they fit, else centimeters.
 */
function heightOf(value: string | undefined, version: number): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const feetAndInches = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;
  const measured = /^(\d{2,3}) ?(IN|CM)?$/.exec(text);
  if (measured) {
    const amount = Number(measured[1]);
    if (measured[2] === 'CM') return `${amount} cm`;
    if (!measured[2] && (version <= 1 || amount >= 100) && measured[1]!.length === 3 && amount % 100 < 12) return feetAndInches(Math.floor(amount / 100) * 12 + (amount % 100));
    if (!measured[2] && amount >= 100) return amount <= 250 ? `${amount} cm` : undefined;
    return feetAndInches(amount);
  }
  return text.length <= 12 ? text : undefined;
}

/** The fields of an AAMVA license or ID barcode's text, or null when it isn't one or lacks the name, dates or number. `today` checks the dates. */
export function parseAamva(barcode: string, today: Date): IdBarcodeDetails | null {
  // C1 control characters are no part of AAMVA's data (some scanners add them around every element).
  const text = barcode.replace(/[\u0080-\u009f]/g, '');
  const header = readHeader(text);
  if (!header) return null;
  const { elements, subfile } = readElements(text, header);
  const get = (id: string) => elements.get(id);

  // Names: DCS/DAC/DAD from 2009 on; DCT (all given names) in 2003 and 2005; DAB/DAC/DAD or DAA in 2000.
  let surname = part(get('DCS')) ?? part(get('DAB'));
  let givenNames = part(get('DAC'));
  let middleNames = nameWords(part(get('DAD'))).join(' ') || undefined;
  let suffix = part(get('DCU')) ?? part(get('DAE'));
  if (!givenNames) {
    const [first, ...rest] = nameWords(part(get('DCT')));
    if (first) {
      givenNames = first;
      middleNames ??= rest.join(' ') || undefined;
    }
  }
  const fullName = clean(get('DAA'));
  // "FAMILY,GIVEN,MIDDLE,SUFFIX" (or `$` or `@` between them). Only with those separators: "ALEX R SAMPLE" isn't split.
  if ((!surname || !givenNames) && fullName && /[,$@]/.test(fullName)) {
    const [family = '', given = '', middle = '', last = ''] = fullName.split(/[,$@]/).map((piece) => piece.trim());
    const [first, ...more] = nameWords(given);
    const middles = [...more, ...nameWords(middle)];
    const trailing = middles.at(-1);
    if (!last && trailing && middles.length > 1 && NAME_SUFFIX.test(trailing)) suffix ??= middles.pop();
    surname ??= family || undefined;
    givenNames ??= first;
    middleNames ??= middles.join(' ') || undefined;
    if (last && NAME_SUFFIX.test(last)) suffix ??= last;
  }

  const country = clean(get('DCG'));
  const yearFirst = country === 'CAN' || country === 'CDN' || CANADIAN_IINS.has(header.iin) || header.version <= 1;
  const dateOfBirth = dateOf(get('DBB'), yearFirst);
  const expiryDate = dateOf(get('DBA'), yearFirst);
  const issueDate = dateOf(get('DBD'), yearFirst);
  const documentNumber = clean(get('DAQ'));
  const holderState = clean(get('DAJ'));
  const issuingState = US_IINS[header.iin] ?? (holderState && /^[A-Z]{2}$/.test(holderState) ? holderState : undefined);
  const documentType = subfile === 'DL' ? 'drivers_license' : subfile === 'ID' ? 'state_id' : undefined;

  if (!surname || !givenNames || !dateOfBirth || !expiryDate || !documentNumber || !issuingState || !documentType) return null;
  if (!plausible({ dateOfBirth, expiryDate, ...(issueDate ? { issueDate } : {}) }, today)) return null;

  const line1 = part(get('DAG'));
  const line2 = part(get('DAH'));
  const city = part(get('DAI'));
  const zip = postalCode(get('DAK'));
  const address = line1 && city && holderState && /^[A-Z]{2}$/.test(holderState) && zip ? { line1, ...(line2 ? { line2 } : {}), city, state: holderState, zip } : undefined;
  const sex = sexOf(get('DBC'));
  const height = heightOf(get('DAU'), header.version);
  const eyes = clean(get('DAY'));
  const eyeColor = eyes && eyes !== 'UNK' ? eyes : undefined;

  return {
    documentType,
    issuingState,
    givenNames,
    ...(middleNames ? { middleNames } : {}),
    surname,
    ...(suffix ? { suffix } : {}),
    dateOfBirth,
    expiryDate,
    ...(issueDate ? { issueDate } : {}),
    documentNumber,
    ...(address ? { address } : {}),
    ...(sex ? { sex } : {}),
    ...(height ? { height } : {}),
    ...(eyeColor ? { eyeColor } : {}),
  };
}
