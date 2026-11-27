import { inflateSync } from 'node:zlib';

/**
 * How a PDF proof of address was made, from its raw bytes (owner, 2026-11-27: "by bank statement or document uploading,
 * verify the address"): the signs forensic tools look for in a statement someone edited (the approach of Didier Stevens'
 * pdfid and pdf-parser, ported to the few markers that matter here). A bank or a utility generates its statements in one
 * go; an edited one usually carries the editor's name, extra revisions appended to the file, annotations or form
 * fields laid over the text, or a modification date long after its creation.
 *
 * It runs in the server process on bytes already limited to 10 MB, and never parses the document's content: it scans for
 * markers, and inflates only the compressed object streams and metadata streams that can hide them (bounded, so a
 * "zip bomb" can't take the server's memory). The document's text is never read here (the reader's process does that).
 */

export interface PdfStructure {
  /** Revisions: sections ending in %%EOF, the linearization's first-page section and one signature revision not counted. */
  revisions: number;
  /** Saved for fast web view: its first-page section ends in an %%EOF of its own (not an edit). */
  linearized: boolean;
  /** A digital signature covers part of the file (/ByteRange). */
  signed: boolean;
  /** Encrypted (often only an owner password from the bank): the metadata strings below may not be readable here. */
  encrypted: boolean;
  producer?: string;
  creator?: string;
  /** ISO 8601, from the Info dictionary or the XMP metadata. */
  created?: string;
  modified?: string;
  /** JavaScript or a launch action anywhere in the file. */
  javascript: boolean;
  /** An interactive form (AcroForm). */
  acroForm: boolean;
  /** Fields someone can type into or tick (text, choice, button); a signature field alone isn't one. */
  formFields: boolean;
  /** Annotation subtypes present (Link and Widget included; see `OVERLAY_ANNOTATIONS`). */
  annotationKinds: string[];
  embeddedFiles: boolean;
}

/** Annotations that sit over a page's text: a box, a stamp, a typed note, a redaction. Links and form widgets aren't. */
export const OVERLAY_ANNOTATIONS = ['FreeText', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Stamp', 'Ink', 'Redact', 'Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Caret', 'Text', 'FileAttachment'] as const;
const ANNOTATION_SUBTYPES = [...OVERLAY_ANNOTATIONS, 'Link', 'Widget', 'Popup'];

/** Inflated bytes allowed in all (object and metadata streams), and per stream. */
const INFLATE_TOTAL = 24 * 1024 * 1024;
const INFLATE_EACH = 6 * 1024 * 1024;
const MAX_STREAMS = 400;

/** "D:20261028153000-04'00'" or an XMP "2026-10-28T15:30:00-04:00" → ISO 8601 (UTC); undefined when it isn't a date. */
export function pdfDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const pdf = text.match(/^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz+-])(?:(\d{2})'?(\d{2})?'?)?)?/);
  const xmp = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:([Zz+-])(?:(\d{2}):?(\d{2})?)?)?/);
  const parts = xmp ?? pdf;
  if (!parts) return undefined;
  const [year, month = 1, day = 1, hour = 0, minute = 0, second = 0] = parts.slice(1, 7).map((part, index) => (part === undefined ? [0, 1, 1, 0, 0, 0][index]! : Number(part)));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  const sign = parts[7];
  const offsetMinutes = sign === '+' || sign === '-' ? (sign === '-' ? -1 : 1) * (Number(parts[8] ?? 0) * 60 + Number(parts[9] ?? 0)) : 0;
  const ms = Date.UTC(year!, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** A PDF literal string's contents from `start` (just after its "("), escapes decoded, balanced parentheses kept. */
function literalString(text: string, start: number): string | undefined {
  let depth = 1;
  let out = '';
  for (let i = start; i < text.length && i < start + 4096; i++) {
    const char = text[i]!;
    if (char === '\\') {
      const next = text[i + 1];
      if (next === undefined) break;
      i++;
      const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (next in simple) out += simple[next];
      else if (/[0-7]/.test(next)) {
        let octal = next;
        while (octal.length < 3 && /[0-7]/.test(text[i + 1] ?? '')) octal += text[++i];
        out += String.fromCharCode(parseInt(octal, 8) & 0xff);
      } else if (next === '\r' || next === '\n') {
        if (next === '\r' && text[i + 1] === '\n') i++;
      } else out += next;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) return decodePdfText(out);
    out += char;
  }
  return undefined;
}

/** PDF text strings: UTF-16BE with its byte order mark, or PDFDocEncoding (Latin-1 is close enough for names). */
function decodePdfText(raw: string): string {
  if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
    return out;
  }
  return raw;
}

function hexString(text: string, start: number): string | undefined {
  const end = text.indexOf('>', start);
  if (end < 0 || end - start > 4096) return undefined;
  const hex = text.slice(start, end).replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]*$/.test(hex)) return undefined;
  let raw = '';
  for (let i = 0; i < hex.length; i += 2) raw += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, '0'), 16));
  return decodePdfText(raw);
}

/** The last value of an Info dictionary key (`/Producer (…)` or `/Producer <…>`) in `text`. */
function infoValue(text: string, key: string): string | undefined {
  let found: string | undefined;
  const pattern = new RegExp(`/${key}\\s*([(<])`, 'g');
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[0].length;
    const value = match[1] === '(' ? literalString(text, start) : hexString(text, start);
    if (value !== undefined && value.trim()) found = value.trim();
  }
  return found;
}

/** An XMP element's text (`<pdf:Producer>…</pdf:Producer>`, or the attribute form `pdf:Producer="…"`). */
function xmpValue(text: string, name: string): string | undefined {
  const element = text.match(new RegExp(`<${name}>([^<]{1,512})</${name}>`));
  if (element) return element[1]!.trim() || undefined;
  const attribute = text.match(new RegExp(`${name}="([^"]{1,512})"`));
  return attribute ? attribute[1]!.trim() || undefined : undefined;
}

/**
 * Where the file's streams hold their data (`[start, end)` offsets), found from each dictionary's end followed by the
 * keyword "stream". Their bytes are fonts, images and page drawings: a marker scan reads around them, never inside (an
 * image's bytes can spell "/JS" by chance).
 */
function streamRanges(raw: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const pattern = />>\s*stream\r?\n/g;
  for (let match = pattern.exec(raw); match; match = pattern.exec(raw)) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    ranges.push([start, end]);
    pattern.lastIndex = end;
  }
  return ranges;
}

/** Whether an offset falls inside one of the (ordered) ranges. */
function inside(ranges: ReadonlyArray<[number, number]>, at: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = ranges[middle]!;
    if (at < start) high = middle - 1;
    else if (at >= end) low = middle + 1;
    else return true;
  }
  return false;
}

/** The file with its streams' data left out: dictionaries, cross-reference tables and trailers. */
function outsideStreams(raw: string, ranges: ReadonlyArray<[number, number]>): string {
  const parts: string[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(raw.slice(at, start));
    at = end;
  }
  parts.push(raw.slice(at));
  return parts.join(' ');
}

/** Where each %%EOF marker is, outside the streams' data. */
const eofsOf = (raw: string, ranges: ReadonlyArray<[number, number]>) => [...raw.matchAll(/%%EOF/g)].map((match) => match.index!).filter((at) => !inside(ranges, at));

/** The compressed streams that can hide the markers: object streams and metadata, inflated within the budgets. */
function hiddenText(text: string, bytes: Buffer, ranges: ReadonlyArray<[number, number]>): string {
  const parts: string[] = [];
  let total = 0;
  let count = 0;
  for (const match of text.matchAll(/\/Type\s*\/(?:ObjStm|Metadata)\b/g)) {
    if (inside(ranges, match.index!)) continue;
    if (++count > MAX_STREAMS || total >= INFLATE_TOTAL) break;
    // The dictionary's end and its stream: the first "stream" keyword after the marker.
    const keyword = text.indexOf('stream', match.index!);
    if (keyword < 0 || keyword - match.index! > 2048) continue;
    const dictionary = text.slice(Math.max(0, text.lastIndexOf('<<', match.index!)), keyword);
    let start = keyword + 'stream'.length;
    if (text[start] === '\r') start++;
    if (text[start] === '\n') start++;
    let end = text.indexOf('endstream', start);
    if (end < 0) continue;
    // The end-of-line before "endstream" isn't part of the data.
    if (text[end - 1] === '\n') end--;
    if (text[end - 1] === '\r') end--;
    const data = bytes.subarray(start, Math.max(start, end));
    if (/\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dictionary) && !/\/DecodeParms/.test(dictionary.replace(/\/DecodeParms\s*<<\s*>>/, ''))) {
      try {
        const inflated = inflateSync(data, { maxOutputLength: Math.min(INFLATE_EACH, INFLATE_TOTAL - total) });
        total += inflated.length;
        parts.push(inflated.toString('latin1'));
      } catch {
        // A stream that won't inflate (or is over budget) is skipped.
      }
    } else if (!/\/Filter/.test(dictionary)) {
      parts.push(data.toString('latin1'));
      total += data.length;
    }
  }
  return parts.join('\n');
}

/** Names written with `#xx` escapes ("/J#61vaScript") spelled out, as pdfid does, so they can't hide a marker. */
function plainNames(text: string): string {
  return text.replace(/\/[^\s/<>[\]()%]*#[0-9A-Fa-f]{2}[^\s/<>[\]()%]*/g, (name) => name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))));
}

/**
 * The bytes of the PDF as it was first saved, when it was saved more than once: up to the %%EOF that ends its first full
 * revision (the second for a file saved for fast web view). Null for a file with a single revision. The reader's process
 * reads that revision's text to compare it with the last one's (an update that changed no text is benign).
 */
export function firstRevision(bytes: Buffer, structure: Pick<PdfStructure, 'revisions' | 'linearized'>): Buffer | null {
  if (structure.revisions < 2) return null;
  const text = bytes.toString('latin1');
  const at = eofsOf(text, streamRanges(text))[structure.linearized ? 1 : 0];
  if (at === undefined) return null;
  let end = at + '%%EOF'.length;
  if (text[end] === '\r') end++;
  if (text[end] === '\n') end++;
  return end < bytes.length ? bytes.subarray(0, end) : null;
}

/** The markers of a PDF's raw bytes (see the module comment). Never throws. */
export function inspectPdf(bytes: Buffer): PdfStructure {
  // Byte offsets: hiddenText slices the bytes at positions it finds in `raw`, so it reads the unchanged text. Markers
  // are read outside the streams' data, and in the object and metadata streams once inflated.
  const raw = bytes.toString('latin1');
  const ranges = streamRanges(raw);
  const text = plainNames(outsideStreams(raw, ranges));
  const linearized = /\/Linearized\b/.test(raw.slice(0, 2048));
  const signed = /\/ByteRange\s*\[/.test(text);
  const eofs = eofsOf(raw, ranges).length;
  // The linearization's first-page section ends in an %%EOF of its own; a signature is usually its own revision.
  const revisions = Math.max(1, eofs - (linearized && eofs > 1 ? 1 : 0) - (signed && eofs > 1 ? 1 : 0));
  const all = `${text}\n${plainNames(hiddenText(raw, bytes, ranges))}`;
  const kinds = new Set<string>();
  for (const match of all.matchAll(/\/Subtype\s*\/([A-Za-z]+)/g)) if (ANNOTATION_SUBTYPES.includes(match[1]!)) kinds.add(match[1]!);
  const producer = infoValue(all, 'Producer') ?? xmpValue(all, 'pdf:Producer');
  const creator = infoValue(all, 'Creator') ?? xmpValue(all, 'xmp:CreatorTool');
  const created = pdfDate(infoValue(all, 'CreationDate')) ?? pdfDate(xmpValue(all, 'xmp:CreateDate'));
  const modified = pdfDate(infoValue(all, 'ModDate')) ?? pdfDate(xmpValue(all, 'xmp:ModifyDate'));
  return {
    revisions,
    linearized,
    signed,
    encrypted: /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(text),
    ...(producer ? { producer } : {}),
    ...(creator ? { creator } : {}),
    ...(created ? { created } : {}),
    ...(modified ? { modified } : {}),
    // Active content: JavaScript, a launch action, rich media or an XFA form. A plain /OpenAction (go to a page) is benign.
    javascript: /\/(?:JavaScript|JS|RichMedia|XFA)\b/.test(all) || /\/S\s*\/Launch\b/.test(all),
    acroForm: /\/AcroForm\b/.test(all),
    formFields: /\/FT\s*\/(?:Tx|Ch|Btn)\b/.test(all),
    annotationKinds: [...kinds].sort(),
    embeddedFiles: /\/EmbeddedFiles?\b/.test(all),
  };
}

/**
 * Tools that edit a PDF's text after it was made (online editors and desktop editors' edit modes), as they write
 * themselves into Producer or Creator. Not in the list, on purpose: the libraries banks and utilities generate
 * statements with (iText, Apache FOP, BFO, PDFlib, Crystal Reports, OpenText Exstream, Quadient, Ghostscript…) and
 * printing to PDF (Microsoft Print to PDF, Chrome's Skia/PDF, macOS Quartz), which by itself says nothing.
 */
const EDITOR_TOOLS: readonly RegExp[] = [
  /ilovepdf/i,
  /smallpdf/i,
  /sejda/i,
  /pdfescape/i,
  /\bpdf\s*24\b/i,
  /\bxodo\b/i,
  /pdf-?xchange/i,
  /core\s*api\s*sdk/i,
  // iText adds this to the Producer when it changes an existing PDF (a statement it made itself says only "iText").
  /modified\s+using\s+itext/i,
  // Saved in Acrobat itself; "Acrobat Distiller" and the "Adobe PDF Library" that banks generate with are not edits.
  /adobe\s+acrobat\s+(?:pro|standard)|acrobat\s+(?:pro|standard)\b/i,
  /coreldraw/i,
  /foxit\s*(?:phantom|pdf\s*editor)/i,
  /phantompdf/i,
  /nitro\s*pro|nitro\s*pdf/i,
  /pdfelement|wondershare/i,
  /pdffiller/i,
  /dochub/i,
  /docfly/i,
  /pdf\s*candy/i,
  /pdf2go/i,
  /soda\s*pdf/i,
  /pdfsimpli/i,
  /formswift/i,
  /pdf\s*buddy/i,
  /\bcanva\b/i,
  /photoshop/i,
  /\bgimp\b/i,
  /illustrator/i,
  /inkscape/i,
  /libreoffice\s*draw/i,
  /master\s*pdf\s*editor/i,
  /pdf\s*studio/i,
  /able2extract/i,
  /acrobat.*paper\s*capture/i,
];

export function isEditorTool(name: string | undefined): boolean {
  return Boolean(name) && EDITOR_TOOLS.some((pattern) => pattern.test(name!));
}

/** What PDF.js read in the reader's process (engine.ts `pdfText`), when it ran. */
export interface PdfReaderFacts {
  producer?: string;
  creator?: string;
  created?: string;
  modified?: string;
  /** Annotation subtypes on the pages read (1 to 3); form widgets aren't among them (`formFields`). */
  annotationKinds?: string[];
  /** Fields to type into, tick or choose on those pages (signature fields aren't). */
  formFields?: boolean;
  /** Fonts on the first page: how many text runs each draws, and how many of those hold digits. */
  fonts?: { runs: number; digitRuns: number }[];
  /** Places on the pages read where two different texts are drawn at the same spot (new text over a covered one). */
  overlaps?: number;
  /** For a PDF saved more than once: whether its first revision's text differs from its last one's (null: couldn't tell). */
  revisionTextChanged?: boolean | null;
}

export type PdfFinding =
  | 'pdf_editor_tool'
  | 'pdf_incremental_updates'
  | 'pdf_edited_after_creation'
  | 'pdf_annotations'
  | 'pdf_form_fields'
  | 'pdf_font_mix'
  | 'pdf_javascript'
  | 'pdf_text_overlay'
  | 'pdf_created_before_statement';

const DAY_MS = 86_400_000;

/**
 * A font that draws only one or two runs with digits on a first page set mostly in a few other fonts: the mark of a
 * number typed over a statement in another font. Soft: a bold total or a logo's font can look the same.
 */
export function fontMix(fonts: readonly { runs: number; digitRuns: number }[] | undefined): boolean {
  if (!fonts || fonts.length < 3) return false;
  const main = fonts.filter((font) => font.runs >= 5);
  if (main.length < 2) return false;
  return fonts.some((font) => font.runs <= 2 && font.digitRuns >= 1);
}

/**
 * The findings, and whether the PDF looks unedited (after the forensic tools' practice: deny-list editors, never
 * allow-list generators, since genuine statements come from many):
 * - `fail` (strong): an editor's name, a later revision whose text differs from the first one's, two different texts
 *   drawn at one spot, annotations or fillable fields over its pages, active content, or a file created more than a day
 *   before the date it states;
 * - `unsure` (weak, staff look): a revision we couldn't compare, or a modification more than a day after it was made;
 * - `pass` otherwise. A revision that changed no text (a signature, metadata) and printing to PDF say nothing;
 *   `pdf_font_mix` is a note for staff that never changes the outcome. Nothing here ever rejects a document.
 * `statementDate` is the date the document states (YYYY-MM-DD), when it labels one.
 */
export function judgePdf(structure: PdfStructure, reader: PdfReaderFacts = {}, statementDate?: string): { findings: PdfFinding[]; unedited: 'pass' | 'fail' | 'unsure' } {
  const findings = new Set<PdfFinding>();
  const strong = new Set<PdfFinding>();
  const flag = (finding: PdfFinding, isStrong: boolean) => {
    findings.add(finding);
    if (isStrong) strong.add(finding);
  };
  const producer = reader.producer ?? structure.producer;
  const creator = reader.creator ?? structure.creator;
  if (isEditorTool(producer) || isEditorTool(creator) || isEditorTool(structure.producer) || isEditorTool(structure.creator)) flag('pdf_editor_tool', true);
  if (structure.revisions > 1 && reader.revisionTextChanged !== false) flag('pdf_incremental_updates', reader.revisionTextChanged === true);
  if ((reader.overlaps ?? 0) > 0) flag('pdf_text_overlay', true);
  const created = pdfDate(reader.created) ?? structure.created;
  const modified = pdfDate(reader.modified) ?? structure.modified;
  if (created && modified && Date.parse(modified) - Date.parse(created) > DAY_MS) flag('pdf_edited_after_creation', false);
  if (created && statementDate && Date.parse(`${statementDate}T00:00:00Z`) - Date.parse(created) > DAY_MS) flag('pdf_created_before_statement', true);
  const kinds = new Set([...structure.annotationKinds, ...(reader.annotationKinds ?? [])]);
  if ([...kinds].some((kind) => (OVERLAY_ANNOTATIONS as readonly string[]).includes(kind))) flag('pdf_annotations', true);
  if (structure.formFields || reader.formFields) flag('pdf_form_fields', true);
  // Active content or files embedded in it: nothing a statement needs.
  if (structure.javascript || structure.embeddedFiles) flag('pdf_javascript', true);
  if (fontMix(reader.fonts)) flag('pdf_font_mix', false);
  const unedited = strong.size > 0 ? 'fail' : findings.has('pdf_incremental_updates') || findings.has('pdf_edited_after_creation') ? 'unsure' : 'pass';
  return { findings: [...findings], unedited };
}
