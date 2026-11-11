import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';

export interface InitialsAvatarProps {
  initials: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-xl',
} as const;

export function InitialsAvatar({ initials, size = 'md' }: InitialsAvatarProps) {
  const t = useTranslations('verification');

  return (
    <span role="img" aria-label={t('avatar', { initials })} className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground', sizes[size])}>
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}
