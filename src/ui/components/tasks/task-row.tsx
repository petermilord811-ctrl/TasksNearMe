import { Clock, Hammer, Laptop, Leaf, MapPin, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CategorySlug, ISODateTime, TaskPublicView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { LiveOfferCount, NewSinceBadge } from './task-live';

const categoryIcons: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

const NEW_FOR_MS = 24 * 3_600_000;

/**
 * One task as a dense row (completion plan 7.4, Craigslist-style): the day on the left, the title and what it is
 * (type, neighborhood, time, offers) in the middle, the price on the right. On phones the price joins the details
 * line, so the title gets the row's width. The whole title is the link. The general area only, never an address.
 * With `visitKey` (the board's), "New" means posted since the reader's last visit, and the offer count is live
 * (completion plan 7.6).
 */
export function TaskRow({ task, now, showArea = true, href = routes.publicTask(task.slug), visitKey }: { task: TaskPublicView; now: ISODateTime; showArea?: boolean; href?: string; visitKey?: string }) {
  const t = useTranslations('taskBoard.row');
  const card = useTranslations('taskCard');
  const { formatDate, formatDateTime, formatTimeRange, locale, timeZone } = useFormat();
  const Icon = categoryIcons[task.categorySlug];
  const start = new Date(task.schedule.windowStart);
  const isNew = new Date(now).getTime() - new Date(task.postedAt).getTime() < NEW_FOR_MS;
  const price = task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : `${formatMoney(task.budget.rateCents)}${card('perHour')}`;
  const priceNote = task.budget.type === 'hourly' ? card('upToHours', { hours: formatHours(task.budget.hoursCap) }) : null;
  const tag = locale === 'es' ? 'es-US' : 'en-US';
  // The board's market clock (completion plan 8.1).
  const weekday = new Intl.DateTimeFormat(tag, { timeZone, weekday: 'short' }).format(start);
  const dayOfMonth = new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric' }).format(start);

  return <article className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.03] sm:grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:px-4 dark:hover:bg-white/[0.03]">
    <time dateTime={task.schedule.windowStart} title={formatDateTime(task.schedule.windowStart)} className="flex flex-col items-center rounded-lg bg-secondary/70 px-1 py-1 text-center leading-tight text-secondary-foreground">
      <span className="text-[11px] font-semibold uppercase tracking-wide">{weekday}</span>
      <span className="text-sm font-bold tabular-nums">{dayOfMonth}</span>
      <span className="sr-only">{formatDate(task.schedule.windowStart)}</span>
    </time>
    <div className="min-w-0 space-y-0.5">
      <h3 className="text-[15px]/6 font-semibold [overflow-wrap:anywhere]">
        <Link href={href} className="rounded-sm underline-offset-4 outline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{task.title}</Link>
        {visitKey
          ? <NewSinceBadge postedAt={task.postedAt} recent={isNew} visitKey={visitKey} />
          : isNew && <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-badge-brand px-1.5 py-px align-middle text-[11px] font-semibold text-badge-brand-foreground">{t('new')}</span>}
      </h3>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
        <span className="font-display text-sm font-semibold text-foreground tabular-nums sm:hidden">{price}{priceNote && <span className="ml-1 font-sans text-[12px] font-normal text-muted-foreground">{priceNote}</span>}</span>
        {/* Who's asking, as Neighbors shows it (2026-11-23: the board beside Neighbors). */}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[0.5625rem] font-bold text-primary">{task.poster.initials}</span>{task.poster.displayName}</span>
        <span className="inline-flex items-center gap-1"><Icon aria-hidden="true" className="size-3.5 shrink-0" />{task.taskType ? card(`types.${task.categorySlug}.${task.taskType}`) : card(`categories.${task.categorySlug}`)}</span>
        {showArea && <span className="inline-flex items-center gap-1">{task.location.kind === 'remote' ? <><Laptop aria-hidden="true" className="size-3.5 shrink-0" />{t('remote')}</> : <><MapPin aria-hidden="true" className="size-3.5 shrink-0" />{task.location.areaName}</>}</span>}
        <span className="inline-flex items-center gap-1 tabular-nums"><Clock aria-hidden="true" className="size-3.5 shrink-0" />{task.schedule.flexible ? t('anyTime') : formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd)}</span>
        {visitKey
          ? <LiveOfferCount taskId={task.id} offerCount={task.offerCount} renderedAt={now} />
          : <span className={cn('tabular-nums', task.offerCount === 0 && 'font-medium text-foreground')}>{task.offerCount === 0 ? t('first') : t('offers', { count: task.offerCount })}</span>}
      </p>
    </div>
    <p className="hidden text-right leading-tight sm:block">
      <span className="block font-display text-base font-semibold tabular-nums">{price}</span>
      {priceNote && <span className="block text-[12px] text-muted-foreground tabular-nums">{priceNote}</span>}
    </p>
  </article>;
}
