'use client';

import Image, { type ImageLoader } from 'next/image';
import { useLocale } from 'next-intl';
import type { CategorySlug } from '@/contracts';
import { localeOrDefault } from '@/contracts/locale';
import {
  servicePhoto,
  servicePhotoBase,
  servicePhotoPlaceholder,
  servicePhotoSize,
  servicePhotoWidthFor,
  type ServicePhotoCrop,
  type ServicePhotoSlot,
} from '@/shared/service-photos';
import { cn } from '@/ui/lib/utils';

/** One loader per crop: each requested width maps to the nearest pre-sized file, so no image optimizer runs. */
const LOADERS: Record<ServicePhotoCrop, ImageLoader> = {
  wide: ({ src, width }) => `${src}-${servicePhotoWidthFor('wide', width)}.webp`,
  landscape: ({ src, width }) => `${src}-${servicePhotoWidthFor('landscape', width)}.webp`,
  square: ({ src, width }) => `${src}-${servicePhotoWidthFor('square', width)}.webp`,
};

/** The box each crop keeps before the photo arrives, so nothing moves when it loads. */
const ASPECT: Record<ServicePhotoCrop, string> = { wide: 'aspect-video', landscape: 'aspect-4/3', square: 'aspect-square' };

export interface ServicePhotoProps {
  category: CategorySlug;
  /** `primary` (landing card, category page) or `alternate` (cost guide). */
  slot?: ServicePhotoSlot;
  crop: ServicePhotoCrop;
  /** How wide the photo shows at each breakpoint, as for `<img sizes>`. */
  sizes: string;
  /** The page's largest image (its LCP): preload it. */
  preload?: boolean;
  /** Text right beside it already names the service: an empty alt, so screen readers don't hear it twice. */
  decorative?: boolean;
  className?: string;
}

/**
 * A real photo of someone doing a category's kind of work (src/shared/service-photos.ts). It never carries a
 * caption: the people in it aren't helpers or clients here. Fills its width at the crop's aspect, with a blurred
 * copy while it loads, a little dimmer in the dark theme.
 */
export function ServicePhoto({ category, slot = 'primary', crop, sizes, preload = false, decorative = false, className }: ServicePhotoProps) {
  const locale = localeOrDefault(useLocale());
  const photo = servicePhoto(category, slot);
  const { width, height } = servicePhotoSize(crop);
  const placeholder = servicePhotoPlaceholder(photo, crop);
  return (
    <Image
      loader={LOADERS[crop]}
      src={servicePhotoBase(photo, crop)}
      alt={decorative ? '' : photo.alt[locale]}
      width={width}
      height={height}
      sizes={sizes}
      preload={preload}
      placeholder={placeholder ? 'blur' : 'empty'}
      blurDataURL={placeholder}
      className={cn('h-auto w-full object-cover dark:brightness-[0.92]', ASPECT[crop], className)}
    />
  );
}
