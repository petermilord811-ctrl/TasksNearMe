import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import path from 'node:path';
import type { OcrPage } from './types';

/**
 * Where the server's document readers do their work: a Node process of their own, started for one read and
 * killed after it, that prepares photos (sharp), runs Tesseract on them (tesseract.js, English data shipped in
 * node_modules, nothing ever downloaded) and reads PDFs' text (unpdf's PDF.js build). One read at a time per
 * server process, within a time and memory budget: past either, the process is killed and the read ends as over
 * budget, which the readers report as unreadable. A process of its own, not a thread: a crash inside sharp,
 * Tesseract or PDF.js (a broken or hostile file, a missing data file) never reaches the server; the system takes
 * all its memory back when it ends (a thread's would stay with the server); its memory is measured on its own; and
 * it gets none of the server's environment (only NODE_ENV), so no secret is in reach of a file crafted against
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
 * script file of its own, and tesseract.js and unpdf resolve from node_modules where the server runs (the project
 * folder, or the standalone bundle, which next.config.ts tells to include them).
 */
const READER_SOURCE = String.raw`
const sharp = require('sharp');
// One short read: no cache to keep, one thread for the image work (OCR itself runs on one).
sharp.cache(false);
sharp.concurrency(1);
let tesseract = null;

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
  for (let number = 1; number <= Math.min(pdf.numPages, readPages); number++) {
    const content = await (await pdf.getPage(number)).getTextContent();
    parts.push(content.items.map((item) => (typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''));
  }
  return { pages: pdf.numPages, text: parts.join('\n') };
}

// A photo that won't decode, and what PDF.js throws for a file it can't open: the document's fault, not the reader's.
const DOCUMENT_ERRORS = ['UnreadableImage', 'InvalidPDFException', 'PasswordException', 'FormatError', 'MissingPDFException', 'UnknownErrorException', 'AbortException'];

process.on('message', async (message) => {
  try {
    const result = message.type === 'ocr' ? await recognize(message) : await pdfText(message);
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

export interface PdfLimits {
  /** A longer PDF isn't read at all. */
  maxPages: number;
  /** Text comes from the first pages only. */
  readPages: number;
}

/** One read's process: OCR passes and PDF text, each answered in turn. */
export interface ReadSession {
  recognize(pass: OcrPass): Promise<OcrPage>;
  pdfText(bytes: Buffer, limits: PdfLimits): Promise<{ pages: number; text: string | null }>;
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
      pdfText: (bytes, limits) => ask<{ pages: number; text: string | null }>({ type: 'pdf', bytes, maxPages: limits.maxPages, readPages: limits.readPages }),
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
