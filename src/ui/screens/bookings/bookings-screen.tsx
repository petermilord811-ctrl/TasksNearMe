import Link from 'next/link';
import { CircleAlert, Clock, MapPin, Monitor } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type BookingListRow, type BookingsPageData, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { CompactList, CompactRow, DayTile, ListGroupLabel, RowFact, RowMoney } from '@/ui/components/layout/compact-list';
import { PageHeader } from '@/ui/components/layout/page-header';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus } from '@/ui/components/status/use-status';
import { CATEGORY_ICONS } from '@/ui/components/tasks/category-icons';
import { groupByDay, useDayLabel } from '@/ui/components/time/day-groups';
import { buttonVariants } from '@/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';
import { RegularVisitsSection } from './regular-visits-section';

const tabs = ['needsAction', 'upcoming', 'past'] as const;
type BookingTab = (typeof tabs)[number];

export interface BookingsScreenProps {
  data: BookingsPageData;
  now: ISODateTime;
}

/**
 * One booking as a compact row (plan 9.14, audit M28): the day, the task (the row opens the booking), its status,
 * what, when, where and with whom, and the money; what the viewer does next under it. The role shows only when the
 * list mixes bookings as client and as helper. A check-in step whose start has passed says so (audit M51).
 */
export function BookingRow({ row, tab, now, headingLevel = 2, showRole = false }: { row: BookingListRow; tab: BookingTab; now: ISODateTime; headingLevel?: 2 | 3; showRole?: boolean }) {
  const { formatDateTime, formatRelative, formatTime, dayKey } = useFormat();
  const t = useTranslations('bookings');
  const card = useTranslations('taskCard');
  const status = useBookingStatus(row.status, row.viewerRole);
  const CategoryIcon = CATEGORY_ICONS[row.categorySlug];
  const amount = formatMoney(row.amountCents);
  const step = row.nextStep;
  const dueAt = step?.dueAt;
  // "at 2:00 pm" today, the date too on another day; past tense once a start has passed.
  const today = dueAt !== undefined && dayKey(dueAt) === dayKey(now);
  const late = dueAt !== undefined && (step?.kind === 'on_my_way' || step?.kind === 'check_in') && Date.parse(dueAt) <= Date.parse(now);

  return <CompactRow
    titleId={`booking-${tab}-${row.id}`}
    title={row.title}
    href={routes.app.booking(row.id)}
    headingLevel={headingLevel}
    tone={row.needsAction ? 'attention' : 'default'}
    leading={<DayTile at={row.start} />}
    facts={<>
      <StatusBadge size="sm" {...status} />
      {showRole && <StatusBadge size="sm" tone="neutral" label={t(`roles.${row.viewerRole}`)} />}
      <RowFact icon={CategoryIcon}>{card(`categories.${row.categorySlug}`)}</RowFact>
      <RowFact icon={Clock} className="tabular-nums"><time dateTime={row.start}>{formatTime(row.start)}</time><span>{' · '}{formatRelative(row.start, now)}</span></RowFact>
      <RowFact icon={row.location.kind === 'remote' ? Monitor : MapPin}>{row.location.kind === 'remote' ? t('remote') : row.location.areaName}</RowFact>
      <span className="inline-flex min-w-0 items-center gap-1.5"><InitialsAvatar initials={row.otherParty.initials} photo={row.otherParty.photo} size="xs" /><span className="truncate">{row.otherParty.displayName}</span></span>
    </>}
    trailing={<RowMoney caption={t(`money.${row.viewerRole}`)} amount={amount} />}
    trailingInline={t(`amount.${row.viewerRole}`, { amount })}
    note={step && <p className="flex items-start gap-1.5 font-medium text-foreground tabular-nums">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>{t(`nextStep.${step.kind}`, { relative: dueAt ? formatRelative(dueAt, now) : '', date: dueAt ? formatDateTime(dueAt) : '', time: dueAt ? formatTime(dueAt) : '', today: today ? 'yes' : 'no', late: late ? 'yes' : 'no' })}</span>
    </p>}
  />;
}

/** Bookings as client or helper: what needs the viewer first (with the step), then upcoming by day, then past. */
export function BookingsScreen({ data, now }: BookingsScreenProps) {
  const t = useTranslations('bookings');
  const { dayKey } = useFormat();
  const dayLabel = useDayLabel(dayKey(now));
  const initialTab = tabs.find((tab) => data[tab].length > 0) ?? 'upcoming';
  // "You booked" / "You're helping" only matters when the lists hold both (audit M28).
  const showRole = new Set([...data.needsAction, ...data.upcoming, ...data.past].map((row) => row.viewerRole)).size > 1;

  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    <RegularVisitsSection regular={data.regular} />
    <Tabs defaultValue={initialTab} className="gap-6">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="min-w-0 tabular-nums max-sm:flex-auto max-sm:px-2.5 max-sm:whitespace-normal max-sm:[text-wrap:balance] sm:min-w-28 sm:whitespace-nowrap">{t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length > 0
          ? tab === 'upcoming'
            ? <div className="space-y-5">{groupByDay(data.upcoming, (row) => row.start, dayKey).map((group) => <section key={group.day} aria-labelledby={`upcoming-${group.day}`} className="space-y-2">
                <ListGroupLabel id={`upcoming-${group.day}`}>{dayLabel(group.day)}</ListGroupLabel>
                <CompactList>{group.items.map((row) => <li key={row.id}><BookingRow row={row} tab={tab} now={now} headingLevel={3} showRole={showRole} /></li>)}</CompactList>
              </section>)}</div>
            : <CompactList>{data[tab].map((row) => <li key={row.id}><BookingRow row={row} tab={tab} now={now} showRole={showRole} /></li>)}</CompactList>
          : <div className="space-y-3">
            <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={tab === 'upcoming' ? { label: t('postTask'), href: routes.app.newTask() } : undefined} />
            {tab === 'upcoming' && <div className="flex justify-center"><Link href={routes.app.findWork()} className={buttonVariants({ variant: 'outline' })}>{t('findWork')}</Link></div>}
          </div>}
      </TabsContent>)}
    </Tabs>
  </div>;
}
