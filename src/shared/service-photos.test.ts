import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS } from '@/contracts';
import { APP_LOCALES } from '@/contracts/locale';
import {
  allServicePhotos,
  SERVICE_PHOTO_CROPS,
  SERVICE_PHOTO_SLOTS,
  SERVICE_PHOTO_WIDTHS,
  SERVICE_PHOTOS,
  servicePhoto,
  servicePhotoBase,
  servicePhotoPlaceholder,
  servicePhotoSize,
  servicePhotoSrc,
  servicePhotoWidthFor,
  type ServicePhotoCrop,
} from './service-photos';

const PUBLIC = join(process.cwd(), 'public');
const CROPS = Object.keys(SERVICE_PHOTO_CROPS) as ServicePhotoCrop[];

/** A WebP file's format and size, read from its header (lossy `VP8 `, lossless `VP8L` or extended `VP8X`). */
function webpInfo(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  return null;
}

/** Every file a photo should have: [crop, width, public path]. */
function filesOf(photo: ReturnType<typeof servicePhoto>) {
  return CROPS.flatMap((crop) => SERVICE_PHOTO_WIDTHS[crop].map((width) => ({ crop, width, path: servicePhotoSrc(photo, crop, width) })));
}

describe('service photos', () => {
  it('gives every category a primary and an alternate photo, each named for its category', () => {
    for (const category of CATEGORY_SLUGS) {
      for (const slot of SERVICE_PHOTO_SLOTS) {
        const photo = servicePhoto(category, slot);
        expect(photo.category).toBe(category);
        expect(photo.slot).toBe(slot);
        expect(photo.name).toMatch(new RegExp(`^${category}-[a-z0-9]+(-[a-z0-9]+)*$`));
      }
    }
    expect(Object.keys(SERVICE_PHOTOS).sort()).toEqual([...CATEGORY_SLUGS].sort());
    const names = allServicePhotos().map((photo) => photo.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('describes each photo in every language, without naming us, a role or a city', () => {
    for (const photo of allServicePhotos()) {
      for (const locale of APP_LOCALES) {
        const alt = photo.alt[locale];
        expect(alt.length, `${photo.name} ${locale}`).toBeGreaterThan(20);
        expect(alt.length, `${photo.name} ${locale}`).toBeLessThan(160);
        expect(alt, `${photo.name} ${locale}`).toMatch(/\.$/);
        // No implied endorsement: the people aren't helpers or clients here, and weren't photographed in our cities.
        expect(alt, `${photo.name} ${locale}`).not.toMatch(/tasks ?near ?me|helper|ayudante|client|cliente|tasker|gainesville|austin|florida|texas|\bour\b|nuestr/i);
      }
      expect(photo.alt.es, photo.name).not.toBe(photo.alt.en);
    }
  });

  it('keeps a credit for each photo under a license that allows commercial use', () => {
    for (const { name, credit } of allServicePhotos()) {
      expect(credit.photographer.trim(), name).not.toBe('');
      expect(credit.retrieved, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (credit.source === 'Pexels') {
        expect(credit.license, name).toBe('Pexels License');
        expect(credit.sourceUrl, name).toMatch(/^https:\/\/www\.pexels\.com\/photo\/[a-z0-9-]+-\d+\/$/);
        expect(credit.profileUrl, name).toMatch(/^https:\/\/www\.pexels\.com\/@[a-z0-9-]+\/$/);
        expect(credit.licenseUrl, name).toBe('https://www.pexels.com/license/');
      } else {
        expect(credit.license, name).toBe('Unsplash License');
        expect(credit.sourceUrl, name).toMatch(/^https:\/\/unsplash\.com\/photos\/[A-Za-z0-9_-]+$/);
        expect(credit.profileUrl, name).toMatch(/^https:\/\/unsplash\.com\/@[A-Za-z0-9_-]+$/);
        expect(credit.licenseUrl, name).toBe('https://unsplash.com/license');
      }
    }
  });

  it('has every crop at every width on disk, at its exact size and within the weight budget', () => {
    for (const photo of allServicePhotos()) {
      for (const { crop, width, path } of filesOf(photo)) {
        const bytes = readFileSync(join(PUBLIC, path));
        const [w, h] = SERVICE_PHOTO_CROPS[crop];
        expect(webpInfo(bytes), path).toEqual({ width, height: Math.round((width * h) / w) });
        // ~150 kB at 1024 wide (the coordinator's budget), and nothing heavier than 300 kB.
        expect(bytes.length, path).toBeLessThanOrEqual(width <= 1024 ? 150 * 1024 : 300 * 1024);
      }
    }
  });

  it('keeps no photo files that nothing uses', () => {
    const expected = new Set(allServicePhotos().flatMap((photo) => filesOf(photo).map(({ path }) => path.replace('/ui/services/', ''))));
    const onDisk = readdirSync(join(PUBLIC, 'ui/services'));
    expect(onDisk.filter((file) => !expected.has(file))).toEqual([]);
  });

  it('has a tiny blurred placeholder for every crop', () => {
    for (const photo of allServicePhotos()) {
      for (const crop of CROPS) {
        const placeholder = servicePhotoPlaceholder(photo, crop);
        expect(placeholder, `${photo.name} ${crop}`).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
        expect(placeholder!.length, `${photo.name} ${crop}`).toBeLessThan(600);
      }
    }
  });

  it('serves the smallest saved width that is sharp enough, and the largest past the end', () => {
    expect(servicePhotoWidthFor('wide', 32)).toBe(640);
    expect(servicePhotoWidthFor('wide', 640)).toBe(640);
    expect(servicePhotoWidthFor('wide', 700)).toBe(640);
    expect(servicePhotoWidthFor('wide', 750)).toBe(1024);
    expect(servicePhotoWidthFor('wide', 1080)).toBe(1024);
    expect(servicePhotoWidthFor('wide', 1200)).toBe(1600);
    expect(servicePhotoWidthFor('wide', 3840)).toBe(1600);
    expect(servicePhotoWidthFor('square', 1920)).toBe(1024);
  });

  it('names the files and sizes the next/image attributes from the crop', () => {
    const photo = servicePhoto('moving-help');
    expect(servicePhotoBase(photo, 'wide')).toBe('/ui/services/moving-help-carrying-boxes-wide');
    expect(servicePhotoSrc(photo, 'landscape', 1024)).toBe('/ui/services/moving-help-carrying-boxes-landscape-1024.webp');
    expect(servicePhotoSize('wide')).toEqual({ width: 1600, height: 900 });
    expect(servicePhotoSize('landscape')).toEqual({ width: 1600, height: 1200 });
    expect(servicePhotoSize('square')).toEqual({ width: 1024, height: 1024 });
  });
});
