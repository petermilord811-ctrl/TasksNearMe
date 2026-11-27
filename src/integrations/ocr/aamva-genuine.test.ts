import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseAamva } from './aamva';
import { barcodeExtras, judgeBarcode, readBarcodeLayout } from './aamva-genuine';
import { BARCODE_SIGNATURE_KEYS, decodeAscii85, encodeAscii85, p256PublicKey, verifyBarcodeSignature } from './barcode-signature';
import { aamvaText, TEXAS_LICENSE } from './test-barcodes';

/**
 * Whether a barcode is encoded as its state encodes it, on fictional cards built here: a Florida license laid out as
 * Florida's 2D barcode calibration sheet shows (its number built from the name and birth date, as Florida did before
 * 2024-07-31), and the Texas license of test-barcodes.ts.
 */

const today = new Date('2026-11-27T12:00:00Z');

/** NICK SAMPLE, born 1990-01-12 (a man): Soundex S514, NICK 620, 90, January 12 = 012. */
const FLORIDA = [
  'DAQS514620900120', 'DCSSAMPLE', 'DDEU', 'DACNICK', 'DDFU', 'DADNONE', 'DDGU', 'DCAE', 'DCBNONE', 'DCDNONE', 'DBD07272022', 'DBB01121990',
  'DBA01122030', 'DBC1', 'DAU070 IN', 'DAG123 MAIN STREET', 'DAITALLAHASSEE', 'DAJFL', 'DAK323010000  ', 'DCFQ931611290000', 'DCGUSA',
  'DCK0110009295000261', 'DDAF', 'DDB05012019',
];
const FLORIDA_OWN = ['ZFA20220727', 'ZFCSAFE DRIVER'];

const florida = (elements = FLORIDA, options: { iin?: string; version?: string; own?: string } = {}) =>
  aamvaText({ iin: options.iin ?? '636010', version: options.version ?? '09', jurisdictionVersion: '00', subfiles: [['DL', elements], [options.own ?? 'ZF', FLORIDA_OWN]] });
const replaced = (elements: string[], changes: Record<string, string | null>) =>
  elements.flatMap((element) => {
    const id = element.slice(0, 3);
    if (!(id in changes)) return [element];
    return changes[id] === null ? [] : [`${id}${changes[id]}`];
  });
const judge = (raw: string, extra: { frontState?: string; inventory?: string } = {}) => {
  const details = parseAamva(raw, today);
  if (!details) throw new Error('not a barcode the parser reads');
  return judgeBarcode({ raw, details, today, ...extra });
};

describe("a barcode's layout", () => {
  it("reads Florida's calibration header: the license subfile at 21 + 10 × 2, the jurisdiction's right after it", () => {
    const raw = florida();
    expect(raw.startsWith('@\n\x1e\rANSI 636010090002DL0041')).toBe(true);
    const layout = readBarcodeLayout(raw)!;
    expect(layout).toMatchObject({ iin: '636010', version: 9, jurisdictionVersion: 0, headerOk: true, layoutOk: true });
    expect(layout.subfiles.map((subfile) => subfile.type)).toEqual(['DL', 'ZF']);
    expect(layout.subfiles[1]!.offset).toBe(layout.subfiles[0]!.offset + layout.subfiles[0]!.length);
    expect(layout.elements.get('DAQ')).toBe('S514620900120');
    expect(layout.own.get('ZFC')).toBe('SAFE DRIVER');
  });

  it('gives staff the class, restrictions, document discriminator, inventory number and versions', () => {
    expect(barcodeExtras(florida())).toEqual({ licenseClass: 'E', documentDiscriminator: 'Q931611290000', inventoryControl: '0110009295000261', aamvaVersion: 9, jurisdictionVersion: 0 });
  });
});

describe('a genuine-looking card', () => {
  it("passes a Florida license whose number matches its holder, with the 1D barcode's inventory number", () => {
    const result = judge(florida(), { frontState: 'FL', inventory: '0110009295000261' });
    expect(result.outcome).toBe('pass');
    expect(result.signals).toEqual(['number_derivation_ok']);
  });

  it('passes the Texas license, its own subfile lettered T', () => {
    const raw = aamvaText({ subfiles: [['DL', TEXAS_LICENSE], ['ZT', ['ZTAEXAMPLE']]] });
    expect(judge(raw, { frontState: 'TX' })).toMatchObject({ outcome: 'pass', signals: [] });
  });

  it('leaves soft signs to our team: a missing required element, a ZIP in the wrong format', () => {
    const raw = aamvaText({ subfiles: [['DL', replaced(TEXAS_LICENSE, { DAY: null, DAK: '7872' })], ['ZT', ['ZTAEXAMPLE']]] });
    const result = judge(raw);
    expect(result.outcome).toBe('unsure');
    expect(result.signals).toEqual(expect.arrayContaining(['required_fields_missing', 'field_format_off']));
  });

  it("forgives Florida's missing eye color (every Florida card leaves it out)", () => {
    expect(judge(florida()).signals).not.toContain('required_fields_missing');
  });
});

describe('a fake', () => {
  it('fails sections that are not where the header says', () => {
    const raw = florida().replace('DL00410', 'DL00430');
    const result = judge(raw);
    expect(result.outcome).toBe('fail');
    expect(result.signals).toContain('subfile_layout_off');
  });

  it("fails an issuer number AAMVA never assigned, or one that doesn't match the card", () => {
    expect(judge(florida(FLORIDA, { iin: '636999' })).signals).toContain('issuer_unknown');
    expect(judge(florida(FLORIDA, { own: 'ZT' }))).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['issuer_mismatch']) });
    expect(judge(florida(), { frontState: 'GA' })).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['issuer_mismatch']) });
  });

  it('fails a version published years after the card was issued', () => {
    const raw = florida(replaced(FLORIDA, { DBD: '07272016', DAQ: 'S514620900120' }), { version: '10' });
    expect(judge(raw)).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['version_too_new']) });
  });

  it("fails a Florida license that doesn't expire on the birthday, unless it's limited-term", () => {
    expect(judge(florida(replaced(FLORIDA, { DBA: '02012030' })))).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['expiry_not_on_birthday']) });
    expect(judge(florida([...replaced(FLORIDA, { DBA: '02012030' }), 'DDD1'])).signals).not.toContain('expiry_not_on_birthday');
  });

  it("fails a Florida number made for another birth date, and one that isn't Florida's format", () => {
    expect(judge(florida(replaced(FLORIDA, { DAQ: 'S514620900130' })))).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['number_derivation_off']) });
    expect(judge(florida(replaced(FLORIDA, { DAQ: '12345678' })))).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['number_format_off']) });
  });

  it("only flags a newer Florida number whose first letter isn't the surname's", () => {
    const newer = replaced(FLORIDA, { DBD: '08152024', DAQ: 'S123456789012' });
    expect(judge(florida(newer)).signals).not.toContain('number_derivation_off');
    expect(judge(florida(replaced(newer, { DAQ: 'P123456789012' })))).toMatchObject({ outcome: 'unsure', signals: expect.arrayContaining(['number_derivation_off']) });
  });

  it("fails a 1D inventory number that differs from the PDF417's", () => {
    expect(judge(florida(), { inventory: '0110009295000999' })).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['inventory_mismatch']) });
  });

  it('fails dates that cannot be: issued after it expires, or in the future', () => {
    // The parser already refuses such a barcode; the judge says why when it's handed one.
    const raw = florida();
    const details = parseAamva(raw, today)!;
    expect(judgeBarcode({ raw, details: { ...details, issueDate: '2031-01-12' }, today }).signals).toContain('dates_inconsistent');
    expect(judgeBarcode({ raw, details: { ...details, issueDate: '2026-12-30' }, today })).toMatchObject({ outcome: 'fail', signals: expect.arrayContaining(['dates_inconsistent']) });
  });
});

describe("a state's barcode signature", () => {
  it('reads the published keys of New York, Virginia and North Carolina', () => {
    for (const { key } of BARCODE_SIGNATURE_KEYS) expect(p256PublicKey(key).asymmetricKeyDetails).toMatchObject({ namedCurve: 'prime256v1' });
  });

  it('decodes and encodes Ascii85', () => {
    const bytes = Buffer.from('signatures, 72 bytes or so');
    expect(decodeAscii85(encodeAscii85(bytes))).toEqual(bytes);
    expect(decodeAscii85('~~~')).toBeNull();
  });

  it("verifies a signature made the cards' way, and tells a changed barcode", () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const point = publicKey.export({ format: 'jwk' });
    const compressed = Buffer.concat([Buffer.from([(Buffer.from(point.y!, 'base64url').at(-1)! & 1) === 0 ? 2 : 3]), Buffer.from(point.x!, 'base64url')]).toString('hex');
    const keys = [{ iin: '636001', element: 'ZNB', key: compressed }];
    const unsigned = aamvaText({ iin: '636001', subfiles: [['DL', TEXAS_LICENSE], ['ZN', ['ZNA1', `ZNB${'0'.repeat(90)}`]]] });
    // Signed over the text with the signature's place full of zeros; 72-byte DER signatures fill the 90 characters exactly.
    let signature = '';
    while (signature.length !== 90) {
      const der = createSign('sha256').update(Buffer.from(unsigned, 'latin1')).sign({ key: privateKey, dsaEncoding: 'der' });
      const padded = Buffer.concat([der, Buffer.alloc(72 - der.length)]);
      signature = encodeAscii85(padded);
    }
    // A function, not a string: Ascii85 can contain "$&" or "$'", which replace() would read as patterns.
    const signed = unsigned.replace('0'.repeat(90), () => signature);
    expect(verifyBarcodeSignature(signed, '636001', keys)).toBe('valid');
    expect(verifyBarcodeSignature(signed.replace('ZNA1', 'ZNA2'), '636001', keys)).toBe('invalid');
    expect(verifyBarcodeSignature(unsigned.replace(`ZNB${'0'.repeat(90)}`, 'ZNC1'), '636001', keys)).toBe('missing');
    expect(verifyBarcodeSignature(signed, '636010', keys)).toBe('unsupported');
  });
});
