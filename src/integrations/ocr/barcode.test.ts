import { describe, expect, it } from 'vitest';
import { readIdBarcode } from './index';
import { aamvaText, cardBack, pdf417, photograph, TEXAS_LICENSE, type Shot } from './test-barcodes';

/**
 * The back's barcode, decoded for real in the reader's process: fictional AAMVA barcodes drawn with zxing's writer on
 * a card, photographed soft, small, tilted, turned and compressed, and stored as the capture stores them. About a
 * second a photo, so few cases and generous timeouts. No fonts needed.
 */

const now = () => new Date('2026-11-21T12:00:00Z');
const SLOW = 120_000;
const webp = (bytes: Buffer) => ({ bytes, contentType: 'image/webp' });

async function backPhoto(text: string, symbol: { columns: number; module: number }, shot: Shot): Promise<Buffer> {
  return photograph(await cardBack(await pdf417(text, symbol)), shot);
}

describe("the barcode on a license or ID card's back", () => {
  it('decodes versions and states from photos: soft and compressed, small and tilted, turned over', { timeout: SLOW }, async () => {
    // A 2020 Texas license with its jurisdiction's own subfile: 13 columns, straight, soft, compressed.
    const texas = aamvaText({ subfiles: [['DL', TEXAS_LICENSE], ['ZT', ['ZTAEXAMPLE', 'ZTB0']]] });
    await expect(readIdBarcode(webp(await backPhoto(texas, { columns: 13, module: 5 }, { quality: 55, blur: 1.2 })), { now })).resolves.toEqual({
      documentType: 'drivers_license',
      issuingState: 'TX',
      givenNames: 'ALEX',
      middleNames: 'RIVER',
      surname: 'SAMPLE',
      dateOfBirth: '1990-04-02',
      expiryDate: '2030-04-02',
      issueDate: '2022-04-02',
      documentNumber: '12345678',
      address: { line1: '1234 EXAMPLE LANE', line2: 'APT 2', city: 'AUSTIN', state: 'TX', zip: '78723' },
      sex: 'female',
      height: `5'5"`,
      eyeColor: 'BRO',
    });

    // A 2016 Florida ID: 17 columns, the card small in the photo, tilted 11 degrees, in a shadow.
    const floridaElements = ['DAQS123456789010', 'DCSTESTER', 'DACJORDAN', 'DADLEE', 'DBB11301985', 'DBA11302031', 'DBD11302023', 'DBC1', 'DAYHAZ', 'DAU071 IN', 'DAG500 SAMPLE ST', 'DAIGAINESVILLE', 'DAJFL', 'DAK326010000', 'DCGUSA'];
    const florida = aamvaText({ iin: '636010', version: '09', subfiles: [['ID', floridaElements]] });
    await expect(readIdBarcode(webp(await backPhoto(florida, { columns: 17, module: 4 }, { angle: 11, scale: 0.7, quality: 50, shadow: 0.5, blur: 0.6 })), { now })).resolves.toMatchObject({
      documentType: 'state_id',
      issuingState: 'FL',
      surname: 'TESTER',
      givenNames: 'JORDAN',
      dateOfBirth: '1985-11-30',
      expiryDate: '2031-11-30',
      documentNumber: 'S123456789010',
      address: { city: 'GAINESVILLE', state: 'FL', zip: '32601' },
    });

    // The 2000 standard (a full name, year-first dates), tilted the other way, soft.
    const georgia = aamvaText({ iin: '636055', version: '01', subfiles: [['DL', ['DAQ055123456', 'DAASAMPLE,MORGAN,LEE', 'DAG77 EXAMPLE RD', 'DAIATLANTA', 'DAJGA', 'DAK30303', 'DBA20280115', 'DBB19790115', 'DBD20200115', 'DBC2', 'DAU507']]] });
    await expect(readIdBarcode(webp(await backPhoto(georgia, { columns: 12, module: 5 }, { angle: -19, quality: 70, blur: 1 })), { now })).resolves.toMatchObject({
      issuingState: 'GA',
      surname: 'SAMPLE',
      givenNames: 'MORGAN',
      middleNames: 'LEE',
      dateOfBirth: '1979-01-15',
      expiryDate: '2028-01-15',
      height: `5'7"`,
    });

    // A card photographed upside down, and one sideways and a little tilted.
    const colorado = aamvaText({ iin: '636020', version: '08', subfiles: [['DL', TEXAS_LICENSE.map((element) => (element === 'DAJTX' ? 'DAJCO' : element))]] });
    await expect(readIdBarcode(webp(await backPhoto(colorado, { columns: 15, module: 4 }, { angle: 180, quality: 65 })), { now })).resolves.toMatchObject({ issuingState: 'CO', surname: 'SAMPLE' });
    await expect(readIdBarcode(webp(await backPhoto(colorado, { columns: 15, module: 4 }, { angle: 94, quality: 65, blur: 0.8 })), { now })).resolves.toMatchObject({ issuingState: 'CO', documentNumber: '12345678' });
  });

  it("says null for a back without a barcode, a blurred one, another kind of barcode and a file that won't open", { timeout: SLOW }, async () => {
    const texas = aamvaText({ subfiles: [['DL', TEXAS_LICENSE]] });
    await expect(readIdBarcode(webp(await photograph(await cardBack(null))), { now })).resolves.toBeNull();
    // Blurred past its bars (a blur wider than a bar).
    await expect(readIdBarcode(webp(await backPhoto(texas, { columns: 13, module: 4 }, { blur: 5 })), { now })).resolves.toBeNull();
    await expect(readIdBarcode(webp(await backPhoto('M1SAMPLE/ALEX         EABC123 AUSJFKAA 0123 325Y012A0001 100', { columns: 8, module: 5 }, {})), { now })).resolves.toBeNull();
    await expect(readIdBarcode(webp(Buffer.from('RIFF....WEBPVP8 not really a photo')), { now })).resolves.toBeNull();
    await expect(readIdBarcode({ bytes: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' }, { now })).resolves.toBeNull();
  });
});
