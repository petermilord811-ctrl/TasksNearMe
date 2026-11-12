import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { Photo } from '@/contracts';
import { cn } from '@/ui/lib/utils';

export interface InitialsAvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** The person's profile photo, when they added one: shown instead of the initials. */
  photo?: Photo;
}

const sizes = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-xl',
  xl: 'size-24 text-3xl',
} as const;

const pixels = { sm: 32, md: 44, lg: 64, xl: 96 } as const;

/** A person's round avatar: their profile photo, or their initials. */
export function InitialsAvatar({ initials, size = 'md', photo }: InitialsAvatarProps) {
  const t = useTranslations('verification');

  if (photo) {
    return (
      <Image
        src={photo.src}
        alt={photo.alt ? t('photo', { name: photo.alt }) : t('avatar', { initials })}
        width={pixels[size]}
        height={pixels[size]}
        unoptimized
        className={cn('shrink-0 rounded-full bg-secondary object-cover', sizes[size])}
      />
    );
  }

  return (
    <span role="img" aria-label={t('avatar', { initials })} className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground', sizes[size])}>
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}
