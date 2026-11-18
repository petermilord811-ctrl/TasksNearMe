import { CalendarDays, Clock, Hammer, Laptop, Leaf, MapPin, Package, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CategorySlug, DashboardItem, DashboardMoney, ISODateTime } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus, useOfferStatus, useTaskStatus, type StatusLabel } from '@/ui/components/status/use-status';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { dashboardTargetHref } from './links';

const CATEGORY_ICONS: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

/** The status badge's words and tone, from the status kind the app gave (each hook is always called, in order). */
function useItemStatus(item: DashboardItem): StatusLabel {
  const task = useTaskStatus(item.status.kind === 'task' ? item.status.status : 'open');
  const booking = useBookingStatus(item.status.kind === 'booking' ? item.status.status : 'confirmed', item.status.kind === 'task' ? 'poster' : item.status.viewer);
  const offer = useOfferStatus(item.status.kind === 'offer' ? item.status.status : 'pending', item.status.kind === 'task' ? 'poster' : item.status.viewer);
  return item.status.kind === 'task' ? task : item.status.kind === 'booking' ? booking : offer;
}

type ItemTranslator = ReturnType<typeof useTranslations>;

/** The money as words: the amount ("$60.00", "$40.00/h"), a note ("up to 4 h") and what it is ("Budget", "You earn"). */
export function moneyWords(money: DashboardMoney | undefined, t: ItemTranslator): { amount: string; note?: string; caption: string } | null {
  if (!money) return null;
  const caption = t(`money.${money.kind}`);
  if (money.kind === 'total' || money.kind === 'earn') return { amount: formatMoney(money.cents), caption };
  const pricing = money.pricing;
  return pricing.type === 'fixed'
    ? { amount: formatMoney(pricing.priceCents), caption }
    : { amount: t('perHour', { rate: formatMoney(pricing.rateCents) }), note: t('upToHours', { hours: formatHours(pricing.hoursCap) }), caption };
}

/** The facts every view shows, as words. */
export function useItemFacts(item: DashboardItem) {
  const t = useTranslations('home.item');
  const card = useTranslations('taskCard');
  const { formatDate, formatTime, formatTimeRange } = useFormat();
  const status = useItemStatus(item);
  const money = moneyWords(item.money, t);
  return {
    status,
    money,
    category: item.taskType ? card(`types.${item.categorySlug}.${item.taskType}`) : card(`categories.${item.categorySlug}`),
    CategoryIcon: CATEGORY_ICONS[item.categorySlug],
    area: item.location.kind === 'local' ? item.location.areaName : t('remote'),
    remote: item.location.kind === 'remote',
    day: formatDate(item.when.start),
    time: item.when.end ? (item.when.flexible ? t('flexibleRange') : formatTimeRange(item.when.start, item.when.end)) : formatTime(item.when.start),
    person: item.person ? t(item.side === 'client' ? 'helper' : 'client', { name: item.person.displayName }) : null,
    offers: item.offers ? { count: t('offers', { count: item.offers.count }), fresh: item.offers.new > 0 ? t('newOffers', { count: item.offers.new }) : null } : null,
    href: dashboardTargetHref(item.target),
  };
}

/** The day as a small tile: weekday over the day of the month, on the market's clock. */
export function DateTile({ start, className }: { start: ISODateTime; className?: string }) {
  const { formatDate, locale, timeZone } = useFormat();
  const tag = locale === 'es' ? 'es-US' : 'en-US';
  const date = new Date(start);
  const weekday = new Intl.DateTimeFormat(tag, { timeZone, weekday: 'short' }).format(date);
  const dayOfMonth = new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric' }).format(date);
  return <time dateTime={start} className={cn('flex flex-col items-center justify-center rounded-xl bg-secondary px-1 py-1.5 text-center leading-none text-secondary-foreground', className)}>
    <span aria-hidden="true" className="text-[11px] font-semibold tracking-wide uppercase">{weekday.replace('.', '')}</span>
    <span aria-hidden="true" className="mt-1 text-base font-bold tabular-nums">{dayOfMonth}</span>
    <span className="sr-only">{formatDate(start)}</span>
  </time>;
}

function NeedsYou() {
  const t = useTranslations('home.item');
  return <span className="inline-flex items-center gap-1 rounded-full bg-badge-warning px-2 py-px text-xs leading-5 font-semibold text-badge-warning-foreground">
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{t('needsYou')}
  </span>;
}

function NewMark() {
  const t = useTranslations('home.item');
  return <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-badge-brand px-1.5 py-px align-middle text-[11px] font-semibold text-badge-brand-foreground">{t('new')}</span>;
}

export interface DashboardRowProps {
  item: DashboardItem;
  /** Lit from the map (its area is pointed at), or pointed at here. */
  active?: boolean;
  onActiveChange?: (key: string | null) => void;
  headingLevel?: 3 | 4;
}

/**
 * One item as a dense row: the day tile, the title (the whole row opens it), then its status and what it is, where,
 * when and with whom; the money on the right (in the details line on phones). Never an address.
 */
export function DashboardRow({ item, active = false, onActiveChange, headingLevel = 3 }: DashboardRowProps) {
  const facts = useItemFacts(item);
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const { CategoryIcon } = facts;
  return <article
    data-active={active || undefined}
    onMouseEnter={onActiveChange ? () => onActiveChange(item.key) : undefined}
    onMouseLeave={onActiveChange ? () => onActiveChange(null) : undefined}
    onFocus={onActiveChange ? () => onActiveChange(item.key) : undefined}
    onBlur={onActiveChange ? () => onActiveChange(null) : undefined}
    className="group/row relative grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-3 transition-colors duration-150 hover:bg-muted/70 has-[a:focus-visible]:bg-muted/70 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring data-[active]:bg-muted sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:px-4"
  >
    <DateTile start={item.when.start} className="min-h-12" />
    <div className="min-w-0 space-y-1.5">
      <Heading className="text-[15px]/5 font-semibold [overflow-wrap:anywhere]">
        <Link href={facts.href} className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">{item.title}</Link>
        {item.isNew && <NewMark />}
      </Heading>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-5 text-muted-foreground">
        <StatusBadge size="sm" tone={facts.status.tone} label={facts.status.label} />
        {item.needsYou && <NeedsYou />}
        {facts.money && <span className="font-display text-sm font-semibold text-foreground tabular-nums sm:hidden">{facts.money.amount}</span>}
        <span className="inline-flex min-w-0 items-center gap-1"><CategoryIcon aria-hidden="true" className="size-3.5 shrink-0" />{facts.category}</span>
        <span className="inline-flex items-center gap-1">{facts.remote ? <Laptop aria-hidden="true" className="size-3.5 shrink-0" /> : <MapPin aria-hidden="true" className="size-3.5 shrink-0" />}{facts.area}</span>
        <span className="inline-flex items-center gap-1 tabular-nums"><Clock aria-hidden="true" className="size-3.5 shrink-0" />{facts.time}</span>
        {facts.person && <span className="inline-flex items-center gap-1"><UserRound aria-hidden="true" className="size-3.5 shrink-0" />{facts.person}</span>}
        {facts.offers && <span className="tabular-nums">{facts.offers.count}{facts.offers.fresh && <span className="font-semibold text-foreground"> · {facts.offers.fresh}</span>}</span>}
      </p>
    </div>
    {facts.money && <p className="hidden text-right leading-tight sm:block">
      <span className="block text-xs text-muted-foreground">{facts.money.caption}</span>
      <span className="mt-0.5 block font-display text-base font-semibold tabular-nums">{facts.money.amount}</span>
      {facts.money.note && <span className="block text-xs text-muted-foreground tabular-nums">{facts.money.note}</span>}
    </p>}
  </article>;
}

/** The rows in one rounded panel, a hairline between them. */
export function DashboardRows({ items, activeKey, onActiveChange, headingLevel }: { items: DashboardItem[]; activeKey?: string | null; onActiveChange?: (key: string | null) => void; headingLevel?: 3 | 4 }) {
  return <ul className="overflow-hidden rounded-[1.375rem] border bg-card shadow-card [&>li+li]:border-t">
    {items.map((item) => <li key={item.key}><DashboardRow item={item} active={activeKey === item.key} onActiveChange={onActiveChange} headingLevel={headingLevel} /></li>)}
  </ul>;
}

/** One item as a card (the cards view): what it is and its status on top, the title, when, where and who, then the money. */
export function DashboardCard({ item }: { item: DashboardItem }) {
  const facts = useItemFacts(item);
  const { CategoryIcon } = facts;
  return <article className="group/card relative flex h-full min-w-0 flex-col gap-3 rounded-[1.375rem] border bg-card p-4 shadow-card transition-[translate,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0">
    <div className="flex items-start justify-between gap-2">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-primary"><CategoryIcon aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">{facts.category}</span></span>
      <StatusBadge size="sm" tone={facts.status.tone} label={facts.status.label} />
    </div>
    <h3 className="font-display text-[17px]/6 font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
      <Link href={facts.href} className="outline-none after:absolute after:inset-0 after:rounded-[1.375rem] after:content-[''] hover:text-primary">{item.title}</Link>
      {item.isNew && <NewMark />}
    </h3>
    <ul className="space-y-1.5 text-sm text-muted-foreground">
      <li className="flex items-center gap-2 tabular-nums"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{facts.day} · {facts.time}</li>
      <li className="flex items-center gap-2">{facts.remote ? <Laptop aria-hidden="true" className="size-4 shrink-0" /> : <MapPin aria-hidden="true" className="size-4 shrink-0" />}{facts.area}</li>
      {facts.person && <li className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 shrink-0" />{facts.person}</li>}
    </ul>
    <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
      {facts.money ? <p className="leading-tight">
        <span className="block text-xs text-muted-foreground">{facts.money.caption}</span>
        <span className="mt-0.5 block font-display text-lg font-semibold tabular-nums">{facts.money.amount}</span>
        {facts.money.note && <span className="block text-xs text-muted-foreground tabular-nums">{facts.money.note}</span>}
      </p> : <span />}
      <div className="flex flex-col items-end gap-1 text-right text-[13px] text-muted-foreground">
        {item.needsYou && <NeedsYou />}
        {facts.offers && <span className="tabular-nums">{facts.offers.count}{facts.offers.fresh && <span className="font-semibold text-foreground"> · {facts.offers.fresh}</span>}</span>}
      </div>
    </div>
  </article>;
}

/** The cards in a grid: one column on phones, two from tablets, three on wide screens. */
export function DashboardCards({ items }: { items: DashboardItem[] }) {
  return <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {items.map((item) => <li key={item.key} className="min-w-0"><DashboardCard item={item} /></li>)}
  </ul>;
}
