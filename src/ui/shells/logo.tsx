import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';

export function Logo({ variant = 'full' }: { variant?: 'full' | 'mark' }) {
  const t = useTranslations('shell');
  return (
    <Link href={routes.home()} aria-label={t('homeLink')} className="inline-flex min-h-11 min-w-11 shrink-0 items-center rounded-md">
      <svg viewBox={variant === 'mark' ? '0 0 36 40' : '0 0 190 40'} className={variant === 'mark' ? 'h-10 w-9' : 'h-10 w-44'} aria-hidden="true" focusable="false">
        <path d="M18 3C10.3 3 5 8.8 5 16c0 9 13 21 13 21s13-12 13-21C31 8.8 25.7 3 18 3Z" className="fill-primary" />
        <path d="m12 16 4 4 8-9" fill="none" className="stroke-primary-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {variant === 'full' && <text x="40" y="25" className="fill-foreground font-heading text-[19px] font-bold" letterSpacing="-.7">{t('brand')}</text>}
      </svg>
    </Link>
  );
}
