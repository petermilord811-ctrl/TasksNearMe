import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/** A checked location pin, reduced to a square silhouette for small app icons. */
export function BrandMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 32 32" className={cn('size-9 shrink-0', className)} aria-hidden="true" focusable="false">
    <path d="M16 1C8.3 1 3 6.5 3 13.6 3 21.9 16 31 16 31s13-9.1 13-17.4C29 6.5 23.7 1 16 1Z" className="fill-primary" />
    <path d="m9 13 5 5 9-10" fill="none" className="stroke-primary-foreground" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function Logo({ variant = 'full' }: { variant?: 'full' | 'mark' }) {
  const t = useTranslations('shell');
  return (
    <Link href={routes.home()} aria-label={t('homeLink')} className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-md">
      <BrandMark />
      {variant === 'full' && <span aria-hidden="true" className="font-sans text-xl font-bold tracking-[-0.055em] text-foreground">{t('brand')}</span>}
    </Link>
  );
}
