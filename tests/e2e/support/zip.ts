import { inflateRawSync } from 'node:zlib';

/** The entries of a downloaded zip (the data copy, src/modules/privacy/zip.ts): name → contents. */
export function zipEntries(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let at = 0;
  while (at + 30 <= zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    const method = zip.readUInt16LE(at + 8);
    const size = zip.readUInt32LE(at + 18);
    const nameLength = zip.readUInt16LE(at + 26);
    const start = at + 30 + nameLength + zip.readUInt16LE(at + 28);
    const data = zip.subarray(start, start + size);
    out.set(zip.subarray(at + 30, at + 30 + nameLength).toString('utf8'), method === 8 ? inflateRawSync(data) : Buffer.from(data));
    at = start + size;
  }
  return out;
}
