import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/**
 * The staff screens' shared look, in the app's language (the refined shell and primitives) but tighter for dense
 * work: raised panels, tables with a quiet header band that become cards on phones, filter chips, back links and
 * empty notes. Class names and small links only: every screen keeps its own markup and semantics (the roles,
 * names and `aria-current` values its tests and the e2e flows rely on).
 */

/** A raised surface: the app's card, a little tighter. */
export const adminPanel = 'rounded-2xl border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.07]';

/** A panel with the usual padding. */
export const adminSection = cn(adminPanel, 'p-4 sm:p-5');

/** The frame of a wide-screen table (phones get the same rows as cards). */
export const adminTableFrame = cn(adminPanel, 'hidden overflow-hidden lg:block');

/** A header cell: a small, quiet label on a faint band. */
export const adminTh = 'bg-foreground/[0.03] px-3 py-2.5 text-left text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase dark:bg-white/[0.035]';

/** A body row: hairline separators and a soft hover. */
export const adminTr = 'border-t border-foreground/[0.06] align-top transition-colors duration-200 hover:bg-foreground/[0.025] dark:border-white/[0.06] dark:hover:bg-white/[0.03]';

/** A body cell. */
export const adminTd = 'px-3 py-3';

/** A money cell: right-aligned figures. */
export const adminMoneyTd = 'px-3 py-3 text-right font-semibold tabular-nums';

/** A card standing in for a table row on phones; `adminCardLink` when the whole card opens something. */
export const adminCard = cn(adminPanel, 'min-w-0 p-4');
export const adminCardLink = cn(
  adminPanel,
  'block min-w-0 p-4 transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-px hover:border-foreground/[0.12] hover:shadow-[0_10px_28px_-18px_rgb(23_18_14/0.45)] active:translate-y-0 dark:hover:border-white/[0.14]',
);

/** A quiet line where a section has nothing to show ("No bookings yet"). */
export const adminNote = 'rounded-2xl border border-dashed border-foreground/[0.12] bg-card/60 p-4 text-sm text-muted-foreground dark:border-white/[0.12]';

/** A native select that matches the refined `Input` (rounded, soft inset, the 3 px focus halo). */
export const adminSelect = 'min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-base shadow-[inset_0_1px_2px_rgb(23_18_14/0.05)] transition-[color,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] outline-none hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:bg-white/[0.035] dark:shadow-none dark:hover:border-foreground/50 dark:aria-invalid:ring-destructive/40';

/** A section's heading inside a page (the display face, as the app's sections). */
export const adminH2 = 'font-display text-xl leading-7 font-semibold tracking-[-0.02em]';

/** A text link to another staff page. */
export const adminLink = 'inline-flex min-h-11 max-w-full items-center rounded-md font-medium text-primary underline-offset-4 [overflow-wrap:anywhere] hover:underline';

/**
 * A filter kept in the URL: a chip. The current one is filled; `count`, when given, follows the label after a
 * space (so a link reads "Needs a look 3"). `current` sets `aria-current` to `currentValue` ("page" for tabs of
 * one list, "true" for one choice among several filters on a page).
 */
export function AdminFilterChip({ href, current, currentValue = 'page', count, icon, children }: {
  href: string;
  current: boolean;
  currentValue?: 'page' | 'true';
  count?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return <Link
    href={href}
    aria-current={current ? currentValue : undefined}
    className={cn(
      'inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200',
      current
        ? 'border-transparent bg-foreground text-background shadow-[0_6px_16px_-10px_rgb(23_18_14/0.6)]'
        : 'border-foreground/[0.1] bg-card text-foreground/80 hover:border-foreground/[0.2] hover:bg-foreground/[0.04] hover:text-foreground dark:border-white/[0.12]',
    )}
  >
    {icon && <span aria-hidden="true" className="-ml-1 shrink-0 [&_svg]:size-4">{icon}</span>}
    {children}
    {count !== undefined && <>{' '}<span className={cn('min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums', current ? 'bg-background/20 text-background' : 'bg-foreground/[0.07] text-foreground/75')}>{count}</span></>}
  </Link>;
}

/**
 * A date and time in a narrow column. The text is `formatDateTime`'s ("Mon, Nov 23 · 9:20 am"), but a line only
 * breaks at the dot, never inside the day or the time ("9:20" / "am").
 */
export function AdminWhen({ at, title }: { at: ISODateTime; title?: string }) {
  const { formatDate, formatTime } = useFormat();
  return <time dateTime={at} title={title}><span className="whitespace-nowrap">{formatDate(at)}</span>{' · '}<span className="whitespace-nowrap">{formatTime(at)}</span></time>;
}

/** A dotted code such as `booking.reveal_address`: a quiet chip that wraps after a dot rather than inside a word. */
export function AdminCode({ children, className }: { children: string; className?: string }) {
  return <code className={cn('inline-block max-w-full rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[13px] [overflow-wrap:anywhere] dark:bg-white/[0.08]', className)}>
    {children.split('.').map((part, index) => <Fragment key={index}>{index > 0 && <>.<wbr /></>}{part}</Fragment>)}
  </code>;
}

/** Back to a list: a quiet link with an arrow that leans back on hover. */
export function AdminBackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="group inline-flex min-h-11 items-center gap-1 rounded-md pr-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
    <ChevronLeft aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />{children}
  </Link>;
}
