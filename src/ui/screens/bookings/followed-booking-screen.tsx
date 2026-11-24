import { ArrowLeft, CalendarDays, Check, Eye, MapPin, MessagesSquare, Monitor, Navigation, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type FollowedBookingView, type FollowingHandlers, type ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { backArrow, backLink, sectionTitle, surface, surfacePad } from '@/ui/components/bookings/surface';
import { LeaveFollowButton } from '@/ui/components/family/leave-follow-button';
import { PageHeader } from '@/ui/components/layout/page-header';
import { HelperCard } from '@/ui/components/people/helper-card';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus } from '@/ui/components/status/use-status';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export interface FollowedBookingScreenProps {
  data: FollowedBookingView;
  handlers: FollowingHandlers;
  now: ISODateTime;
  /** Preview seed for Stop following. */
  leaveResult?: ActionResult;
}

/**
 * A booking a family member follows (2026-11-24), read-only: where it stands and when (on its market's clock: the page
 * wraps it in `MarketTime`), the helper's public card, the day-of moments, and the way to the conversation. No address,
 * no money, no actions but "Stop following".
 */
export function FollowedBookingScreen({ data, handlers, now, leaveResult }: FollowedBookingScreenProps) {
  const t = useTranslations('family.followed');
  const card = useTranslations('taskCard');
  const { formatDate, formatDateTime, formatRelative, formatTime } = useFormat();
  const status = useBookingStatus(data.status, 'poster');
  const helperFirst = data.helper.displayName.split(' ')[0] ?? data.helper.displayName;
  const moments = [
    data.checkIn?.onMyWayAt && { at: data.checkIn.onMyWayAt, icon: Navigation, text: t('moments.onTheWay', { helper: helperFirst }) },
    data.checkIn?.arrivedAt && { at: data.checkIn.arrivedAt, icon: MapPin, text: t('moments.arrived', { helper: helperFirst }) },
    data.checkIn?.completedAt && { at: data.checkIn.completedAt, icon: Check, text: t('moments.done') },
    data.checkIn?.canceledAt && { at: data.checkIn.canceledAt, icon: X, text: t('moments.canceled') },
  ].filter((moment): moment is { at: string; icon: typeof Check; text: string } => Boolean(moment));

  return <div data-followed-booking className="mx-auto max-w-reading space-y-6">
    <div className="space-y-3">
      <Link href={routes.app.bookings()} className={backLink}><ArrowLeft aria-hidden="true" className={backArrow} />{t('back')}</Link>
      <PageHeader title={data.task.title} description={card(`categories.${data.task.categorySlug}`)}><StatusBadge {...status} /></PageHeader>
      <p role="note" className="flex items-start gap-2.5 rounded-2xl bg-secondary/70 px-4 py-3 text-sm text-secondary-foreground">
        <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{data.ended ? t('ended', { client: data.client.displayName }) : t('intro', { client: data.client.displayName, helper: helperFirst })}</span>
      </p>
    </div>

    {!data.ended && <>
      <section aria-labelledby="followed-when" className={cn(surface, surfacePad, 'space-y-4')}>
        <h2 id="followed-when" className={sectionTitle}>{t('whenWhere')}</h2>
        {/* Each pair a dt and its dds straight in one div (a list's rule): the icon is the dt's, its word for screen readers. */}
        <dl className="space-y-3 text-sm">
          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
            <dt className="row-span-2 pt-0.5 text-primary"><CalendarDays aria-hidden="true" className="size-5" /><span className="sr-only">{t('when')}</span></dt>
            <dd className="col-start-2 font-medium tabular-nums"><time dateTime={data.start}>{formatDate(data.start)} · {formatTime(data.start)}</time></dd>
            <dd className="col-start-2 text-muted-foreground tabular-nums">{formatRelative(data.start, now)}</dd>
          </div>
          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
            <dt className="row-span-2 pt-0.5 text-primary">{data.place.kind === 'remote' ? <Monitor aria-hidden="true" className="size-5" /> : <MapPin aria-hidden="true" className="size-5" />}<span className="sr-only">{t('where')}</span></dt>
            <dd className="col-start-2 font-medium">{data.place.kind === 'remote' ? t('remote') : data.place.areaName}</dd>
            {data.place.kind === 'local' && <dd className="col-start-2 text-muted-foreground">{t('addressPrivate', { client: data.client.displayName })}</dd>}
          </div>
        </dl>
      </section>

      {moments.length > 0 && <section aria-labelledby="followed-moments" className={cn(surface, surfacePad, 'space-y-3')}>
        <h2 id="followed-moments" className={sectionTitle}>{t('today')}</h2>
        <ul className="space-y-3">{moments.map((moment) => <li key={moment.text} className="flex items-start gap-3">
          <moment.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <span><span className="font-medium">{moment.text}</span> <time dateTime={moment.at} className="text-muted-foreground tabular-nums">{formatDateTime(moment.at)}</time></span>
        </li>)}</ul>
      </section>}

      <section aria-labelledby="followed-helper" className="space-y-3">
        <h2 id="followed-helper" className={sectionTitle}>{t('helper')}</h2>
        <HelperCard helper={data.helper} variant="compact" />
      </section>

      {data.threadId && <section aria-labelledby="followed-conversation" className={cn(surface, surfacePad, 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
        <div className="space-y-1">
          <h2 id="followed-conversation" className={sectionTitle}>{t('conversation.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('conversation.body', { client: data.client.displayName, helper: helperFirst })}</p>
        </div>
        <Link href={routes.app.thread(data.threadId)} className={buttonVariants({ variant: 'outline', className: 'min-h-11 shrink-0' })}><MessagesSquare aria-hidden="true" />{t('conversation.open')}</Link>
      </section>}

      {data.endsAt && <p className="text-sm text-muted-foreground tabular-nums">{t('endsAt', { date: formatDate(data.endsAt) })}</p>}
    </>}

    <LeaveFollowButton bookingId={data.id} onLeave={handlers.onLeave} {...(leaveResult ? { initialResult: leaveResult } : {})} />
  </div>;
}
