import { Clock, Hourglass, Laptop, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type InviteHandlers, type MyOfferRow, type MyOffersPageData } from '@/contracts';
import { formatHours, formatMoney } from '@/shared/format';
import { useFormat } from '@/ui/lib/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { CompactList, CompactRow, DayTile, RowFact, RowMoney } from '@/ui/components/layout/compact-list';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
import { CATEGORY_ICONS } from '@/ui/components/tasks/category-icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';
import { MyInvites } from './my-invites';

const tabs = ['active', 'booked', 'closed'] as const;
type OfferTab = (typeof tabs)[number];

export interface MyOffersScreenProps {
  data: MyOffersPageData;
  now: ISODateTime;
  /** Supplied by routes that include direct invites. */
  inviteHandlers?: InviteHandlers;
  /** Lets the preview gallery show each tab directly. */
  initialTab?: OfferTab;
}

/**
 * One offer as a compact row (plan 9.14, audit M36): the proposed day, the task (the row opens it), the offer's
 * status, what and where, the time and price, the expiry while it's waiting, and what the helper earns.
 */
export function OfferRow({ row, now, tab, headingLevel = 2 }: { row: MyOfferRow; now: ISODateTime; tab?: OfferTab; headingLevel?: 2 | 3 }) {
  const { formatRelative, formatTime } = useFormat();
  const t = useTranslations('myOffers');
  const taskCopy = useTranslations('taskCard');
  const { offer, task } = row;
  const status = useOfferStatus(offer.status, 'helper');
  const CategoryIcon = CATEGORY_ICONS[task.categorySlug];
  const price = offer.pricing.type === 'fixed' ? formatMoney(offer.pricing.priceCents) : t('hourlyPrice', {
    rate: formatMoney(offer.pricing.rateCents), hours: formatHours(offer.pricing.estimatedHours), cap: formatHours(offer.pricing.hoursCap),
  });
  const earnings = formatMoney(offer.breakdown.helperEarningsCents);
  const waiting = tab ? tab === 'active' : offer.status === 'pending' || offer.status === 'stale';

  return <CompactRow
    titleId={`my-offer-${offer.id}`}
    title={task.title}
    href={routes.app.findWorkTask(task.id)}
    headingLevel={headingLevel}
    leading={<DayTile at={offer.proposedStart} />}
    titleExtra={offer.revision > 1 ? <span className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-badge-brand px-1.5 py-px align-middle text-[11px] font-semibold text-badge-brand-foreground">{t('updatedOffer')}</span> : undefined}
    facts={<>
      <StatusBadge size="sm" {...status} />
      <RowFact icon={CategoryIcon}>{taskCopy(`categories.${task.categorySlug}`)}</RowFact>
      <RowFact icon={task.location.kind === 'remote' ? Laptop : MapPin}>{task.location.kind === 'remote' ? t('remote') : task.location.areaName}</RowFact>
      <RowFact icon={Clock} className="tabular-nums"><time dateTime={offer.proposedStart}>{formatTime(offer.proposedStart)}</time></RowFact>
      <RowFact className="tabular-nums">{t('priceFact', { price })}</RowFact>
      {waiting && <RowFact icon={Hourglass} className="tabular-nums"><time dateTime={offer.expiresAt}>{t('expires', { relative: formatRelative(offer.expiresAt, now) })}</time></RowFact>}
    </>}
    trailing={<RowMoney caption={t('earnings')} amount={earnings} />}
    trailingInline={t('earnShort', { amount: earnings })}
  />;
}

export function MyOffersScreen({ data, now, inviteHandlers, initialTab }: MyOffersScreenProps) {
  const t = useTranslations('myOffers');
  // The first tab with offers in it, not an empty "Active (0)" (audit L18).
  const openTab = initialTab ?? tabs.find((tab) => data[tab].length > 0) ?? 'active';
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    {data.invites && inviteHandlers && <MyInvites key={data.openInviteId ?? 'list'} invites={data.invites} openInviteId={data.openInviteId} handlers={inviteHandlers} now={now} />}
    <Tabs defaultValue={openTab} className="gap-6">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="tabular-nums sm:min-w-28">{t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length > 0 ? <CompactList>{data[tab].map((row) => <li key={row.offer.id}><OfferRow row={row} now={now} tab={tab} /></li>)}</CompactList>
          : <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={{ label: t('findWork'), href: routes.app.findWork() }} />}
      </TabsContent>)}
    </Tabs>
  </div>;
}
