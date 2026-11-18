import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';

/**
 * The app's compact lists (plan 9.14, audit M27, M28, M36): rows in one rounded panel with a hairline between
 * them, in the home dashboard's style, so a list of tasks, bookings, offers or receipts reads in one or two lines
 * per item instead of a tall card each. Presentational only: each screen decides what goes in a row.
 */
export function CompactList({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <ul aria-label={label} className={cn('overflow-hidden rounded-[1.375rem] border bg-card shadow-card [&>li+li]:border-t', className)}>{children}</ul>;
}

/** The day as a small tile: weekday over the day of the month, on the market's clock (as the dashboard's rows). */
export function DayTile({ at, className }: { at: ISODateTime; className?: string }) {
  const { formatDate, locale, timeZone } = useFormat();
  const tag = locale === 'es' ? 'es-US' : 'en-US';
  const date = new Date(at);
  const weekday = new Intl.DateTimeFormat(tag, { timeZone, weekday: 'short' }).format(date);
  const dayOfMonth = new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric' }).format(date);
  return <time dateTime={at} className={cn('flex min-h-12 flex-col items-center justify-center rounded-xl bg-secondary px-1 py-1.5 text-center leading-none text-secondary-foreground', className)}>
    <span aria-hidden="true" className="text-[11px] font-semibold tracking-wide uppercase">{weekday.replace('.', '')}</span>
    <span aria-hidden="true" className="mt-1 text-base font-bold tabular-nums">{dayOfMonth}</span>
    <span className="sr-only">{formatDate(at)}</span>
  </time>;
}

/** An icon in the leading tile's place, for rows that aren't about a day (a receipt, a card). */
export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <span aria-hidden="true" className={cn('flex min-h-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground', className)}><Icon className="size-5" /></span>;
}

/** One fact in a row's details line: a small icon and its words. */
export function RowFact({ icon: Icon, children, className }: { icon?: LucideIcon; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>{Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}{children}</span>;
}

export interface CompactRowProps {
  /** The heading's id (the row is an article labelled by it). */
  titleId: string;
  title: ReactNode;
  /** The whole row opens this. */
  href: string;
  headingLevel?: 2 | 3 | 4;
  /** A day tile or an icon tile. */
  leading?: ReactNode;
  /** Right after the title, on its line (a "New" mark). */
  titleExtra?: ReactNode;
  /** The details line: status first, then what, where, when, who. */
  facts: ReactNode;
  /** The right column from 640 px (the money); on phones it shows as `trailingInline` in the details line. */
  trailing?: ReactNode;
  trailingInline?: ReactNode;
  /** A line under the details: what needs the viewer now, a next step. */
  note?: ReactNode;
  /** A control of its own (a link or button above the row's link), shown under the note on phones and at the end from 640 px. */
  action?: ReactNode;
  /** `attention`: something waits on the viewer (a warm edge on the left). */
  tone?: 'default' | 'attention';
}

/**
 * One item as a dense row. The title's link covers the row (`after:inset-0`); `action` sits above it, once in the
 * markup: under the details on phones, at the row's end (under the money) from 640 px. Keyboard focus shows on the
 * whole row. Day tile column 2.75 rem on phones, 3 rem from 640 px; the money column from 640 px.
 */
export function CompactRow({ titleId, title, href, headingLevel = 3, leading, titleExtra, facts, trailing, trailingInline, note, action, tone = 'default' }: CompactRowProps) {
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : 'h4';
  const end = Boolean(trailing || action);
  return <article
    aria-labelledby={titleId}
    data-tone={tone === 'attention' ? 'attention' : undefined}
    className={cn(
      'group/row relative grid min-w-0 items-start gap-x-3 gap-y-2 px-3 py-3 transition-colors duration-150 hover:bg-muted/70 has-[a:focus-visible]:bg-muted/70 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring sm:px-4',
      leading
        ? cn('grid-cols-[2.75rem_minmax(0,1fr)]', end && 'sm:grid-cols-[3rem_minmax(0,1fr)_auto]', !end && 'sm:grid-cols-[3rem_minmax(0,1fr)]')
        : cn('grid-cols-[minmax(0,1fr)]', end && 'sm:grid-cols-[minmax(0,1fr)_auto]'),
      tone === 'attention' && 'before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-warning',
    )}
  >
    {leading && <div className={cn('col-start-1 row-start-1', action && 'sm:row-span-2')}>{leading}</div>}
    <div className={cn('min-w-0 space-y-1.5 row-start-1', leading ? 'col-start-2' : 'col-start-1', action && 'sm:row-span-2')}>
      <Heading id={titleId} className="text-[15px]/5 font-semibold [overflow-wrap:anywhere]">
        <Link href={href} className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">{title}</Link>
        {titleExtra}
      </Heading>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-5 text-muted-foreground">
        {facts}
        {trailingInline && <span className="font-display text-sm font-semibold text-foreground tabular-nums sm:hidden">{trailingInline}</span>}
      </div>
      {note && <div className="text-[13px] leading-5">{note}</div>}
    </div>
    {trailing && <div className={cn('row-start-1 hidden text-right leading-tight sm:block', leading ? 'col-start-3' : 'col-start-2')}>{trailing}</div>}
    {action && <div className={cn('relative z-10 row-start-2', leading ? 'col-start-2 sm:col-start-3' : 'col-start-1 sm:col-start-2', 'sm:self-end sm:justify-self-end')}>{action}</div>}
  </article>;
}

/** The money on a row's right: what it is over the amount (and a note such as "up to 4 h"). */
export function RowMoney({ caption, amount, note }: { caption?: string; amount: string; note?: string }) {
  return <p className="leading-tight">
    {caption && <span className="block text-xs text-muted-foreground">{caption}</span>}
    <span className="mt-0.5 block font-display text-base font-semibold tabular-nums">{amount}</span>
    {note && <span className="block text-xs text-muted-foreground tabular-nums">{note}</span>}
  </p>;
}

/** A group's label above its list (a day, a month). */
export function ListGroupLabel({ id, children, level = 2 }: { id: string; children: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading id={id} className="px-1 text-sm font-semibold text-muted-foreground">{children}</Heading>;
}
