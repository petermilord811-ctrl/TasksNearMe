import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

/**
 * Test support (imported only by tests): fictional AAMVA barcodes, drawn with zxing-wasm's writer (zint) and rendered on
 * the back of a card, then photographed the way people do: tilted, soft, small, compressed, stored as the capture
 * stores it (at most 2,000 px, WebP). The writer's binary is read from node_modules, like the reader's.
 */

let writerReady = false;
function writer(): typeof writeBarcode {
  if (!writerReady) {
    const wasm = createRequire(import.meta.url).resolve('zxing-wasm/writer/zxing_writer.wasm');
    const binary = readFileSync(wasm);
    const wasmBinary = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
    prepareZXingModule({ overrides: { wasmBinary, locateFile: () => wasm } });
    writerReady = true;
  }
  return writeBarcode;
}

export interface AamvaPayload {
  iin?: string;
  /** "01" for the 2000 standard (no jurisdiction version in the header) … "10" for 2020. */
  version?: string;
  jurisdictionVersion?: string;
  /** Each subfile's type and data elements ("DAQ12345678", …), in order. */
  subfiles: Array<[string, string[]]>;
}

/** A fictional 2020 (version 10) Texas license's elements, as the standard lists them: ALEX RIVER SAMPLE, born 1990-04-02. */
export const TEXAS_LICENSE = [
  'DCAC', 'DCBNONE', 'DCDNONE', 'DBA04022030', 'DCSSAMPLE', 'DACALEX', 'DADRIVER', 'DBD04022022', 'DBB04021990', 'DBC2', 'DAYBRO', 'DAU065 IN',
  'DAG1234 EXAMPLE LANE', 'DAHAPT 2', 'DAIAUSTIN', 'DAJTX', 'DAK787230000  ', 'DAQ12345678', 'DCF12345678901234567890', 'DCGUSA', 'DDEN', 'DDFN', 'DDGN',
  'DAZBRO', 'DCK12345678901234', 'DDB04012016', 'DAW150', 'DDK1',
];

/** An AAMVA barcode's text: the header with each subfile's designator (offset and length right), then the subfiles. */
export function aamvaText({ iin = '636015', version = '10', jurisdictionVersion = '01', subfiles }: AamvaPayload): string {
  const bodies = subfiles.map(([type, elements]) => `${type}${elements.join('\n')}\r`);
  const old = Number(version) <= 1;
  let offset = '@\n\x1e\rANSI '.length + 6 + 2 + (old ? 0 : 2) + 2 + 10 * subfiles.length;
  const designators = subfiles.map(([type], index) => {
    const designator = `${type}${String(offset).padStart(4, '0')}${String(bodies[index]!.length).padStart(4, '0')}`;
    offset += bodies[index]!.length;
    return designator;
  });
  return `@\n\x1e\rANSI ${iin}${version}${old ? '' : jurisdictionVersion}${String(subfiles.length).padStart(2, '0')}${designators.join('')}${bodies.join('')}`;
}

/** The PDF417 symbol, each module `module` px wide (rows 3 modules tall), black on white. */
export async function pdf417(text: string, { columns = 13, module = 5 }: { columns?: number; module?: number } = {}): Promise<{ png: Buffer; width: number; height: number }> {
  const written = await writer()(Buffer.from(text, 'latin1'), { format: 'PDF417', scale: 1, options: `columns=${columns},ecLevel=5` });
  if (written.error) throw new Error(written.error);
  const { width, height, data } = written.symbol;
  const png = await sharp(Buffer.from(data), { raw: { width, height, channels: 1 } })
    .resize({ width: width * module, height: height * module, kernel: 'nearest' })
    .png()
    .toBuffer();
  return { png, width: width * module, height: height * module };
}

const CARD = { width: 1700, height: 1070 };

/** The back of a card (no text, so no fonts needed): tinted, fine lines, a dark band, the barcode across most of it. */
export async function cardBack(barcode: { png: Buffer; width: number; height: number } | null): Promise<Buffer> {
  const lines = Array.from({ length: 36 }, (_, i) => `<path d="M0 ${30 + i * 28} C 500 ${i * 28 - 50}, 1200 ${i * 28 + 70}, 1700 ${20 + i * 28}" stroke="#c4d2e4" stroke-width="2" fill="none"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3ecf6"/><stop offset="1" stop-color="#f5ead6"/></linearGradient></defs><rect width="${CARD.width}" height="${CARD.height}" rx="44" fill="url(#g)"/>${lines}<rect x="70" y="90" width="900" height="36" fill="#7b8794"/><rect x="70" y="150" width="620" height="28" fill="#9aa5b1"/><rect x="70" y="${CARD.height - 130}" width="640" height="64" fill="#222"/></svg>`;
  const card = sharp(Buffer.from(svg));
  if (!barcode) return card.png().toBuffer();
  const left = Math.round((CARD.width - barcode.width) / 2);
  const top = Math.round(250 + (560 - barcode.height) / 2);
  const quiet = await sharp({ create: { width: barcode.width + 60, height: barcode.height + 40, channels: 3, background: '#ffffff' } }).png().toBuffer();
  return card.composite([{ input: quiet, left: left - 30, top: top - 20 }, { input: barcode.png, left, top }]).png().toBuffer();
}

export interface Shot {
  /** Degrees, clockwise. */
  angle?: number;
  /** Gaussian blur (sigma, px) after scaling. */
  blur?: number;
  /** JPEG quality of the phone's photo. */
  quality?: number;
  /** The card's size in the photo, against 1 for about 2,000 px across. */
  scale?: number;
  /** A shadow across it, 0 to 1. */
  shadow?: number;
}

/** A phone photo of the card on a table, stored as the capture stores it (at most 2,000 px, WebP 85). */
export async function photograph(card: Buffer, { angle = 0, blur = 0, quality = 75, scale = 1, shadow = 0 }: Shot = {}): Promise<Buffer> {
  const table = '#6b5a48';
  let image = await sharp(card).extend({ top: 120, bottom: 120, left: 160, right: 160, background: table }).png().toBuffer();
  if (angle) image = await sharp(image).rotate(angle, { background: table }).png().toBuffer();
  const { width, height } = await sharp(image).metadata();
  if (shadow) {
    const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity="${shadow}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#s)"/></svg>`;
    image = await sharp(image).composite([{ input: Buffer.from(shade) }]).png().toBuffer();
  }
  let shot = sharp(image);
  if (scale !== 1) shot = shot.resize({ width: Math.round(width * scale) });
  if (blur) shot = shot.blur(blur);
  const jpeg = await shot.jpeg({ quality }).toBuffer();
  return sharp(jpeg).resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}
