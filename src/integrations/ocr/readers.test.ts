import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { AddressDocumentInput } from '@/integrations/ai/document-reader';
import { withReadSession } from './engine';
import { createServerAddressReader, createServerIdReader } from './index';
import { aamvaText, cardBack, pdf417, photograph, TEXAS_LICENSE } from './test-barcodes';

/**
 * The server's readers on documents rendered here from SVG text: a fictional Texas license (its back's barcode drawn
 * with zxing's writer), the ICAO Doc 9303 specimen passport (ERIKSSON ANNA MARIA), a fictional utility bill and small
 * PDFs. Real OCR, a few seconds a read, so few cases and generous timeouts. Skipped where no fonts are installed
 * (nothing would render).
 */

const now = () => new Date('2026-11-21T12:00:00Z');
const SLOW = 120_000;
const SANS = 'DejaVu Sans, Liberation Sans, FreeSans, sans-serif';
const MONO = 'DejaVu Sans Mono, Liberation Mono, FreeMono, monospace';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x: number, y: number, size: number, value: string, more = '') => `<text x="${x}" y="${y}" font-size="${size}" font-family="${SANS}" ${more}>${escape(value)}</text>`;
const svg = (width: number, height: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
/** As the upload stores it: a WebP. */
const webp = (image: Buffer) => sharp(image).webp({ quality: 85 }).toBuffer();
/** Like a phone photo: a little turned, soft and compressed. */
const photo = async (image: Buffer, background: string) => sharp(await sharp(image).rotate(-1.2, { background }).blur(0.8).jpeg({ quality: 60 }).toBuffer()).webp({ quality: 85 }).toBuffer();

const fontsRender = (await sharp(svg(200, 60, `<rect width="200" height="60" fill="#fff"/>${text(10, 45, 40, 'ABC')}`)).grayscale().stats()).channels[0]!.min < 128;

function licenseFront(): Buffer {
  return svg(
    1700,
    1070,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dfe9f5"/><stop offset="1" stop-color="#f7efe0"/></linearGradient></defs>
    <rect width="1700" height="1070" rx="40" fill="url(#g)"/><rect width="1700" height="150" fill="#1d3f72"/>
    ${text(60, 105, 84, 'TEXAS', 'fill="#fff" font-weight="bold"')}${text(1200, 70, 40, 'USA', 'fill="#fff"')}${text(1000, 125, 44, 'DRIVER LICENSE', 'fill="#fff" font-weight="bold"')}
    <rect x="70" y="220" width="420" height="540" fill="#9aa7b8"/>
    ${text(560, 240, 46, '4d DLN 12345678', 'fill="#b0002a"')}${text(1280, 240, 40, '9 CLASS C')}
    ${text(560, 320, 46, '3 DOB 04/02/1990', 'fill="#b0002a"')}
    ${text(560, 395, 40, '4a ISS 04/02/2022')}${text(1100, 395, 40, '4b EXP 04/02/2030')}
    ${text(560, 480, 50, '1 SAMPLE', 'font-weight="bold"')}${text(560, 550, 50, '2 ALEX RIVER', 'font-weight="bold"')}
    ${text(560, 630, 40, '8 1234 EXAMPLE LANE APT 2')}${text(600, 685, 40, 'AUSTIN, TX 78723')}
    ${text(560, 770, 36, '15 SEX F   16 HGT 5-05   18 EYES BRO')}${text(80, 960, 36, 'NOT A REAL DOCUMENT - TEST SPECIMEN')}`,
  );
}

/** The specimen's photo page, with the MRZ given. */
function passportPage(mrz: [string, string]): Buffer {
  const line = (y: number, value: string) => `<text x="70" y="${y}" font-size="56" font-family="${MONO}">${escape(value)}</text>`;
  return svg(
    1800,
    1250,
    `<rect width="1800" height="1250" fill="#efe8f3"/>${text(60, 90, 48, 'PASSPORT   UTOPIA')}<rect x="70" y="160" width="430" height="560" fill="#a59bb0"/>
    ${text(560, 200, 30, 'Surname')}${text(560, 245, 42, 'ERIKSSON')}${text(560, 310, 30, 'Given names')}${text(560, 355, 42, 'ANNA MARIA')}
    ${text(560, 420, 30, 'Date of birth')}${text(560, 465, 42, '12 AUG 1974')}${text(560, 530, 30, 'Date of expiry')}${text(560, 575, 42, '15 APR 2012')}
    ${text(60, 820, 30, 'SPECIMEN - ICAO DOC 9303')}${line(1040, mrz[0])}${line(1130, mrz[1])}`,
  );
}
const MRZ_1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const MRZ_2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

function utilityBill(): Buffer {
  const rows: Array<[number, number, number, string, string?]> = [
    [100, 160, 64, 'Riverbend Power & Water', 'font-weight="bold"'],
    [100, 230, 34, 'Electric and water utility service statement'],
    [1050, 160, 34, 'Statement date'],
    [1050, 210, 40, 'October 28, 2026'],
    [1050, 290, 34, 'Account number'],
    [1050, 340, 40, '0042-118-7731'],
    [100, 420, 38, 'Service address'],
    [100, 480, 44, 'ALEX R SAMPLE'],
    [100, 535, 44, '1234 EXAMPLE LN APT 2'],
    [100, 590, 44, 'AUSTIN TX 78723-1234'],
    [100, 720, 40, 'Billing period: Sep 26, 2026 to Oct 25, 2026'],
    [100, 800, 40, 'Electric service: 612 kWh at the residential rate'],
    [1300, 800, 40, '$71.20'],
    [100, 870, 40, 'Water service: 4,100 gallons'],
    [1300, 870, 40, '$17.25'],
    [100, 960, 44, 'Amount due by November 18, 2026', 'font-weight="bold"'],
    [100, 1100, 32, 'Meter number 55-0193 read on October 25, 2026. Thank you for your payment.'],
    [100, 2100, 28, 'FICTIONAL TEST DOCUMENT - NOT A REAL BILL'],
  ];
  return svg(1700, 2200, `<rect width="1700" height="2200" fill="#fbfaf7"/>${rows.map(([x, y, size, value, more]) => text(x, y, size, value, more)).join('')}`);
}

/** A PDF with a text layer, one page per list of lines (Helvetica, built by hand). */
function textPdf(pages: string[][]): Buffer {
  const pdfString = (value: string) => `(${value.replace(/[\\()]/g, (ch) => `\\${ch}`)})`;
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids: string[] = [];
  for (const lines of pages) {
    const content = ['BT', '/F1 12 Tf', '16 TL', '72 720 Td', ...lines.map((line) => `${pdfString(line)} Tj T*`), 'ET'].join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`);
    kids.push(`${objects.length} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(out, 'latin1');
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/**
 * The same PDF saved again with page 1's text replaced (an incremental update: the page and a new content stream
 * appended, with an xref pointing back to the first), as an editor saves a change.
 */
function amendPdf(file: Buffer, lines: string[]): Buffer {
  const original = file.toString('latin1');
  const pdfString = (value: string) => `(${value.replace(/[\\()]/g, (ch) => `\\${ch}`)})`;
  const size = Number(original.match(/\/Size (\d+)/)![1]);
  const prev = Number(original.match(/startxref\n(\d+)/)![1]);
  const content = ['BT', '/F1 12 Tf', '16 TL', '72 720 Td', ...lines.map((line) => `${pdfString(line)} Tj T*`), 'ET'].join('\n');
  let out = original;
  const contentAt = Buffer.byteLength(out, 'latin1');
  out += `${size} 0 obj\n<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream\nendobj\n`;
  const pageAt = Buffer.byteLength(out, 'latin1');
  out += `5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${size} 0 R >>\nendobj\n`;
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n5 1\n${String(pageAt).padStart(10, '0')} 00000 n \n${size} 1\n${String(contentAt).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${size + 1} /Root 1 0 R /Prev ${prev} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const BILL_TEXT = [
  'Riverbend Power & Water',
  'Statement date: October 28, 2026',
  'Service address:',
  'ALEX R SAMPLE',
  '1234 EXAMPLE LN APT 2',
  'AUSTIN TX 78723-1234',
  'Electric service 612 kWh $71.20',
  'Water service 4,100 gallons $17.25',
  'Meter reading on 10/25/2026',
  'Amount due $88.45 by 11/18/2026. Thank you for your payment.',
];
const expected: AddressDocumentInput['expected'] = { name: 'Alex Sample', address: '1234 Example Lane, Apt 2, Austin, TX 78723', declaredType: 'utility_bill', submittedOn: '2026-11-12' };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!fontsRender)("the server's document readers", () => {
  const ids = createServerIdReader({ now });
  const proofs = createServerAddressReader({ now });
  const id = (bytes: Buffer, declaredType: 'drivers_license' | 'state_id' | 'passport') => ids.read({ document: { bytes, contentType: 'image/webp' }, declaredType });

  it("reads a US license's labeled fields and its header, in a shadow too", { timeout: SLOW }, async () => {
    expect(ids.name).toBe('server:ocr');
    await expect(id(await photo(licenseFront(), '#d8d8d8'), 'drivers_license')).resolves.toMatchObject({
      readable: true,
      source: 'front',
      // Read from the print alone: whether it's genuine is our team's to say (2026-11-27).
      genuine: { outcome: 'unsure', signals: [] },
      documentType: 'drivers_license',
      surname: 'SAMPLE',
      givenNames: 'ALEX RIVER',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      issuingState: 'TX',
      documentNumber: '12345678',
    });
    // Darker and darker to the right: the adaptive threshold still finds the expiry there.
    const shadow = svg(1700, 1070, '<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity="0.7"/></linearGradient></defs><rect width="1700" height="1070" fill="url(#s)"/>');
    const shaded = await sharp(licenseFront()).composite([{ input: shadow }]).png().toBuffer();
    await expect(id(await photo(shaded, '#555555'), 'drivers_license')).resolves.toMatchObject({ readable: true, surname: 'SAMPLE', givenNames: 'ALEX RIVER', dateOfBirth: '1990-04-02', expiryDate: '2030-04-02' });
  });

  it("reads a passport's MRZ with every check digit, even sent as a license", { timeout: SLOW }, async () => {
    const page = await webp(passportPage([MRZ_1, MRZ_2]));
    const reading = { readable: true, documentType: 'passport', surname: 'ERIKSSON', givenNames: 'ANNA MARIA', dateOfBirth: '1974-08-12', expiryDate: '2012-04-15', issuingState: 'UTO', documentNumber: 'L898902C3' };
    // Every check digit passed: read by machine, and genuine as far as the zone can say (2026-11-27).
    await expect(id(page, 'passport')).resolves.toMatchObject({ ...reading, source: 'mrz', genuine: { outcome: 'pass', signals: ['mrz_check_digits_ok'] }, details: { source: 'mrz', documentNumber: 'L898902C3' } });
    await expect(id(page, 'drivers_license')).resolves.toMatchObject({ ...reading, source: 'mrz' });
  });

  it("reads a license's barcode first and checks the front agrees, and reads the front alone without one", { timeout: SLOW }, async () => {
    const front = { bytes: await photo(licenseFront(), '#d8d8d8'), contentType: 'image/webp' };
    const back = async (elements: string[]) => ({ bytes: await photograph(await cardBack(await pdf417(aamvaText({ subfiles: [['DL', elements]] }), { columns: 13, module: 5 })), { angle: 4, quality: 70, blur: 1 }), contentType: 'image/webp' });
    const fromBarcode = {
      readable: true,
      source: 'barcode',
      documentType: 'drivers_license',
      surname: 'SAMPLE',
      givenNames: 'ALEX RIVER',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      issuingState: 'TX',
      documentNumber: '12345678',
      address: { line1: '1234 EXAMPLE LANE', line2: 'APT 2', city: 'AUSTIN', state: 'TX', zip: '78723' },
    };
    await expect(ids.read({ document: front, back: await back(TEXAS_LICENSE), declaredType: 'drivers_license' })).resolves.toMatchObject({ ...fromBarcode, frontAgrees: true, genuine: { outcome: 'pass' } });
    // Another card's back (another birth date and number): its fields, and the front disagrees.
    const otherCard = TEXAS_LICENSE.map((element) => (element.startsWith('DBB') ? 'DBB04021991' : element.startsWith('DAQ') ? 'DAQ87654321' : element));
    await expect(ids.read({ document: front, back: await back(otherCard), declaredType: 'drivers_license' })).resolves.toMatchObject({ ...fromBarcode, dateOfBirth: '1991-04-02', documentNumber: '87654321', frontAgrees: false });
    // A back without a barcode: the front's fields, as before.
    await expect(ids.read({ document: front, back: { bytes: await photograph(await cardBack(null)), contentType: 'image/webp' }, declaredType: 'drivers_license' })).resolves.toMatchObject({
      genuine: { outcome: 'unsure', signals: ['barcode_missing'] },
      readable: true,
      source: 'front',
      documentType: 'drivers_license',
      surname: 'SAMPLE',
      givenNames: 'ALEX RIVER',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      issuingState: 'TX',
      documentNumber: '12345678',
    });
  });

  it('says unreadable for a failed check digit, a blurry photo and an empty one', { timeout: SLOW }, async () => {
    // The composite check digit is 0, not 3.
    await expect(id(await webp(passportPage([MRZ_1, `${MRZ_2.slice(0, 43)}3`])), 'passport')).resolves.toEqual({ readable: false });
    await expect(id(await sharp(licenseFront()).blur(9).webp().toBuffer(), 'drivers_license')).resolves.toEqual({ readable: false });
    await expect(id(await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#f4f1ea' } }).webp().toBuffer(), 'state_id')).resolves.toEqual({ readable: false });
    await expect(ids.read({ document: { bytes: Buffer.from('%PDF-1.4'), contentType: 'application/pdf' }, declaredType: 'passport' })).resolves.toEqual({ readable: false });
  });

  it('answers for a photographed utility bill, and says unreadable for a blurry one', { timeout: SLOW }, async () => {
    const bill = await photo(utilityBill(), '#d8d4cc');
    await expect(proofs.read({ document: { bytes: bill, contentType: 'image/webp' }, expected })).resolves.toMatchObject({
      readable: true,
      documentType: 'utility_bill',
      nameMatches: true,
      addressMatches: true,
      recent: true,
      textSource: 'photo',
      unedited: 'pass',
      signals: expect.arrayContaining(['photo', 'issuer_unknown']),
    });
    await expect(proofs.read({ document: { bytes: await sharp(utilityBill()).blur(10).webp().toBuffer(), contentType: 'image/webp' }, expected })).resolves.toMatchObject({ readable: false });
  });

  it("reads a PDF's own text, and says unreadable for one without text, a broken one or a long one", { timeout: SLOW }, async () => {
    const pdf = (bytes: Buffer) => proofs.read({ document: { bytes, contentType: 'application/pdf' }, expected });
    await expect(pdf(textPdf([BILL_TEXT]))).resolves.toMatchObject({ readable: true, documentType: 'utility_bill', nameMatches: true, addressMatches: true, recent: true, textSource: 'pdf', confident: true, unedited: 'pass' });
    await expect(proofs.read({ document: { bytes: textPdf([BILL_TEXT]), contentType: 'application/pdf' }, expected: { ...expected, name: 'Jordan Lee', submittedOn: '2027-06-01' } })).resolves.toMatchObject({
      readable: true,
      documentType: 'utility_bill',
      nameMatches: false,
      addressMatches: true,
      recent: false,
    });
    await expect(pdf(textPdf([[]]))).resolves.toEqual({ readable: false, textSource: 'pdf', confident: false, signals: ['scanned_pdf'] });
    await expect(pdf(Buffer.from('%PDF-1.7\nnot really a PDF'))).resolves.toEqual({ readable: false });
    await expect(pdf(textPdf(Array.from({ length: 51 }, () => BILL_TEXT)))).resolves.toEqual({ readable: false });
  });

  it("weighs a PDF saved again by what changed: another address is an edit, the same text isn't", { timeout: SLOW }, async () => {
    const pdf = (bytes: Buffer) => proofs.read({ document: { bytes, contentType: 'application/pdf' }, expected });
    const original = textPdf([BILL_TEXT.map((line) => line.replace('1234 EXAMPLE LN', '4321 OTHER LN'))]);
    const edited = await pdf(amendPdf(original, BILL_TEXT));
    expect(edited).toMatchObject({ readable: true, addressMatches: true, unedited: 'fail', signals: expect.arrayContaining(['pdf_incremental_updates']) });
    const resaved = await pdf(amendPdf(textPdf([BILL_TEXT]), BILL_TEXT));
    expect(resaved).toMatchObject({ unedited: 'pass' });
    expect(resaved.signals).not.toContain('pdf_incremental_updates');
  });

  it('finds text drawn over other text, and the mailing block behind the envelope window', { timeout: SLOW }, async () => {
    const pdf = (bytes: Buffer) => proofs.read({ document: { bytes, contentType: 'application/pdf' }, expected });
    const clean = await pdf(textPdf([BILL_TEXT]));
    expect(clean.signals).toEqual(expect.arrayContaining(['address_in_header', 'name_near_address']));
    expect(clean.signals).not.toContain('pdf_text_overlay');
    // A second string drawn where the ZIP is: what a white box and new text leave behind.
    const covered = textPdf([BILL_TEXT]).toString('latin1').replace('ET\nendstream', 'ET\nBT /F1 12 Tf 72 640 Td (AUSTIN TX 78701) Tj ET\nendstream').replace(/\/Length (\d+)/, (_, length: string) => `/Length ${Number(length) + 'BT /F1 12 Tf 72 640 Td (AUSTIN TX 78701) Tj ET\n'.length}`);
    const overlaid = await pdf(Buffer.from(covered, 'latin1'));
    expect(overlaid).toMatchObject({ unedited: 'fail', signals: expect.arrayContaining(['pdf_text_overlay']) });
  });

  it('stops a read past its time or memory budget, and runs one read at a time', { timeout: SLOW }, async () => {
    const pdf = textPdf([BILL_TEXT]);
    const late = (budget: { ms: number; memoryBytes: number }) =>
      withReadSession(async (session) => {
        await sleep(600);
        return session.pdfText(pdf, { maxPages: 5, readPages: 1 });
      }, budget);
    await expect(late({ ms: 100, memoryBytes: 768 * 1024 * 1024 })).rejects.toMatchObject({ name: 'OverBudgetError', budget: 'time' });
    // Any memory at all is over this budget (measured from Linux's /proc).
    if (process.platform === 'linux') await expect(late({ ms: 60_000, memoryBytes: Number.NEGATIVE_INFINITY })).rejects.toMatchObject({ name: 'OverBudgetError', budget: 'memory' });
    await expect(createServerAddressReader({ budget: { ms: 1, memoryBytes: 768 * 1024 * 1024 } }).read({ document: { bytes: pdf, contentType: 'application/pdf' }, expected })).resolves.toEqual({ readable: false });
    const spans: Array<[number, number]> = [];
    const hold = () =>
      withReadSession(async () => {
        const start = Date.now();
        await sleep(300);
        spans.push([start, Date.now()]);
      });
    await Promise.all([hold(), hold()]);
    expect(spans[1]![0]).toBeGreaterThanOrEqual(spans[0]![1]);
  });
});
