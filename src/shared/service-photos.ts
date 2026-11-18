import type { CategorySlug } from '@/contracts';
import type { AppLocale } from '@/contracts/locale';
import { SERVICE_PHOTO_PLACEHOLDERS } from './service-photo-placeholders';

/**
 * Real photographs of people doing each category's work (plan 9.12), shown on the landing's service cards, the
 * category pages and the cost guides. Every photo is free for commercial use under the Pexels or Unsplash License,
 * which ask for no model release or attribution. The credits are kept anyway, in each entry and in
 * docs/credits/service-photos.md.
 *
 * Rules for these photos (decisions.md, 2026-11-18):
 * - No caption, quote or alt text may suggest the person is a helper or client of this service, or that the photo
 *   was taken in one of our cities. The alt text says what is in the picture, nothing more.
 * - No visible brand logos.
 * - Only adults do the work, since helpers are adults.
 *
 * Files: public/ui/services/<name>-<crop>-<width>.webp, made by scripts/service-photos.mjs from the originals, which
 * are not kept in the repo.
 */

/** The crops every photo comes in, as width:height. */
export const SERVICE_PHOTO_CROPS = { wide: [16, 9], landscape: [4, 3], square: [1, 1] } as const;
export type ServicePhotoCrop = keyof typeof SERVICE_PHOTO_CROPS;

/** The widths each crop is saved at (ascending). Squares are small on the page, so they stop at 1024. */
export const SERVICE_PHOTO_WIDTHS: Record<ServicePhotoCrop, readonly number[]> = {
  wide: [640, 1024, 1600],
  landscape: [640, 1024, 1600],
  square: [640, 1024],
};

/** Each category has two photos: the primary one (landing card, category page) and an alternate (cost guide). */
export const SERVICE_PHOTO_SLOTS = ['primary', 'alternate'] as const;
export type ServicePhotoSlot = (typeof SERVICE_PHOTO_SLOTS)[number];

export type ServicePhotoLicense = 'Pexels License' | 'Unsplash License';

export interface ServicePhotoCredit {
  photographer: string;
  /** The photographer's page on the source site. */
  profileUrl: string;
  source: 'Pexels' | 'Unsplash';
  /** The photo's own page. */
  sourceUrl: string;
  license: ServicePhotoLicense;
  licenseUrl: string;
  /** When it was downloaded and its license checked (YYYY-MM-DD). */
  retrieved: string;
}

export interface ServicePhoto {
  /** The file name stem: what the photo shows, prefixed by its category. */
  name: string;
  category: CategorySlug;
  slot: ServicePhotoSlot;
  /** What is in the picture, in each language (no product names, places or roles). */
  alt: Record<AppLocale, string>;
  credit: ServicePhotoCredit;
}

const LICENSE_URL: Record<ServicePhotoLicense, string> = {
  'Pexels License': 'https://www.pexels.com/license/',
  'Unsplash License': 'https://unsplash.com/license',
};

function pexels(photographer: string, profile: string, sourceUrl: string): ServicePhotoCredit {
  return {
    photographer,
    profileUrl: `https://www.pexels.com/@${profile}/`,
    source: 'Pexels',
    sourceUrl,
    license: 'Pexels License',
    licenseUrl: LICENSE_URL['Pexels License'],
    retrieved: '2026-11-18',
  };
}

function unsplash(photographer: string, profile: string, sourceUrl: string): ServicePhotoCredit {
  return {
    photographer,
    profileUrl: `https://unsplash.com/@${profile}`,
    source: 'Unsplash',
    sourceUrl,
    license: 'Unsplash License',
    licenseUrl: LICENSE_URL['Unsplash License'],
    retrieved: '2026-11-18',
  };
}

export const SERVICE_PHOTOS: Record<CategorySlug, Record<ServicePhotoSlot, ServicePhoto>> = {
  'furniture-assembly': {
    primary: {
      name: 'furniture-assembly-coffee-table',
      category: 'furniture-assembly',
      slot: 'primary',
      alt: {
        en: 'A man kneels to tighten the frame of a coffee table while a woman sorts the hardware, with moving boxes stacked behind them.',
        es: 'Un hombre de rodillas ajusta la estructura de una mesa de centro mientras una mujer separa los tornillos, con cajas de mudanza apiladas detrás.',
      },
      credit: pexels('cottonbro studio', 'cottonbro', 'https://www.pexels.com/photo/woman-in-white-long-sleeve-shirt-and-black-pants-sitting-on-floor-4554425/'),
    },
    alternate: {
      name: 'furniture-assembly-crib',
      category: 'furniture-assembly',
      slot: 'alternate',
      alt: {
        en: 'A man kneels beside a half-built white crib and reaches into an open toolbox.',
        es: 'Un hombre de rodillas junto a una cuna blanca a medio armar busca algo en una caja de herramientas abierta.',
      },
      credit: pexels('MART PRODUCTION', 'mart-production', 'https://www.pexels.com/photo/a-man-in-a-white-shirt-building-a-crib-7491337/'),
    },
  },
  'moving-help': {
    primary: {
      name: 'moving-help-carrying-boxes',
      category: 'moving-help',
      slot: 'primary',
      alt: {
        en: 'Two men carry cardboard moving boxes across a bright, empty room.',
        es: 'Dos hombres cargan cajas de mudanza de cartón por una sala luminosa y vacía.',
      },
      credit: pexels('RDNE Stock project', 'rdne', 'https://www.pexels.com/photo/men-carrying-boxes-inside-the-house-7464232/'),
    },
    alternate: {
      name: 'moving-help-boxes-out-the-door',
      category: 'moving-help',
      slot: 'alternate',
      alt: {
        en: 'A man and a woman carry cardboard boxes out the front door of a house.',
        es: 'Un hombre y una mujer sacan cajas de cartón por la puerta principal de una casa.',
      },
      credit: pexels('Ketut Subiyanto', 'ketut-subiyanto', 'https://www.pexels.com/photo/couple-carrying-carton-boxes-while-moving-out-of-old-home-4246267/'),
    },
  },
  'yard-cleanup': {
    primary: {
      name: 'yard-cleanup-weeding-garden-bed',
      category: 'yard-cleanup',
      slot: 'primary',
      alt: {
        en: 'A woman in overalls and work gloves pulls weeds from a garden bed beside a house while her dog looks on.',
        es: 'Una mujer con overol y guantes de trabajo arranca la maleza de un arriate junto a una casa mientras su perro la mira.',
      },
      credit: pexels('Greta Hoffman', 'greta-hoffman', 'https://www.pexels.com/photo/female-gardener-with-dog-in-yard-7728042/'),
    },
    alternate: {
      name: 'yard-cleanup-pruning-shrubs',
      category: 'yard-cleanup',
      slot: 'alternate',
      alt: {
        en: 'A man in a sun hat trims a flowering shrub with hand pruners.',
        es: 'Un hombre con sombrero para el sol poda un arbusto con flores usando tijeras de podar.',
      },
      credit: pexels('el jusuf', 'pamanjoe', 'https://www.pexels.com/photo/gardener-pruning-bushes-in-lush-garden-40582860/'),
    },
  },
  'light-cleaning': {
    primary: {
      name: 'light-cleaning-wiping-counter',
      category: 'light-cleaning',
      slot: 'primary',
      alt: {
        en: 'A man sprays and wipes down a kitchen counter.',
        es: 'Un hombre rocía y limpia la encimera de la cocina.',
      },
      credit: pexels('RDNE Stock project', 'rdne', 'https://www.pexels.com/photo/a-man-wiping-a-kitchen-counter-5591854/'),
    },
    alternate: {
      name: 'light-cleaning-caddy-on-stairs',
      category: 'light-cleaning',
      slot: 'alternate',
      alt: {
        en: 'A woman carries a caddy of cleaning supplies and a broom up the stairs of a home.',
        es: 'Una mujer sube las escaleras de una casa con un cesto de productos de limpieza y una escoba.',
      },
      credit: unsplash('Josue Michel', 'josuemichelphotography', 'https://unsplash.com/photos/woman-cleaning-stairs-in-home-FhsFUo-Wfc0'),
    },
  },
  'computer-help': {
    primary: {
      name: 'computer-help-laptop-together',
      category: 'computer-help',
      slot: 'primary',
      alt: {
        en: 'A young woman types on a laptop at a table while explaining each step to an older man beside her.',
        es: 'Una joven escribe en una laptop en una mesa mientras le explica cada paso a un hombre mayor que está a su lado.',
      },
      credit: pexels('Kampus Production', 'kampus', 'https://www.pexels.com/photo/a-man-and-a-woman-using-a-laptop-together-7551644/'),
    },
    alternate: {
      name: 'computer-help-laptop-walkthrough',
      category: 'computer-help',
      slot: 'alternate',
      alt: {
        en: 'A young man points to notes next to a laptop while an older man follows along.',
        es: 'Un joven señala unas notas junto a una laptop mientras un hombre mayor sigue la explicación.',
      },
      credit: pexels('Kampus Production', 'kampus', 'https://www.pexels.com/photo/men-having-conversation-7551628/'),
    },
  },
};

/** A category's photo (the primary one unless asked for the alternate). */
export function servicePhoto(category: CategorySlug, slot: ServicePhotoSlot = 'primary'): ServicePhoto {
  return SERVICE_PHOTOS[category][slot];
}

/** Every photo, in category order. */
export function allServicePhotos(): ServicePhoto[] {
  return Object.values(SERVICE_PHOTOS).flatMap((slots) => SERVICE_PHOTO_SLOTS.map((slot) => slots[slot]));
}

/** The path every size of one crop shares: `/ui/services/<name>-<crop>`; a file adds `-<width>.webp`. */
export function servicePhotoBase(photo: ServicePhoto, crop: ServicePhotoCrop): string {
  return `/ui/services/${photo.name}-${crop}`;
}

/**
 * The saved width to serve for a requested width: the smallest that is at least 90% of it (a little under is
 * sharp enough), else the largest there is.
 */
export function servicePhotoWidthFor(crop: ServicePhotoCrop, requested: number): number {
  const widths = SERVICE_PHOTO_WIDTHS[crop];
  return widths.find((width) => width >= requested * 0.9) ?? widths[widths.length - 1];
}

/** The file for one crop at a saved width (or the nearest saved one). */
export function servicePhotoSrc(photo: ServicePhoto, crop: ServicePhotoCrop, width: number): string {
  return `${servicePhotoBase(photo, crop)}-${servicePhotoWidthFor(crop, width)}.webp`;
}

/** The intrinsic size of a crop's largest file, for width and height attributes (the aspect box). */
export function servicePhotoSize(crop: ServicePhotoCrop): { width: number; height: number } {
  const [w, h] = SERVICE_PHOTO_CROPS[crop];
  const widths = SERVICE_PHOTO_WIDTHS[crop];
  const width = widths[widths.length - 1];
  return { width, height: Math.round((width * h) / w) };
}

/** A tiny blurred copy of the crop, shown while the photo loads. */
export function servicePhotoPlaceholder(photo: ServicePhoto, crop: ServicePhotoCrop): string | undefined {
  return SERVICE_PHOTO_PLACEHOLDERS[photo.name]?.[crop];
}
