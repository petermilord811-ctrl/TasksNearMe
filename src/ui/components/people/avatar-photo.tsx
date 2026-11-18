'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A profile photo that gives way to its initials when the image can't be loaded (plan 9.3): a file that's gone
 * from storage, a photo removed in another tab, a network error. Without this, a missing file left an empty circle
 * in the header, on the account page and on every card. The fallback is the same initials avatar people see before
 * they add a photo.
 */
export function AvatarPhoto({ src, alt, size, className, fallback }: { src: string; alt: string; size: number; className?: string; fallback: ReactNode }) {
  const image = useRef<HTMLImageElement>(null);
  // The address that failed, so a new photo (another src) is tried again.
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    // An image that failed before the page hydrated fired its error before React listened for it.
    const element = image.current;
    if (element && element.complete && element.naturalWidth === 0) setFailed(src);
  }, [src]);

  if (failed === src) return fallback;
  return <Image ref={image} src={src} alt={alt} width={size} height={size} unoptimized onError={() => setFailed(src)} className={className} />;
}
