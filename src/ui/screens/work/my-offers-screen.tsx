import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ISODateTime, type InviteHandlers, type MyOfferRow, type MyOffersPageData } from '@/contracts';
import { formatDateTime, formatHours, formatMoney, formatRelative } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useOfferStatus } from '@/ui/components/status/use-status';
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

export function OfferRow({ row, now, headingLevel = 2 }: { row: MyOfferRow; now: ISODateTime; headingLevel?: 2 | 3 }) {
  const t = useTranslations('myOffers');
  const taskCopy = useTranslations('taskCard');
  const { offer, task } = row;
  const status = useOfferStatus(offer.status, 'helper');
  const titleId = `my-offer-${offer.id}`;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const price = offer.pricing.type === 'fixed' ? formatMoney(offer.pricing.priceCents) : t('hourlyPrice', {
    rate: formatMoney(offer.pricing.rateCents), hours: formatHours(offer.pricing.estimatedHours), cap: formatHours(offer.pricing.hoursCap),
  });

  return <article aria-labelledby={titleId} className="group relative min-w-0 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-medium text-secondary-foreground">{taskCopy(`categories.${task.categorySlug}`)}</p>
      <StatusBadge {...status} />
    </div>
    <div className="mt-4 flex items-start justify-between gap-3">
      <Heading id={titleId} className="text-[17px]/6 font-semibold group-hover:text-primary md:text-lg/6.5"><Link href={routes.app.findWorkTask(task.id)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{task.title}</Link></Heading>
      <ChevronRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
    </div>
    <p className="mt-3 flex items-start gap-2 text-sm tabular-nums text-muted-foreground"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><time dateTime={offer.proposedStart}>{t('proposedStart', { date: formatDateTime(offer.proposedStart) })}</time></p>
    <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">{t('yourPrice')}</dt><dd className="mt-1 font-semibold tabular-nums">{price}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{t('earnings')}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(offer.breakdown.helperEarningsCents)}</dd></div>
    </dl>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
      <div className="text-sm tabular-nums"><p>{t('expiry')}: <time dateTime={offer.expiresAt}>{formatDateTime(offer.expiresAt)}</time></p><p className="mt-1 text-muted-foreground">{t('expires', { relative: formatRelative(offer.expiresAt, now) })}</p></div>
      {offer.revision > 1 && <StatusBadge tone="brand" label={t('updatedOffer')} />}
    </div>
  </article>;
}

export function MyOffersScreen({ data, now, inviteHandlers, initialTab = 'active' }: MyOffersScreenProps) {
  const t = useTranslations('myOffers');
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    {data.invites && inviteHandlers && <MyInvites key={data.openInviteId ?? 'list'} invites={data.invites} openInviteId={data.openInviteId} handlers={inviteHandlers} now={now} />}
    <Tabs defaultValue={initialTab} className="gap-6">
      <TabsList aria-label={t('tabsLabel')} className="w-full sm:w-fit">
        {tabs.map((tab) => <TabsTrigger key={tab} value={tab} className="tabular-nums sm:min-w-28">{t('tabCount', { label: t(`tabs.${tab}`), count: data[tab].length })}</TabsTrigger>)}
      </TabsList>
      {tabs.map((tab) => <TabsContent key={tab} value={tab}>
        {data[tab].length > 0 ? <ul className="space-y-4">{data[tab].map((row) => <li key={row.offer.id}><OfferRow row={row} now={now} /></li>)}</ul>
          : <EmptyState title={t(`empty.${tab}.title`)} body={t(`empty.${tab}.body`)} action={{ label: t('findWork'), href: routes.app.findWork() }} />}
      </TabsContent>)}
    </Tabs>
  </div>;
}
