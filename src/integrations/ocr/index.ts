import { ADDRESS_PROOF_RULES, type IdentityDocumentType } from '@/contracts';
import type { AddressDocumentReader, AddressDocumentReading } from '@/integrations/ai/document-reader';
import type { IdDocumentReader, IdDocumentReading } from '@/integrations/ai/id-document-reader';
import { AiUnavailableError } from '@/integrations/ai/writer';
import { parseAamva, type IdBarcodeDetails } from './aamva';
import { judgeAddressProof, type ProofText } from './address-proof';
import { barcodeReading } from './back';
import { EngineFailureError, OverBudgetError, UnreadableDocumentError, withReadSession, type OcrPass, type ReadBudget, type ReadSession } from './engine';
import { combineFronts, completeFront, readLicenseFront } from './license';
import { confirmedNames, findPassportZone } from './mrz';
import { words } from './text';
import { lineText, type OcrPage } from './types';

export { parseAamva, type IdBarcodeDetails } from './aamva';

/**
 * The server's own document readers (owner, 2026-11-21: "for ID check: our own server"; no paid AI). They run
 * here, free, with no outside service and no network call: zxing decodes a license or ID card's barcode,
 * Tesseract reads photos, PDF.js reads a PDF's own text. They answer only what they read with confidence and say
 * unreadable otherwise; staff still decide every case. The job runner calls the readers
 * (verification.read_documents); a staff action reads a back's barcode on demand (`readIdBarcode`, about a second).
 * A read takes a second or a few of CPU and up to about 400 MB (a license's back and front), one read at a time
 * per process (engine.ts). Nothing they read is logged or kept beyond the reading they return.
 */

export const SERVER_READER_NAME = 'server:ocr';

/** Tesseract's page segmentation modes used here. */
const PSM = { AUTO: 3, SINGLE_BLOCK: 6, SPARSE_TEXT: 11 } as const;
const MRZ_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
const IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'];
/** A printed word that confirms a passport's MRZ names must be read at least this well. */
const PRINTED_WORD_CONFIDENCE = 60;
/** A proof's OCR words below this confidence are left out of its text. */
const PROOF_WORD_CONFIDENCE = 50;
/** A photographed proof whose words average this much is read with confidence (its "no" answers count). */
const CONFIDENT_PAGE = 75;
/** Fewer words than this and the photo may be sideways: a quarter turn each way is tried. */
const FEW_WORDS = 8;
/** PDFs: longer ones aren't read at all; text comes from the first pages. */
const PDF_LIMITS = { maxPages: 50, readPages: 3 };
const PDF_MAX_BYTES = ADDRESS_PROOF_RULES.maxMegabytes * 1024 * 1024;

export interface ServerReaderOptions {
  /** Tests: a smaller budget. */
  budget?: ReadBudget;
  /** Tests: the day the read happens (it settles two-digit years and checks dates are plausible). */
  now?: () => Date;
}

/** Over budget or a file that won't open: `unreadable`. The engine failing: unavailable (logged, never retried). */
async function guarded<T>(read: () => Promise<T>, unreadable: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof OverBudgetError || error instanceof UnreadableDocumentError) return unreadable;
    if (error instanceof EngineFailureError) throw new AiUnavailableError(error.message, { cause: error });
    throw error;
  }
}

const confidentWords = (page: OcrPage, min: number) => page.lines.flatMap((line) => line.words).filter((word) => word.confidence >= min);

/** Folded words printed on the page and read well, MRZ lines left out (so they can't confirm themselves). */
function printedWords(page: OcrPage): Set<string> {
  return new Set(confidentWords(page, PRINTED_WORD_CONFIDENCE).filter((word) => !/[<«‹]/.test(word.text)).flatMap((word) => words(word.text)));
}

/** The photo of a read, the way it turned out upright. */
type Photo = Pick<OcrPass, 'bytes' | 'turn'>;

/** One OCR pass over the photo (a photo that won't decode ends the read as unreadable). */
function recognizePhoto(session: ReadSession, photo: Photo, psm: number, options: Pick<OcrPass, 'band' | 'whitelist' | 'threshold'> = {}): Promise<OcrPage> {
  return session.recognize({ ...photo, ...options, psm });
}

/** The first pass, turned a quarter each way when the photo reads almost nothing (taken sideways). */
async function firstPass(session: ReadSession, bytes: Buffer, psm: number): Promise<{ page: OcrPage; photo: Photo }> {
  let best: { page: OcrPage; photo: Photo } = { page: await recognizePhoto(session, { bytes }, psm), photo: { bytes } };
  if (confidentWords(best.page, PRINTED_WORD_CONFIDENCE).length >= FEW_WORDS) return best;
  for (const turn of [90, 270] as const) {
    const page = await recognizePhoto(session, { bytes, turn }, psm);
    if (confidentWords(page, PRINTED_WORD_CONFIDENCE).length > confidentWords(best.page, PRINTED_WORD_CONFIDENCE).length) best = { page, photo: { bytes, turn } };
  }
  return best;
}

/**
 * A passport's photo page: its machine-readable zone (from the first pass, else a pass over the bottom of the
 * page with only the MRZ's characters, else the whole page that way), every check digit passed, and its names
 * confirmed by the printed page. Null when there's no zone; unreadable when its names aren't confirmed.
 */
async function readPassport(session: ReadSession, photo: Photo, first: OcrPage, today: Date): Promise<IdDocumentReading | null> {
  const linesOf = (page: OcrPage) => page.lines.map(lineText);
  let zone = findPassportZone(linesOf(first), today);
  for (const band of [{ top: 0.55, bottom: 1 }, { top: 0, bottom: 1 }]) {
    if (zone) break;
    zone = findPassportZone(linesOf(await recognizePhoto(session, photo, PSM.SINGLE_BLOCK, { band, whitelist: MRZ_ALPHABET })), today);
  }
  if (!zone) return null;
  const names = confirmedNames(zone, printedWords(first));
  if (!names) return { readable: false };
  return {
    readable: true,
    documentType: 'passport',
    givenNames: names.givenNames,
    surname: names.surname,
    dateOfBirth: zone.dateOfBirth,
    expiryDate: zone.expiryDate,
    issuingState: zone.issuingState,
    documentNumber: zone.documentNumber,
  };
}

/** The front's photo: a passport's MRZ, or a US license or state ID's labeled fields (or a passport sent as one). */
async function readFront(session: ReadSession, bytes: Buffer, declaredType: IdentityDocumentType, today: Date): Promise<IdDocumentReading> {
  const passport = declaredType === 'passport';
  const first = await firstPass(session, bytes, passport ? PSM.AUTO : PSM.SPARSE_TEXT);
  if (passport) return (await readPassport(session, first.photo, first.page, today)) ?? { readable: false };
  const fronts = [readLicenseFront(first.page.lines, today)];
  if (!completeFront(fronts[0]!) && first.page.lines.some((line) => lineText(line).includes('<<'))) {
    // A passport sent as a license or ID.
    const zone = await readPassport(session, first.photo, first.page, today);
    if (zone) return zone;
  }
  // Otsu's threshold when the fields or the header (a light-on-dark band) didn't all read, then the photo
  // segmented another way (a card's columns joined into lines) when the fields still didn't.
  if (!completeFront(fronts[0]!) || !fronts[0]!.documentType || !fronts[0]!.issuingState) {
    fronts.push(readLicenseFront((await recognizePhoto(session, first.photo, PSM.SPARSE_TEXT, { threshold: 'otsu' })).lines, today));
  }
  if (!fronts.some(completeFront)) {
    fronts.push(readLicenseFront((await recognizePhoto(session, first.photo, PSM.AUTO)).lines, today));
  }
  return combineFronts(fronts);
}

/** A step whose photo won't open reads nothing; the read goes on with the other photo. */
async function unlessUnreadable<T>(step: () => Promise<T>, unreadable: T): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof UnreadableDocumentError) return unreadable;
    throw error;
  }
}

/** The fields of the barcode in a photo of a card's back, or null when none decodes or it isn't an AAMVA one. */
async function backBarcode(session: ReadSession, bytes: Buffer, today: Date): Promise<IdBarcodeDetails | null> {
  const text = await session.barcode(bytes);
  return text ? parseAamva(text, today) : null;
}

/**
 * The server's ID reader. A license or state ID with its back: the back's barcode first, every field exact and from it
 * (`source: 'barcode'`, the kind of card from its subfile), then the front as before, only to say whether it agrees
 * (`frontAgrees`). Without a barcode that decodes: the front's labeled fields (`source: 'front'`). A passport: its MRZ.
 */
export function createServerIdReader(options: ServerReaderOptions = {}): IdDocumentReader {
  const now = options.now ?? (() => new Date());
  return {
    name: SERVER_READER_NAME,
    async read({ document, back, declaredType }) {
      const passport = declaredType === 'passport';
      const backPhoto = !passport && back && IMAGE_TYPES.includes(back.contentType) ? back : undefined;
      const frontPhoto = IMAGE_TYPES.includes(document.contentType);
      if (!frontPhoto && !backPhoto) return { readable: false };
      const today = now();
      return guarded(
        () =>
          withReadSession(async (session): Promise<IdDocumentReading> => {
            const details = backPhoto ? await unlessUnreadable(() => backBarcode(session, backPhoto.bytes, today), null) : null;
            const front: IdDocumentReading = frontPhoto ? await unlessUnreadable(() => readFront(session, document.bytes, declaredType, today), { readable: false }) : { readable: false };
            if (details) return barcodeReading(details, front);
            return passport || !front.readable ? front : { ...front, source: 'front' };
          }, options.budget),
        { readable: false },
      );
    },
  };
}

/**
 * The fields of the barcode on a license or state ID card's back, read on demand (a staff action shows them before
 * the photos are opened): one read session, about a second. Null for a photo that won't open or shows no AAMVA
 * barcode; throws `AiUnavailableError` when the engine fails.
 */
export async function readIdBarcode(back: { bytes: Buffer; contentType: string }, options: ServerReaderOptions = {}): Promise<IdBarcodeDetails | null> {
  if (!IMAGE_TYPES.includes(back.contentType)) return null;
  const today = (options.now ?? (() => new Date()))();
  return guarded(async () => {
    const text = await withReadSession((session) => session.barcode(back.bytes), options.budget);
    return text ? parseAamva(text, today) : null;
  }, null);
}

/** A photographed proof's text: the words read well enough, line by line. */
function photoText(page: OcrPage): ProofText {
  const lines = page.lines.map((line) => line.words.filter((word) => word.confidence >= PROOF_WORD_CONFIDENCE).map((word) => word.text).join(' ')).filter(Boolean);
  return { text: lines.join('\n'), confident: page.confidence >= CONFIDENT_PAGE };
}

/** The server's proof-of-address reader: a PDF's own text (a scan without one is unreadable), or OCR of a photo. */
export function createServerAddressReader(options: ServerReaderOptions = {}): AddressDocumentReader {
  return {
    name: SERVER_READER_NAME,
    async read({ document, expected }) {
      const pdf = document.contentType === 'application/pdf';
      if (!pdf && !IMAGE_TYPES.includes(document.contentType)) return { readable: false };
      if (pdf && document.bytes.length > PDF_MAX_BYTES) return { readable: false };
      return guarded(async (): Promise<AddressDocumentReading> => {
        const proof = await withReadSession(async (session): Promise<ProofText | null> => {
          if (pdf) {
            const { text } = await session.pdfText(document.bytes, PDF_LIMITS);
            return text === null ? null : { text, confident: true };
          }
          return photoText((await firstPass(session, document.bytes, PSM.AUTO)).page);
        }, options.budget);
        return proof ? judgeAddressProof(proof, expected) : { readable: false };
      }, { readable: false });
    },
  };
}
