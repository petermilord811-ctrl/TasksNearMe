import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts/routes';
import { cn } from '@/ui/lib/utils';

/**
 * The mark's one line (viewBox 0 0 32 32): a check whose long stroke breaks out through the shoulder of a location
 * pin and runs on around it, down to the tip. One continuous line, so it draws itself in one gesture: a task done,
 * close by. Shared with the favicon and app icons (public/ui/brand/*.svg, public/icons).
 */
export const MARK_LINE = 'M11.9 13.9 14.8 16.8 21.67 8.74A7.4 7.4 0 0 0 8.6 13.5C8.6 19.3 16 26.2 16 26.2S23.4 19.3 23.4 13.5';

/**
 * The tasksnearme mark: the line above in white on an iridescent tile with a soft glassy depth, and a "near"
 * ripple under the pin's tip. The tile is CSS (no SVG gradient ids to collide when several logos share a page).
 * `animated` draws the line once, from the check around the pin, on the document's first load only: the tile, the
 * ripple and the wordmark are crisp from the first paint (no blur or bloom), and a header mounted later in the same
 * document (`data-logo-settled` on <html>, theme-script.ts) shows the line already drawn, so switching pages never
 * replays it. Pointed at (inside its link), the line draws again and a light sweeps the tile.
 */
export function BrandMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'brand-mark relative inline-grid size-9 shrink-0 place-items-center overflow-hidden rounded-[30%]',
        'shadow-[0_6px_16px_-6px_var(--primary-glow),inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-3px_8px_rgb(46_16_96/0.28)]',
        className,
      )}
      style={{ backgroundImage: 'var(--iridescent)' }}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_8%,rgb(255_255_255/0.45),transparent_55%)]" />
      <span className="brand-mark-sheen pointer-events-none absolute inset-y-0 -left-full w-full bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.5)_50%,transparent_70%)]" />
      <svg viewBox="0 0 32 32" className="relative size-[82%] drop-shadow-[0_1px_1px_rgb(46_16_96/0.25)]" focusable="false">
        <ellipse
          cx="16"
          cy="27.6"
          rx="5.6"
          ry="1.5"
          fill="none"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="1.1"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
        <path
          d={MARK_LINE}
          pathLength={1}
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1"
          className={cn('brand-mark-line', animated && '[html:not([data-logo-settled])_&]:[animation:draw_900ms_var(--ease-out)_200ms_both]')}
          style={{ ['--draw-length' as string]: '1' }}
        />
      </svg>
    </span>
  );
}

/**
 * The wordmark: one lowercase word, "near" in the brand gradient. `stack="phones"` sets it as two lines below `sm`
 * (owner, 2026-11-24: "in phone mode or space is not enough, show tasksnearme logo text in two lines"): "tasks" over
 * "nearme" at 16 px, tight, about as tall as the mark and 53 px wide, so a 360 px bar keeps room for five buttons.
 */
export function Wordmark({ className, stack = 'never' }: { className?: string; stack?: 'never' | 'phones' }) {
  return (
    <span aria-hidden="true" className={cn('font-display text-[1.375rem] leading-none font-bold tracking-[-0.055em] text-foreground [font-stretch:92%]', stack === 'phones' && 'max-sm:inline-grid max-sm:text-base max-sm:leading-[0.92] max-sm:tracking-[-0.045em]', className)}>
      <span>tasks</span><span><span className="text-iridescent">near</span>me</span>
    </span>
  );
}

export function Logo({ variant = 'full', animated = false, stack = 'never', className }: { variant?: 'full' | 'mark'; animated?: boolean; stack?: 'never' | 'phones'; className?: string }) {
  const t = useTranslations('shell');
  return (
    <Link href={routes.home()} aria-label={t('homeLink')} className={cn('brand-logo inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 rounded-xl', stack === 'phones' && 'max-sm:gap-2', className)}>
      <BrandMark animated={animated} />
      {variant === 'full' && <Wordmark stack={stack} />}
    </Link>
  );
}
