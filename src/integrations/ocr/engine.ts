import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import path from 'node:path';
import type { OcrPage } from './types';

/**
 * Where the server's document readers do their work: a Node process of their own, started for one read and
 * killed after it, that prepares photos (sharp), runs Tesseract on them (tesseract.js, English data shipped in
 * node_modules, nothing ever downloaded), decodes the PDF417 barcode on the back of a license or ID card (zxing-wasm,
 * its WebAssembly binary read from node_modules, never fetched) and reads PDFs' text (unpdf's PDF.js build). One read
 * at a time per server process, within a time and memory budget: past either, the process is killed and the read ends
 * as over budget, which the readers report as unreadable. A process of its own, not a thread: a crash inside sharp,
 * Tesseract, zxing or PDF.js (a broken or hostile file, a missing data file) never reaches the server; the system
 * takes all its memory back when it ends (a thread's would stay with the server); its memory is measured on its own;
 * and it gets none of the server's environment (only NODE_ENV), so no secret is in reach of a file crafted against
 * PDF.js. Its output (Tesseract's warnings) is dropped, so nothing a document says can reach a log.
 */

/** The longest a read may take, process start, OCR passes and PDF parsing included. */
export const READ_BUDGET_MS = 60_000;
/** The most memory (RSS) the read's process may use. */
export const MEMORY_BUDGET_BYTES = 768 * 1024 * 1024;
/** The process's own JavaScript heap (Tesseract's memory is WebAssembly's, outside it). */
const READER_HEAP_MB = 256;

/** The English LSTM model (tessdata_best, integer), read from the installed package. */
const langPath = () => path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');

/**
 * The reader's process, as source run with `node -e`, so no bundler rewrites it: Next's server bundle can't keep a
 * script file of its own, and tesseract.js, zxing-wasm and unpdf resolve from node_modules where the server runs (the
 * project folder, or the standalone bundle, which next.config.ts tells to include them).
 */
const READER_SOURCE = String.raw`
const sharp = require('sharp');
// One short read: no cache to keep, one thread for the image work (OCR itself runs on one).
sharp.cache(false);
sharp.concurrency(1);
let tesseract = null;
let zxing = null;

const unreadable = () => Object.assign(new Error('image'), { name: 'UnreadableImage' });

// Photos as Tesseract reads them best: upright, on white (a screenshot may be transparent), one gray channel, contrast
// stretched, and 1,800 to 2,500 px on the longer side (bigger ones are scaled down to bound the memory a read takes,
// smaller ones up, since Tesseract misses small print). Optionally turned, or cut to a band of the height (0 to 1).
async function prepare(bytes, turn, band) {
  try {
    const upright = await sharp(Buffer.from(bytes), { failOn: 'error', limitInputPixels: 40000000 })
      .autoOrient()
      .rotate(turn || 0)
      .flatten({ background: '#ffffff' })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = upright.info;
    const top = band ? Math.max(0, Math.floor(height * band.top)) : 0;
    const bottom = band ? Math.min(height, Math.ceil(height * band.bottom)) : height;
    const bandHeight = bottom - top;
    if (bandHeight < 8) throw unreadable();
    const longer = Math.max(width, bandHeight);
    const scale = longer > 2500 ? 2500 / longer : longer < 1800 ? Math.min(3, 1800 / longer) : 1;
    let image = sharp(upright.data, { raw: { width, height, channels } });
    if (bandHeight < height) image = image.extract({ left: 0, top, width, height: bandHeight });
    if (scale !== 1) image = image.resize({ width: Math.round(width * scale), height: Math.round(bandHeight * scale), kernel: 'lanczos3' });
    return await image.normalize().toColourspace('b-w').png({ compressionLevel: 1 }).toBuffer();
  } catch {
    throw unreadable();
  }
}

async function ocrWorker() {
  if (tesseract) return tesseract;
  const { createWorker, OEM } = require('tesseract.js');
  let failed;
  const failure = new Promise((_, reject) => { failed = reject; });
  failure.catch(() => {});
  const created = createWorker('eng', OEM.LSTM_ONLY, {
    langPath: process.env.TNM_OCR_LANG_PATH,
    cacheMethod: 'none',
    gzip: true,
    // tesseract.js throws inside its message handler without one; a failed start never settles otherwise.
    errorHandler: () => failed(Object.assign(new Error('tesseract'), { name: 'EngineFailure' })),
  });
  tesseract = await Promise.race([created, failure]);
  return tesseract;
}

function trimmed(data) {
  const lines = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        lines.push({
          confidence: line.confidence,
          box: line.bbox,
          words: (line.words || []).map((word) => ({ text: word.text, confidence: word.confidence, box: word.bbox })),
        });
      }
    }
  }
  return { confidence: data.confidence, lines };
}

async function recognize({ bytes, turn, band, psm, whitelist, threshold }) {
  const image = await prepare(bytes, turn, band);
  const worker = await ocrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    tessedit_char_whitelist: whitelist || '',
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    // Sauvola's adaptive threshold (2) unless asked otherwise: a shadow or glare across a photo doesn't wash out the
    // text near it. Otsu's global one (0) reads light text on a dark band (a card's header) better.
    thresholding_method: threshold === 'otsu' ? '0' : '2',
  });
  const { data } = await worker.recognize(image, {}, { text: false, blocks: true });
  return trimmed(data);
}

// The barcode reader (zxing-cpp built to WebAssembly), loaded once per process. Its binary is read from node_modules:
// left alone, the package fetches it from a CDN (jsDelivr), and this process never goes online.
function barcodeReader() {
  if (zxing) return zxing;
  const reader = require('zxing-wasm/reader');
  const wasm = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
  reader.prepareZXingModule({ overrides: { wasmBinary: require('node:fs').readFileSync(wasm), locateFile: () => wasm } });
  zxing = reader;
  return zxing;
}

// PDF417 only (the AAMVA barcode), as hard as zxing tries: turned a quarter or half, inverted, and scaled down when big.
const BARCODE_OPTIONS = { formats: ['PDF417'], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 };
// The stored photos' size (the capture scales them to it); a bigger photo is scaled down to it first.
const BARCODE_EDGE = 2000;
// The last try enlarges the photo up to this, so the barcode's thin bars survive being turned.
const BARCODE_ZOOMED_EDGE = 3200;

// A photo of a card's back, upright, on white, one gray channel, at most BARCODE_EDGE px on the longer side.
async function barcodePhoto(bytes) {
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'error', limitInputPixels: 40000000 })
      .autoOrient()
      .flatten({ background: '#ffffff' })
      .resize({ width: BARCODE_EDGE, height: BARCODE_EDGE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 1) throw unreadable();
    return { data, width: info.width, height: info.height };
  } catch {
    throw unreadable();
  }
}

const grayImage = (photo) => sharp(photo.data, { raw: { width: photo.width, height: photo.height, channels: 1 } });

// The photo's tilt: its strongest edge directions folded into a quarter turn (a card's edges, its print and the
// barcode's bars and rows all run at the card's angle), from a softened copy about 1,000 px wide (Scharr's gradients,
// weighted by strength, in half-degree bins). Signed degrees in (-45, 45], the strongest first; the barcode reads
// only within about 2 degrees of level, and quarter turns are zxing's own to try.
async function tilts(photo) {
  const { data, info } = await grayImage(photo)
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .blur(1)
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const BINS = 180;
  const strengths = new Float64Array(BINS);
  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = 3 * (data[i - width + 1] - data[i - width - 1] + data[i + width + 1] - data[i + width - 1]) + 10 * (data[i + 1] - data[i - 1]);
      const gy = 3 * (data[i + width - 1] - data[i - width - 1] + data[i + width + 1] - data[i - width + 1]) + 10 * (data[i + width] - data[i - width]);
      const strength = gx * gx + gy * gy;
      // A step of about 40 gray levels or more.
      if (strength < 409600) continue;
      const angle = ((Math.atan2(gy, gx) * 180) / Math.PI + 360) % 90;
      strengths[Math.min(BINS - 1, Math.floor(angle * 2))] += Math.sqrt(strength);
    }
  }
  const smooth = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) for (let d = -2; d <= 2; d++) smooth[b] += strengths[(b + d + BINS) % BINS] * (3 - Math.abs(d));
  const at = (b) => smooth[((b % BINS) + BINS) % BINS];
  const peaks = [];
  for (let b = 0; b < BINS; b++) {
    let top = at(b) > 0;
    for (let d = 1; d <= 8 && top; d++) top = at(b) >= at(b - d) && at(b) > at(b + d);
    if (!top) continue;
    const curve = at(b - 1) + at(b + 1) - 2 * at(b);
    const offset = curve < 0 ? (0.5 * (at(b - 1) - at(b + 1))) / curve : 0;
    const angle = ((((b + 0.5 + offset) / 2) % 90) + 90) % 90;
    peaks.push({ angle: angle > 45 ? angle - 90 : angle, weight: at(b) });
  }
  peaks.sort((a, b) => b.weight - a.weight);
  return peaks.filter((peak) => peak.weight >= peaks[0].weight / 4).slice(0, 3).map((peak) => peak.angle);
}

// AAMVA's text is ASCII; UTF-8 when it decodes as such, else Latin-1 (every byte kept).
function barcodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString('latin1');
  }
}

// One try: the photo enlarged (zoom), turned clockwise (turn, degrees), contrast stretched, then decoded.
async function decodeBarcode(photo, turn, zoom) {
  let image = grayImage(photo);
  if (zoom > 1) {
    const width = Math.round(photo.width * zoom);
    const height = Math.round(photo.height * zoom);
    image = sharp(await image.resize({ width, height, kernel: 'lanczos3' }).toColourspace('b-w').raw().toBuffer(), { raw: { width, height, channels: 1 } });
  }
  if (turn) image = image.rotate(turn, { background: '#ffffff' });
  const { data, info } = await image.normalize().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), colorSpace: 'srgb' };
  const results = await barcodeReader().readBarcodes(pixels, BARCODE_OPTIONS);
  const found = results.find((result) => result.isValid && result.bytes && result.bytes.length > 0);
  return found ? barcodeText(found.bytes) : null;
}

// The back's 1D barcode (a Florida card's inventory control number, Code 128 or Code 39), or null: the photo as it is,
// then turned level at its strongest tilt.
async function linearCode(bytes) {
  const photo = await barcodePhoto(bytes);
  const options = { formats: ['Code128', 'Code39', 'Code93'], tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, maxNumberOfSymbols: 1 };
  for (const turn of [0, ...(await tilts(photo)).filter((tilt) => Math.abs(tilt) >= 0.75).slice(0, 1).map((tilt) => -tilt)]) {
    let image = grayImage(photo);
    if (turn) image = image.rotate(turn, { background: '#ffffff' });
    const { data, info } = await image.normalize().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const results = await barcodeReader().readBarcodes({ width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), colorSpace: 'srgb' }, options);
    const found = results.find((result) => result.isValid && result.text);
    if (found) return found.text.slice(0, 64);
  }
  return null;
}

// The back's PDF417 text, or null: the photo as it is; then turned level at its strongest tilts (the strongest a
// half degree either way too); then enlarged and turned at the strongest. The first that decodes wins. With "linear",
// the back's 1D barcode instead.
async function barcode({ bytes, linear }) {
  if (linear) return linearCode(bytes);
  const photo = await barcodePhoto(bytes);
  const text = await decodeBarcode(photo, 0, 1);
  if (text !== null) return text;
  const found = await tilts(photo);
  const turns = [];
  for (const [index, tilt] of found.entries()) {
    if (Math.abs(tilt) < 0.75) continue;
    for (const nudge of index === 0 ? [0, 0.5, -0.5] : [0]) turns.push(-(tilt + nudge));
  }
  for (const turn of turns) {
    const turned = await decodeBarcode(photo, turn, 1);
    if (turned !== null) return turned;
  }
  const zoom = BARCODE_ZOOMED_EDGE / Math.max(photo.width, photo.height);
  if (zoom < 1.25) return null;
  const strongest = found.length > 0 && Math.abs(found[0]) >= 0.75 ? -found[0] : 0;
  return decodeBarcode(photo, strongest, Math.min(2, zoom));
}

async function pdfText({ bytes, maxPages, readPages }) {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    useWasm: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  if (pdf.numPages > maxPages) return { pages: pdf.numPages, text: null };
  const parts = [];
  // How the PDF was made, for the proof-of-address checks (pdf-forensics.ts): the annotations and fillable fields on the
  // pages read, and how many text runs each font draws on the first page (a number typed over a statement in another
  // font). Only these facts cross back, never the text they come from.
  const annotationKinds = new Set();
  let formFields = false;
  let fonts = [];
  // Two different texts drawn at one spot: new text over a covered one (the same text twice is a fake bold).
  let overlaps = 0;
  // The first page's mailing block, behind a #10 envelope's window (about 2.25 to 2.94 in from the top, 1 in from the
  // left, at most 3.5 in wide), with room to spare: the name and address of whom it's sent to.
  let mailingBlock = '';
  for (let number = 1; number <= Math.min(pdf.numPages, readPages); number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => (typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''));
    const drawn = new Map();
    for (const item of content.items) {
      const said = typeof item.str === 'string' ? item.str.trim() : '';
      if (said.length < 2 || !Array.isArray(item.transform)) continue;
      const spot = Math.round(item.transform[4]) + ':' + Math.round(item.transform[5]);
      const before = drawn.get(spot);
      if (before === undefined) drawn.set(spot, said);
      else if (before !== said) overlaps += 1;
    }
    if (number === 1) {
      try {
        const viewport = page.getViewport({ scale: 1 });
        const lines = [];
        for (const item of content.items) {
          if (typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) continue;
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          if (x >= 24 && x <= 380 && y >= 100 && y <= 320) lines.push(item.str + (item.hasEOL ? '\n' : ' '));
        }
        mailingBlock = lines.join('').slice(0, 800);
      } catch {
        // A page without a usable viewport has no mailing block to give.
      }
    }
    try {
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype === 'Widget') formFields = formFields || (typeof annotation.fieldType === 'string' && annotation.fieldType !== 'Sig');
        else if (typeof annotation.subtype === 'string') annotationKinds.add(annotation.subtype);
      }
    } catch {
      // Annotations that won't parse say nothing either way.
    }
    if (number === 1) {
      const runs = new Map();
      for (const item of content.items) {
        if (typeof item.str !== 'string' || !item.str.trim()) continue;
        const font = runs.get(item.fontName) || { runs: 0, digitRuns: 0 };
        font.runs += 1;
        if (/[0-9]/.test(item.str)) font.digitRuns += 1;
        runs.set(item.fontName, font);
      }
      fonts = [...runs.values()];
    }
  }
  const info = {};
  try {
    const metadata = await pdf.getMetadata();
    const raw = (metadata && metadata.info) || {};
    for (const [key, name] of [['Producer', 'producer'], ['Creator', 'creator'], ['CreationDate', 'created'], ['ModDate', 'modified']]) {
      if (typeof raw[key] === 'string' && raw[key].trim()) info[name] = raw[key].trim().slice(0, 200);
    }
  } catch {
    // No metadata to read.
  }
  return { pages: pdf.numPages, text: parts.join('\n'), info, annotationKinds: [...annotationKinds], formFields, fonts, overlaps, mailingBlock };
}

// A photo that won't decode, and what PDF.js throws for a file it can't open: the document's fault, not the reader's.
const DOCUMENT_ERRORS = ['UnreadableImage', 'InvalidPDFException', 'PasswordException', 'FormatError', 'MissingPDFException', 'UnknownErrorException', 'AbortException'];

process.on('message', async (message) => {
  try {
    const result = message.type === 'ocr' ? await recognize(message) : message.type === 'barcode' ? await barcode(message) : await pdfText(message);
    process.send({ id: message.id, ok: true, result });
  } catch (error) {
    // Only the kind of failure crosses back: an error's text could quote the document.
    const name = error && typeof error.name === 'string' ? error.name : 'Error';
    process.send({ id: message.id, ok: false, document: DOCUMENT_ERRORS.includes(name) });
  }
});
// The server went away: so does its read.
process.on('disconnect', () => process.exit(0));
`;

/** The read went past its time or memory budget; its process was killed. */
export class OverBudgetError extends Error {
  constructor(readonly budget: 'time' | 'memory') {
    super(`The read went over its ${budget} budget`);
    this.name = 'OverBudgetError';
  }
}

/** The document can't be opened (a broken or password-protected PDF, an image that won't decode). */
export class UnreadableDocumentError extends Error {
  constructor() {
    super("The document couldn't be opened");
    this.name = 'UnreadableDocumentError';
  }
}

/** The engine itself failed (it crashed, or its files are missing). */
export class EngineFailureError extends Error {
  constructor(what: string) {
    super(`The server's document reader failed (${what})`);
    this.name = 'EngineFailureError';
  }
}

export interface OcrPass {
  /** The photo as stored (WebP, PNG, JPEG or GIF); the reader's process prepares it (`prepare` above). */
  bytes: Buffer;
  /** Turned clockwise first (a photo taken sideways). */
  turn?: 90 | 180 | 270;
  /** Only this band of the height, as fractions from the top (the passport's MRZ is at the bottom). */
  band?: { top: number; bottom: number };
  /** Tesseract's page segmentation mode. */
  psm: number;
  /** Only these characters (the MRZ's alphabet). */
  whitelist?: string;
  /** Tesseract's threshold: Sauvola's adaptive one (the default), or Otsu's global one. */
  threshold?: 'sauvola' | 'otsu';
}

/** A PDF's text, and what PDF.js read about how it was made (the proof-of-address checks, pdf-forensics.ts). */
export interface PdfText {
  pages: number;
  /** Null for a PDF longer than `maxPages`. */
  text: string | null;
  /** The Info dictionary's Producer, Creator and dates (PDF date strings, "D:2026…"). */
  info?: { producer?: string; creator?: string; created?: string; modified?: string };
  /** Annotation subtypes on the pages read; form widgets are `formFields`. */
  annotationKinds?: string[];
  /** Fields to type into, tick or choose on those pages (signature fields aren't). */
  formFields?: boolean;
  /** The first page's fonts: how many text runs each draws, and how many of those hold digits. */
  fonts?: { runs: number; digitRuns: number }[];
  /** Places on the pages read where two different texts are drawn at one spot. */
  overlaps?: number;
  /** The first page's text behind an envelope's window (the name and address it's sent to). */
  mailingBlock?: string;
}

export interface PdfLimits {
  /** A longer PDF isn't read at all. */
  maxPages: number;
  /** Text comes from the first pages only. */
  readPages: number;
}

/** One read's process: OCR passes, barcodes and PDF text, each answered in turn. */
export interface ReadSession {
  recognize(pass: OcrPass): Promise<OcrPage>;
  /** The text of the PDF417 barcode in a photo (the back of a license or ID card), or null when none decodes. */
  barcode(bytes: Buffer): Promise<string | null>;
  /** The 1D barcode on a card's back (Florida's inventory control number), or null when none decodes. */
  linearBarcode(bytes: Buffer): Promise<string | null>;
  pdfText(bytes: Buffer, limits: PdfLimits): Promise<PdfText>;
}

export interface ReadBudget {
  ms: number;
  memoryBytes: number;
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs reads one after another in this server process, whoever asks. */
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** A process's resident memory, from Linux's /proc (null elsewhere: then only the time budget applies). */
function residentBytes(pid: number): number | null {
  try {
    const kilobytes = readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/status`, 'latin1').match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1];
    return kilobytes ? Number(kilobytes) * 1024 : null;
  } catch {
    return null;
  }
}

type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; document: boolean };

/**
 * Runs `work` with a fresh reader process, after any read already running in this server process, and kills the
 * process after. Throws `OverBudgetError` past the budget, `UnreadableDocumentError` for a file that can't be opened,
 * and `EngineFailureError` when the reader fails.
 */
export function withReadSession<T>(work: (session: ReadSession) => Promise<T>, budget: ReadBudget = { ms: READ_BUDGET_MS, memoryBytes: MEMORY_BUDGET_BYTES }): Promise<T> {
  return oneAtATime(async () => {
    const child = spawn(process.execPath, [`--max-old-space-size=${READER_HEAP_MB}`, '-e', READER_SOURCE], {
      cwd: process.cwd(),
      // Nothing of the server's but its mode: no keys, no database address.
      env: { NODE_ENV: process.env.NODE_ENV, TNM_OCR_LANG_PATH: langPath() },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
    });
    // Background work: requests to the server go first (its OCR and image threads start later, and inherit this).
    try {
      if (child.pid !== undefined) setPriority(child.pid, 10);
    } catch {
      // Not allowed here: it runs at the server's priority.
    }
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    // Set from the callbacks below; typed wide so the checks after `await` aren't narrowed to null.
    let stopped = null as Error | null;
    const stop = (error: Error) => {
      if (stopped) return;
      stopped = error;
      for (const { reject } of pending.values()) reject(error);
      pending.clear();
      child.kill('SIGKILL');
    };
    child.on('message', (message) => {
      const reply = message as Reply;
      const waiting = pending.get(reply.id);
      if (!waiting) return;
      pending.delete(reply.id);
      if (reply.ok) waiting.resolve(reply.result);
      else waiting.reject(reply.document ? new UnreadableDocumentError() : new EngineFailureError('a step failed'));
    });
    child.on('error', (error) => stop(new EngineFailureError(error.name || 'did not start')));
    child.on('exit', (code, signal) => stop(new EngineFailureError(signal ? `stopped by ${signal}` : `stopped with code ${code}`)));
    const deadline = setTimeout(() => stop(new OverBudgetError('time')), budget.ms);
    const watch = setInterval(() => {
      const resident = child.pid === undefined ? null : residentBytes(child.pid);
      if (resident !== null && resident > budget.memoryBytes) stop(new OverBudgetError('memory'));
    }, 200);
    let nextId = 0;
    const ask = <R>(message: Record<string, unknown>): Promise<R> =>
      new Promise<R>((resolve, reject) => {
        if (stopped) return reject(stopped);
        const id = ++nextId;
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        child.send({ ...message, id }, (error) => {
          if (error) stop(new EngineFailureError('unreachable'));
        });
      });
    const session: ReadSession = {
      recognize: (pass) =>
        ask<OcrPage>({ type: 'ocr', bytes: pass.bytes, turn: pass.turn ?? 0, band: pass.band ?? null, psm: pass.psm, whitelist: pass.whitelist ?? '', threshold: pass.threshold ?? 'sauvola' }),
      barcode: (bytes) => ask<string | null>({ type: 'barcode', bytes }),
      linearBarcode: (bytes) => ask<string | null>({ type: 'barcode', bytes, linear: true }),
      pdfText: (bytes, limits) => ask<PdfText>({ type: 'pdf', bytes, maxPages: limits.maxPages, readPages: limits.readPages }),
    };
    try {
      const result = await work(session);
      // Work that finished as the budget ran out still counts as over it.
      if (stopped instanceof OverBudgetError) throw stopped;
      return result;
    } catch (error) {
      throw stopped instanceof OverBudgetError ? stopped : error;
    } finally {
      clearTimeout(deadline);
      clearInterval(watch);
      stopped ??= new EngineFailureError('done');
      child.kill('SIGKILL');
    }
  });
}
