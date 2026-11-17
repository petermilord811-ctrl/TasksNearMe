import Link from 'next/link';
import { CalendarDays, ChevronRight, CircleAlert, MapPin, Monitor } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BookingListRow, type BookingsPageData, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus } from '@/ui/components/status/use-status';
import { groupByDay, useDayLabel } from '@/ui/components/time/day-groups';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';
import { RegularVisitsSection } from './regular-visits-section';

const tabs = ['needsAction', 'upcoming', 'past'] as const;
type BookingTab = (typeof tabs)[number];

export interface BookingsScreenProps {
  data: BookingsPageData;
  now: ISODateTime;
}

export function BookingRow({ row, tab, now, headingLevel = 2 }: { row: BookingListRow; tab: BookingTab; now: ISODateTime; headingLevel?: 2 | 3 }) {
  const { formatDateTime, formatRelative, formatTime } = useFormat();
  const t = useTranslations('bookings');
  const card = useTranslations('taskCard');
  const status = useBookingStatus(row.status, row.viewerRole);
  const titleId = `booking-${tab}-${row.id}`;
  const LocationIcon = row.location.kind === 'remote' ? Monitor : MapPin;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return <article aria-labelledby={titleId} className={cn('group relative min-w-0 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background md:p-6', row.needsAction && 'border-warning')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-secondary-foreground">{card(`categories.${row.categorySlug}`)}</p>
      <StatusBadge {...status} />
    </div>
    <div className="mt-4 flex items-start justify-between gap-3">
      <Heading id={titleId} className="text-[17px]/6 font-semibold group-hover:text-primary md:text-lg/6.5"><Link href={routes.app.booking(row.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{row.title}</Link></Heading>
      <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <StatusBadge tone="neutral" label={t(`roles.${row.viewerRole}`)} />
      {row.needsAction && <StatusBadge tone="warning" label={t('needsAction')} />}
    </div>
    {row.nextStep && <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium tabular-nums">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {t(`nextStep.${row.nextStep.kind}`, row.nextStep.dueAt
        ? { relative: formatRelative(row.nextStep.dueAt, now), date: formatDateTime(row.nextStep.dueAt), time: formatTime(row.nextStep.dueAt) }
        : { relative: '', date: '', time: '' })}
    </p>}
    <div className="mt-5 flex items-center gap-3">
      <InitialsAvatar initials={row.otherParty.initials} size="sm" />
      <p className="text-sm font-medium">{row.otherParty.displayName}</p>
    </div>
    <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
      <div className="flex items-start gap-2">
        <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="tabular-nums"><time dateTime={row.start}>{formatDateTime(row.start)}</time><p className="mt-1">{formatRelative(row.start, now)}</p></div>
      </div>
      <p className="flex items-start gap-2"><LocationIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{row.location.kind === 'remote' ? t('remote') : row.location.areaName}</span></p>
    </div>
    <p className="mt-5 border-t border-border pt-4 font-semibold tabular-nums">{t(`amount.${row.viewerRole}`, { amount: formatMoney(row.amountCents) })}</p>
  </article>;
}

/** Bookings as client or helper: what needs the viewer first (with the step), then upcoming by day, then past. */
export function BookingsScreen({ data, now }: BookingsScreenProps) {
  const t = useTranslations('bookings');
  const { dayKey } = useFormat();
  const dayLabel = useDayLabel(dayKey(now));
  const initialTab = tabs.find((tab) => data[tab].length > 0) ?? 'upcoming';

  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    <RegularVisitsSection regular={data.regular} />
    <Tabs defaultValue={initialTab} className="gap-6">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="min-w-0 whitespace-normal tabular-nums [text-wrap:balance] max-sm:flex-auto max-sm:px-2.5 sm:min-w-28">{t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length > 0
          ? tab === 'upcoming'
            ? <div className="space-y-6">{groupByDay(data.upcoming, (row) => row.start, dayKey).map((group) => <section key={group.day} aria-labelledby={`upcoming-${group.day}`} className="space-y-3">
                <h2 id={`upcoming-${group.day}`} className="text-sm font-semibold text-muted-foreground">{dayLabel(group.day)}</h2>
                <ul className="space-y-4">{group.items.map((row) => <li key={row.id}><BookingRow row={row} tab={tab} now={now} headingLevel={3} /></li>)}</ul>
              </section>)}</div>
            : <ul className="space-y-4">{data[tab].map((row) => <li key={row.id}><BookingRow row={row} tab={tab} now={now} /></li>)}</ul>
          : <div className="space-y-3">
            <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={tab === 'upcoming' ? { label: t('postTask'), href: routes.app.newTask() } : undefined} />
            {tab === 'upcoming' && <div className="flex justify-center"><Link href={routes.app.findWork()} className={buttonVariants({ variant: 'outline' })}>{t('findWork')}</Link></div>}
          </div>}
      </TabsContent>)}
    </Tabs>
  </div>;
}
