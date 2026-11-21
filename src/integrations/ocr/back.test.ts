import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdDocumentReading } from '@/integrations/ai/id-document-reader';
import { AiUnavailableError } from '@/integrations/ai/writer';
import { parseAamva, type IdBarcodeDetails } from './aamva';
import { barcodeReading, frontAgrees } from './back';
import { EngineFailureError, OverBudgetError, UnreadableDocumentError, withReadSession, type ReadSession } from './engine';
import { createServerIdReader, readIdBarcode } from './index';
import { aamvaText, TEXAS_LICENSE } from './test-barcodes';
import type { OcrLine, OcrPage, OcrWord } from './types';

/**
 * The back of a license or ID card as the ID reader uses it, without images: the barcode's reading, the front's
 * agreement, and the reader's steps on a stand-in read session (its OCR pages and barcode text given here).
 */

vi.mock('./engine', async (importOriginal) => ({ ...(await importOriginal<typeof import('./engine')>()), withReadSession: vi.fn() }));

const today = new Date('2026-11-21T12:00:00Z');
const now = () => today;
const details = parseAamva(aamvaText({ subfiles: [['DL', TEXAS_LICENSE]] }), today)!;
const front: IdDocumentReading = { readable: true, documentType: 'drivers_license', surname: 'SAMPLE', givenNames: 'ALEX RIVER', dateOfBirth: '1990-04-02', expiryDate: '2030-04-02', issuingState: 'TX', documentNumber: '12345678' };
const FROM_BARCODE = {
  readable: true,
  source: 'barcode',
  documentType: 'drivers_license',
  givenNames: 'ALEX RIVER',
  surname: 'SAMPLE',
  dateOfBirth: '1990-04-02',
  expiryDate: '2030-04-02',
  issuingState: 'TX',
  documentNumber: '12345678',
  address: { line1: '1234 EXAMPLE LANE', line2: 'APT 2', city: 'AUSTIN', state: 'TX', zip: '78723' },
};

describe("a license's back", () => {
  it("reads every field from the barcode, the given and middle names together, and leaves out the front's word when it didn't read", () => {
    expect(barcodeReading(details, front)).toEqual({ ...FROM_BARCODE, frontAgrees: true });
    expect(barcodeReading(details, { readable: false })).toEqual(FROM_BARCODE);
    const noMiddle: IdBarcodeDetails = { ...details, middleNames: undefined, address: undefined };
    expect(barcodeReading(noMiddle, { readable: false })).toEqual({ ...FROM_BARCODE, givenNames: 'ALEX', address: undefined });
  });

  it("agrees with a front that printed the same surname, birth date and number, OCR's slips and a number's dashes forgiven", () => {
    expect(frontAgrees(details, { ...front, surname: 'SARNPLE', documentNumber: '1234-5678' })).toBe(true);
    expect(frontAgrees({ ...details, documentNumber: 'D1234567' }, { ...front, documentNumber: '01234567' })).toBe(true);
    expect(frontAgrees({ ...details, surname: 'SAMPLE-RIVERS' }, { ...front, surname: 'SAMPLE RIVERS JR' })).toBe(true);
    // The front's number didn't read: the name and birth date decide.
    expect(frontAgrees(details, { ...front, documentNumber: undefined })).toBe(true);
    expect(frontAgrees(details, { ...front, dateOfBirth: '1991-04-02' })).toBe(false);
    expect(frontAgrees(details, { ...front, surname: 'TESTER' })).toBe(false);
    expect(frontAgrees(details, { ...front, documentNumber: '87654321' })).toBe(false);
    expect(frontAgrees(details, { readable: false })).toBeUndefined();
  });
});

/** OCR lines from text, one line every 60 px: words 22 px a letter, three spaces for the next column. */
function page(rows: string[]): OcrPage {
  const lines: OcrLine[] = rows.map((row, index) => {
    const y0 = 40 + index * 60;
    let x = 60;
    const words: OcrWord[] = [];
    for (const column of row.split(/ {3,}/)) {
      for (const text of column.split(' ').filter(Boolean)) {
        words.push({ text, confidence: 94, box: { x0: x, y0, x1: x + text.length * 22, y1: y0 + 40 } });
        x += text.length * 22 + 18;
      }
      x += 400;
    }
    return { words, confidence: 94, box: { x0: 60, y0, x1: x, y1: y0 + 40 } };
  });
  return { confidence: 94, lines };
}
const LICENSE_FRONT = page(['TEXAS   USA', 'DRIVER LICENSE', '4d DLN 12345678   9 CLASS C', '3 DOB 04/02/1990', '4a ISS 04/02/2022   4b EXP 04/02/2030', '1 SAMPLE', '2 ALEX RIVER']);
const BLANK = page([]);

/** A read session whose OCR answers `ocr` for every pass and whose barcode step answers `barcode` (or throws it). */
function session({ ocr = LICENSE_FRONT, barcode = null as string | null | Error } = {}) {
  const steps: string[] = [];
  const fake: ReadSession = {
    recognize: async () => {
      steps.push('ocr');
      return ocr;
    },
    barcode: async () => {
      steps.push('barcode');
      if (barcode instanceof Error) throw barcode;
      return barcode;
    },
    pdfText: async () => ({ pages: 0, text: null }),
  };
  vi.mocked(withReadSession).mockImplementation(async (work) => work(fake));
  return steps;
}

const photo = { bytes: Buffer.from('a photo'), contentType: 'image/webp' };
const text = aamvaText({ subfiles: [['DL', TEXAS_LICENSE]] });

describe("the server's ID reader with a card's back", () => {
  const reader = createServerIdReader({ now });
  beforeEach(() => {
    vi.mocked(withReadSession).mockReset();
  });

  it('reads the barcode first, then the front only to say whether it agrees', async () => {
    const steps = session({ barcode: text });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).resolves.toEqual({ ...FROM_BARCODE, frontAgrees: true });
    expect(steps[0]).toBe('barcode');
    expect(steps.slice(1).every((step) => step === 'ocr')).toBe(true);
    // The kind of card comes from the subfile, whatever was declared; a front that didn't read says nothing.
    session({ barcode: aamvaText({ subfiles: [['ID', TEXAS_LICENSE]] }), ocr: BLANK });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).resolves.toEqual({ ...FROM_BARCODE, documentType: 'state_id' });
    // A front that won't open neither.
    vi.mocked(withReadSession).mockImplementation(async (work) =>
      work({ recognize: async () => Promise.reject(new UnreadableDocumentError()), barcode: async () => text, pdfText: async () => ({ pages: 0, text: null }) }),
    );
    await expect(reader.read({ document: photo, back: photo, declaredType: 'state_id' })).resolves.toEqual(FROM_BARCODE);
  });

  it("reads the front as before, from the front, when there's no barcode to read", async () => {
    const fromFront = { ...front, readable: true, source: 'front' };
    session({ barcode: null });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).resolves.toEqual(fromFront);
    // A barcode that isn't an AAMVA one, a back that won't open, no back at all.
    session({ barcode: 'M1SAMPLE/ALEX EABC123 LAXJFKAA' });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).resolves.toEqual(fromFront);
    session({ barcode: new UnreadableDocumentError() });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).resolves.toEqual(fromFront);
    const steps = session({ barcode: text });
    await expect(reader.read({ document: photo, declaredType: 'drivers_license' })).resolves.toEqual(fromFront);
    expect(steps).not.toContain('barcode');
    // Unreadable stays just that.
    session({ barcode: null, ocr: BLANK });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'state_id' })).resolves.toEqual({ readable: false });
  });

  it('leaves passports as they were, and fails as unavailable when the engine does', async () => {
    const steps = session({ barcode: text, ocr: BLANK });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'passport' })).resolves.toEqual({ readable: false });
    expect(steps).not.toContain('barcode');
    session({ barcode: new EngineFailureError('a step failed') });
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).rejects.toBeInstanceOf(AiUnavailableError);
    vi.mocked(withReadSession).mockRejectedValue(new OverBudgetError('time'));
    await expect(reader.read({ document: photo, back: photo, declaredType: 'drivers_license' })).resolves.toEqual({ readable: false });
  });
});

describe('reading a barcode on demand', () => {
  beforeEach(() => {
    vi.mocked(withReadSession).mockReset();
  });

  it('answers the fields, or null for no barcode, an unreadable photo or one over budget, and throws when the engine fails', async () => {
    session({ barcode: text });
    await expect(readIdBarcode(photo, { now })).resolves.toEqual(details);
    session({ barcode: null });
    await expect(readIdBarcode(photo, { now })).resolves.toBeNull();
    session({ barcode: 'not an AAMVA barcode' });
    await expect(readIdBarcode(photo, { now })).resolves.toBeNull();
    vi.mocked(withReadSession).mockRejectedValue(new UnreadableDocumentError());
    await expect(readIdBarcode(photo, { now })).resolves.toBeNull();
    vi.mocked(withReadSession).mockRejectedValue(new OverBudgetError('memory'));
    await expect(readIdBarcode(photo, { now })).resolves.toBeNull();
    vi.mocked(withReadSession).mockRejectedValue(new EngineFailureError('stopped by SIGSEGV'));
    await expect(readIdBarcode(photo, { now })).rejects.toBeInstanceOf(AiUnavailableError);
    vi.mocked(withReadSession).mockClear();
    await expect(readIdBarcode({ bytes: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' }, { now })).resolves.toBeNull();
    expect(withReadSession).not.toHaveBeenCalled();
  });
});
