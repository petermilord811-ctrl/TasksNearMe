import { createPublicKey, ECDH, verify, type KeyObject } from 'node:crypto';

/**
 * The ECDSA signature some states' card maker (Canadian Bank Note) puts in the barcode's own subfile: New York (`ZNB`),
 * Virginia (`ZVA`) and North Carolina (`ZND`). The value is 90 characters of Ascii85, the DER encoding of an ECDSA
 * P-256 signature over the whole barcode text with that value replaced by 90 "0"s (SHA-256). The public keys aren't
 * published by the states: they were recovered from cards (R. Gerber, "Keys not included", ryan.science, 2025; also in
 * Syfaro/aamva-rs). A valid signature is strong evidence the barcode is the state's; an invalid one goes to our team,
 * never rejected on its own. Florida's and Texas's cards (IDEMIA) carry none.
 */

interface KnownKey {
  iin: string;
  element: string;
  /** Compressed SEC1 point, hex. */
  key: string;
}

const KNOWN_KEYS: readonly KnownKey[] = [
  { iin: '636000', element: 'ZVA', key: '02d0f2823d63c854566c5da2cb07e114dbad16f874c2422f74806fe3e2f4775f1d' },
  { iin: '636001', element: 'ZNB', key: '02851d63a281796be0ca11189f03028abf80e032838f83215889b9e708eac16482' },
  { iin: '636004', element: 'ZND', key: '0398956191b3fd2704362fdd8500dc0d4419c9379c5187cefd223dd4ee566da9e8' },
];

export type BarcodeSignatureStatus = 'valid' | 'invalid' | 'missing' | 'malformed' | 'unsupported';

/** Ascii85 (btoa style: "!" to "u", "z" for four zero bytes), or null when it isn't. */
export function decodeAscii85(input: string): Buffer | null {
  const output: number[] = [];
  const group: number[] = [];
  const push = (digits: number[], length: number) => {
    let value = 0;
    for (const digit of digits) value = value * 85 + digit;
    if (value > 0xffffffff) return false;
    const bytes = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    output.push(...bytes.slice(0, length));
    return true;
  };
  for (const char of input) {
    if (/\s/.test(char)) continue;
    const code = char.charCodeAt(0);
    if (char === 'z' && group.length === 0) {
      output.push(0, 0, 0, 0);
      continue;
    }
    if (code < 33 || code > 117) return null;
    group.push(code - 33);
    if (group.length === 5) {
      if (!push(group, 4)) return null;
      group.length = 0;
    }
  }
  if (group.length === 1) return null;
  if (group.length > 1) {
    const length = group.length - 1;
    while (group.length < 5) group.push(84);
    if (!push(group, length)) return null;
  }
  return Buffer.from(output);
}

/** Ascii85 of bytes (for tests and for building a signed sample). */
export function encodeAscii85(bytes: Buffer): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, i + 4);
    const padded = Buffer.concat([chunk, Buffer.alloc(4 - chunk.length)]);
    let value = padded.readUInt32BE(0);
    const digits: string[] = [];
    for (let k = 0; k < 5; k++) {
      digits.unshift(String.fromCharCode((value % 85) + 33));
      value = Math.floor(value / 85);
    }
    out += digits.join('').slice(0, chunk.length + 1);
  }
  return out;
}

/** A compressed P-256 key as a public key object. */
export function p256PublicKey(compressedHex: string): KeyObject {
  const uncompressed = Buffer.from(ECDH.convertKey(compressedHex, 'prime256v1', 'hex', 'hex', 'uncompressed') as string, 'hex');
  const x = uncompressed.subarray(1, 33).toString('base64url');
  const y = uncompressed.subarray(33, 65).toString('base64url');
  return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' });
}

/** The element's 90-character value in the barcode text, and where it starts; null when there's none. */
function signatureValue(raw: string, element: string): { value: string; at: number } | null {
  const pattern = new RegExp(`(?:^|[\\n\\r\\x1e])${element}([\\x21-\\x75z]{90})`);
  const match = pattern.exec(raw);
  if (!match) return null;
  return { value: match[1]!, at: match.index + match[0].length - 90 };
}

/** Whether the barcode carries its state's signature, and whether it verifies. `keys`: tests pass their own. */
export function verifyBarcodeSignature(raw: string, iin: string, keys: readonly KnownKey[] = KNOWN_KEYS): BarcodeSignatureStatus {
  const known = keys.find((entry) => entry.iin === iin);
  if (!known) return 'unsupported';
  if (!raw.includes(known.element)) return 'missing';
  const found = signatureValue(raw, known.element);
  if (!found) return 'malformed';
  const decoded = decodeAscii85(found.value);
  // 90 characters always decode to 72 bytes; the DER signature (a SEQUENCE) may be shorter, padded after it.
  if (!decoded || decoded[0] !== 0x30 || decoded[1]! + 2 > decoded.length) return 'malformed';
  const der = decoded.subarray(0, decoded[1]! + 2);
  const signed = Buffer.from(`${raw.slice(0, found.at)}${'0'.repeat(90)}${raw.slice(found.at + 90)}`, 'latin1');
  try {
    return verify('sha256', signed, { key: p256PublicKey(known.key), dsaEncoding: 'der' }, der) ? 'valid' : 'invalid';
  } catch {
    return 'malformed';
  }
}

export const BARCODE_SIGNATURE_KEYS = KNOWN_KEYS;
