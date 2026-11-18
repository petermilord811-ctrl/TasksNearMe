#!/usr/bin/env node
/**
 * Builds the service photos (public/ui/services/<name>-<crop>-<width>.webp) and their blur placeholders
 * (src/shared/service-photo-placeholders.ts) from the downloaded originals. Which category shows which photo, the
 * alt text in both languages and the credits live in src/shared/service-photos.ts; the credits for people are in
 * docs/credits/service-photos.md.
 *
 *   node scripts/service-photos.mjs --sources <dir>               every photo below, from <dir>/<name>/image.jpg
 *   node scripts/service-photos.mjs --sources <dir> --only a,b    some of them
 *   node scripts/service-photos.mjs --sources <dir> --out <dir> --sheet <file.jpg>
 *                                                                 somewhere else, plus a contact sheet of the crops
 *
 * The originals are the free downloads named in each `download` below, at 3200 px wide (Pexels:
 * `?auto=compress&cs=tinysrgb&w=3200`, Unsplash: `?fm=jpg&q=95&w=3200`), each in its own folder. They are not
 * kept in the repo. Every crop is the largest frame of its aspect that fits, scaled by `zoom`, centered on the
 * photo's focus (x, y as fractions of the width and height) and kept inside the picture. Metadata is dropped.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

/** Keep in step with SERVICE_PHOTO_CROPS and SERVICE_PHOTO_WIDTHS in src/shared/service-photos.ts (its test checks the files). */
const CROPS = { wide: [16, 9], landscape: [4, 3], square: [1, 1] };
const WIDTHS = { wide: [640, 1024, 1600], landscape: [640, 1024, 1600], square: [640, 1024] };
/** WebP quality per output width: the small sizes can afford a little more. */
const QUALITY = (width) => (width <= 640 ? 74 : width <= 1024 ? 70 : 66);

/** [x, y, zoom]: the focus as fractions of the original, and the crop's size as a fraction of the largest that fits. */
const PHOTOS = [
  {
    name: 'furniture-assembly-coffee-table',
    download: 'https://images.pexels.com/photos/4554425/pexels-photo-4554425.jpeg',
    focus: { wide: [0.5, 0.56, 1], landscape: [0.5, 0.5, 1], square: [0.56, 0.58, 0.92] },
  },
  {
    name: 'furniture-assembly-crib',
    download: 'https://images.pexels.com/photos/7491337/pexels-photo-7491337.jpeg',
    focus: { wide: [0.56, 0.58, 0.9], landscape: [0.55, 0.55, 0.9], square: [0.48, 0.6, 0.9] },
  },
  {
    name: 'moving-help-carrying-boxes',
    download: 'https://images.pexels.com/photos/7464232/pexels-photo-7464232.jpeg',
    focus: { wide: [0.64, 0.55, 0.85], landscape: [0.63, 0.52, 0.9], square: [0.66, 0.55, 0.95] },
  },
  {
    name: 'moving-help-boxes-out-the-door',
    download: 'https://images.pexels.com/photos/4246267/pexels-photo-4246267.jpeg',
    focus: { wide: [0.68, 0.58, 0.85], landscape: [0.66, 0.55, 0.92], square: [0.62, 0.6, 1] },
  },
  {
    name: 'yard-cleanup-weeding-garden-bed',
    download: 'https://images.pexels.com/photos/7728042/pexels-photo-7728042.jpeg',
    focus: { wide: [0.55, 0.41, 1], landscape: [0.55, 0.44, 1], square: [0.6, 0.5, 1] },
  },
  {
    name: 'yard-cleanup-pruning-shrubs',
    download: 'https://images.pexels.com/photos/40582860/pexels-photo-40582860.jpeg',
    focus: { wide: [0.5, 0.42, 1], landscape: [0.5, 0.45, 1], square: [0.5, 0.45, 1] },
  },
  {
    name: 'light-cleaning-wiping-counter',
    download: 'https://images.pexels.com/photos/5591854/pexels-photo-5591854.jpeg',
    focus: { wide: [0.5, 0.47, 1], landscape: [0.45, 0.5, 1], square: [0.4, 0.5, 1] },
  },
  {
    name: 'light-cleaning-caddy-on-stairs',
    download: 'https://images.unsplash.com/photo-1646980241033-cd7abda2ee88',
    focus: { wide: [0.5, 0.5, 1], landscape: [0.45, 0.5, 1], square: [0.42, 0.55, 1] },
  },
  {
    name: 'computer-help-laptop-together',
    download: 'https://images.pexels.com/photos/7551644/pexels-photo-7551644.jpeg',
    focus: { wide: [0.45, 0.6, 1], landscape: [0.45, 0.55, 1], square: [0.38, 0.6, 1] },
  },
  {
    name: 'computer-help-laptop-walkthrough',
    download: 'https://images.pexels.com/photos/7551628/pexels-photo-7551628.jpeg',
    focus: { wide: [0.6, 0.6, 1], landscape: [0.6, 0.55, 1], square: [0.65, 0.6, 1] },
  },
];

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const sources = option('sources');
if (!sources) {
  console.error('Usage: node scripts/service-photos.mjs --sources <dir> [--only a,b] [--out <dir>] [--sheet <file.jpg>]');
  process.exit(1);
}
const out = resolve(option('out', 'public/ui/services'));
const sheet = option('sheet');
const only = option('only').split(',').map((name) => name.trim()).filter(Boolean);
const unknown = only.filter((name) => !PHOTOS.some((photo) => photo.name === name));
if (unknown.length > 0) {
  console.error(`Unknown photo: ${unknown.join(', ')}`);
  process.exit(1);
}
const chosen = only.length > 0 ? PHOTOS.filter((photo) => only.includes(photo.name)) : PHOTOS;
const writePlaceholders = only.length === 0 && option('out') === '';

/** The crop rectangle (whole pixels) for one aspect. */
function frame(width, height, [aw, ah], [x, y, zoom]) {
  const fit = Math.min(width / aw, height / ah);
  const w = Math.round(aw * fit * zoom);
  const h = Math.round(ah * fit * zoom);
  const left = Math.min(Math.max(Math.round(x * width - w / 2), 0), width - w);
  const top = Math.min(Math.max(Math.round(y * height - h / 2), 0), height - h);
  return { left, top, width: w, height: h };
}

mkdirSync(out, { recursive: true });
const placeholders = {};
const tiles = [];
let total = 0;
for (const photo of chosen) {
  const original = join(resolve(sources), photo.name, 'image.jpg');
  const { width, height } = await sharp(original).metadata();
  placeholders[photo.name] = {};
  for (const [crop, aspect] of Object.entries(CROPS)) {
    const box = frame(width, height, aspect, photo.focus[crop]);
    const largest = WIDTHS[crop].at(-1);
    if (box.width < largest) throw new Error(`${photo.name} ${crop}: the crop is ${box.width} px wide, less than ${largest}`);
    for (const target of WIDTHS[crop]) {
      const file = join(out, `${photo.name}-${crop}-${target}.webp`);
      const info = await sharp(original)
        .extract(box)
        .resize({ width: target, height: Math.round((target * aspect[1]) / aspect[0]) })
        .webp({ quality: QUALITY(target), effort: 6, smartSubsample: true })
        .toFile(file);
      total += info.size;
      console.log(`${photo.name}-${crop}-${target}.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} kB`);
      if (sheet && target === 640) tiles.push(file);
    }
    const tiny = await sharp(original)
      .extract(box)
      .resize({ width: 12, height: Math.max(1, Math.round((12 * aspect[1]) / aspect[0])) })
      .webp({ quality: 40 })
      .toBuffer();
    placeholders[photo.name][crop] = `data:image/webp;base64,${tiny.toString('base64')}`;
  }
}
console.log(`${chosen.length} photos, ${(total / 1024 / 1024).toFixed(1)} MB in ${out}`);

if (writePlaceholders) {
  const lines = Object.entries(placeholders).map(
    ([name, crops]) => `  '${name}': {\n${Object.entries(crops).map(([crop, url]) => `    ${crop}: '${url}',`).join('\n')}\n  },`,
  );
  const file = resolve('src/shared/service-photo-placeholders.ts');
  writeFileSync(
    file,
    `// Generated by scripts/service-photos.mjs: don't edit. Tiny blurred copies of each crop, shown while a photo loads.\n` +
      `export const SERVICE_PHOTO_PLACEHOLDERS: Record<string, Record<'wide' | 'landscape' | 'square', string>> = {\n${lines.join('\n')}\n};\n`,
  );
  console.log(`placeholders: ${file}`);
}

if (sheet) {
  const cell = 420;
  const rows = [];
  for (const file of tiles) {
    const image = await sharp(file).resize({ width: cell, height: cell, fit: 'contain', background: '#202020' }).toBuffer();
    rows.push(image);
  }
  const columns = 3;
  await sharp({ create: { width: columns * (cell + 6), height: Math.ceil(rows.length / columns) * (cell + 6), channels: 3, background: '#ffffff' } })
    .composite(rows.map((input, index) => ({ input, left: (index % columns) * (cell + 6), top: Math.floor(index / columns) * (cell + 6) })))
    .jpeg({ quality: 80 })
    .toFile(resolve(sheet));
  console.log(`sheet: ${resolve(sheet)}`);
}
