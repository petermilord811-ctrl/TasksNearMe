import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/**
 * The tasksnearme mark: a location pin holding a check (a task done nearby) with a soft "near" ripple, on
 * an iridescent tile. The tile is CSS (no SVG gradient ids to collide when several logos share a page).
 * `animated` draws it in once: the tile blooms, the pin rises in, the check draws, the ripple spreads.
 */
export function BrandMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-grid size-9 shrink-0 place-items-center overflow-hidden rounded-[30%] shadow-[0_6px_16px_-6px_var(--primary-glow)]', animated && 'bloom-in', className)}
      style={{ backgroundImage: 'var(--iridescent)', ['--bloom-origin' as string]: '50% 50%' }}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_10%,rgb(255_255_255/0.45),transparent_55%)]" />
      <svg viewBox="0 0 32 32" className="relative size-[78%]" focusable="false">
        <ellipse
          cx="16"
          cy="26.6"
          rx="6.4"
          ry="1.9"
          fill="none"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="1.3"
          className={cn(animated && '[animation:pulse-ring_1.6s_var(--ease-out)_0.9s_both]')}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
        <path
          d="M16 26.2s-7.4-6.9-7.4-12.7A7.4 7.4 0 0 1 16 6.1a7.4 7.4 0 0 1 7.4 7.4c0 5.8-7.4 12.7-7.4 12.7Z"
          fill="white"
          className={cn(animated && 'enter')}
          style={animated ? { ['--enter-delay' as string]: '160ms' } : undefined}
        />
        <path
          d="m12.7 13.6 2.3 2.3 4.4-4.6"
          fill="none"
          stroke="var(--violet)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12"
          className={cn(animated && '[animation:draw_520ms_var(--ease-out)_520ms_both]')}
          style={{ ['--draw-length' as string]: '12' }}
        />
      </svg>
    </span>
  );
}

/** The wordmark: one lowercase word, "near" in the brand gradient. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('font-display text-[1.375rem] leading-none font-bold tracking-[-0.055em] text-foreground [font-stretch:92%]', className)}>
      tasks<span className="text-iridescent">near</span>me
    </span>
  );
}

export function Logo({ variant = 'full', animated = false, className }: { variant?: 'full' | 'mark'; animated?: boolean; className?: string }) {
  const t = useTranslations('shell');
  return (
    <Link href={routes.home()} aria-label={t('homeLink')} className={cn('inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 rounded-xl', className)}>
      <BrandMark animated={animated} />
      {variant === 'full' && <Wordmark className={cn(animated && 'enter')} />}
    </Link>
  );
}
