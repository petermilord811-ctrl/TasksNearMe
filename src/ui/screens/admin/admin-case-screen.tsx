import type { ComponentProps } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LockKeyhole, MessageSquare, UserRound } from 'lucide-react';
import type { AdminCaseActor, AdminCaseBookingSummary, AdminCaseEventView, AdminCaseHandlers, AdminCasePageData, CaseStatus, ISODateTime, Photo } from '@/contracts';
import { routes } from '@/contracts';
import { formatDateTime, formatMoney, formatRelative } from '@/shared/format';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus, useCaseStatus } from '@/ui/components/status/use-status';
import { CasePhoto } from '@/ui/components/support/case-photo';
import { cn } from '@/ui/lib/utils';
import { AdminResponseTarget } from './admin-response-target';
import { AdminCaseControls } from './admin-case-controls';
import { AdminConversationGate } from './admin-conversation-gate';
import { AdminReportedReview } from './admin-reported-review';

export interface AdminCaseScreenProps {
  data: AdminCasePageData;
  handlers: AdminCaseHandlers;
  now: ISODateTime;
}

function Photos({ photos, sender }: { photos: Photo[]; sender: string }) {
  const t = useTranslations('adminCase.details');
  return photos.length > 0 && <ul aria-label={t('photos')} className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
    {photos.map((photo, index) => <li key={photo.id}><CasePhoto photo={photo} number={index + 1} count={photos.length} sender={sender} /></li>)}
  </ul>;
}

function CaseBadge({ status }: { status: CaseStatus }) {
  return <StatusBadge {...useCaseStatus(status)} />;
}

function Booking({ booking }: { booking: AdminCaseBookingSummary }) {
  const t = useTranslations('adminCase.details');
  const status = useBookingStatus(booking.status, 'staff');
  return <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <h2 className="text-xl font-semibold">{t('booking')}</h2>
    <Link href={routes.admin.booking(booking.id)} className="inline-flex min-h-11 items-center rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{booking.title}</Link>
    <StatusBadge {...status} />
    <dl className="space-y-2 text-sm">
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t('start')}</dt><dd className="tabular-nums"><time dateTime={booking.start}>{formatDateTime(booking.start)}</time></dd></div>
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t('price')}</dt><dd className="font-semibold tabular-nums">{formatMoney(booking.priceCents)}</dd></div>
    </dl>
  </section>;
}

function useActorName(actor: AdminCaseActor) {
  const t = useTranslations('adminCase.details');
  return actor.kind === 'member' ? actor.person.displayName : actor.kind === 'staff' ? actor.staff.displayName : t('system');
}

function CaseEvent({ event, parties, now }: { event: AdminCaseEventView; parties: AdminCasePageData['parties']; now: ISODateTime }) {
  const t = useTranslations('adminCase');
  const actor = useActorName(event.actor);
  const party = parties.find(({ person }) => person.id === event.partyId)?.person;
  const personName = party?.displayName ?? (event.actor.kind === 'member' ? event.actor.person.displayName : t('details.caseMember'));
  const note = event.kind === 'note' || event.kind === 'review';
  return <li className="relative min-w-0 pl-6 before:absolute before:top-3 before:left-0 before:size-2 before:rounded-full before:bg-border">
    <article className={cn('space-y-2 rounded-lg border p-3 sm:p-4', note ? 'border-warning/30 bg-badge-warning' : 'bg-card')}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="flex items-center gap-2 font-semibold">{note && <LockKeyhole aria-hidden="true" className="size-4 text-badge-warning-foreground" />}{event.kind === 'message' && <MessageSquare aria-hidden="true" className="size-4 text-primary" />}{event.kind === 'review' ? t(event.reviewAction === 'shown' ? 'details.events.reviewShown' : 'details.events.reviewHidden') : note ? t('details.internalNote') : event.kind === 'message' ? t(event.actor.kind === 'member' ? 'details.from' : 'details.to', { name: personName }) : t(`details.events.${event.kind}`)}</p>
        <time dateTime={event.at} title={formatRelative(event.at, now)} className="tabular-nums text-muted-foreground">{formatDateTime(event.at)}</time>
      </div>
      <p className="text-sm text-muted-foreground">{actor}</p>
      {event.kind === 'status' && event.status && <CaseBadge status={event.status} />}
      {event.kind === 'assignment' && <p className="text-sm">{event.assignee ? t('details.assignedTo', { name: event.assignee.displayName }) : t('details.unassigned')}</p>}
      {event.kind === 'resolution' && event.resolution && <p className="text-sm font-medium">{t(`resolutions.${event.resolution}`)}</p>}
      {event.body && <p className="whitespace-pre-wrap text-sm leading-6">{event.body}</p>}
      {event.photos && <Photos photos={event.photos} sender={actor} />}
    </article>
  </li>;
}

export function AdminCaseScreen(props: AdminCaseScreenProps) {
  return <AdminCaseContent {...props} />;
}

/** Preview seeds are kept separate from the screen's application-facing props. */
export function AdminCaseContent({ data, handlers, now, initialDialog, replyState, resolutionState, conversationState }: AdminCaseScreenProps & {
  initialDialog?: ComponentProps<typeof AdminCaseControls>['initialDialog'];
  replyState?: ComponentProps<typeof AdminCaseControls>['replyState'];
  resolutionState?: ComponentProps<typeof AdminCaseControls>['resolutionState'];
  conversationState?: Pick<ComponentProps<typeof AdminConversationGate>, 'initialConversation' | 'initialOpen' | 'initialResult'>;
}) {
  const t = useTranslations('adminCase');
  const list = useTranslations('adminCases');
  const problem = useTranslations('reportProblem');
  const safety = useTranslations('safety');
  const row = data.case;
  const reason = row.reason && (t.has(`details.reasons.${row.reason}`) ? t(`details.reasons.${row.reason}`) : problem.has(`reasons.${row.reason}`) ? problem(`reasons.${row.reason}`) : safety.has(`reasons.${row.reason}`) ? safety(`reasons.${row.reason}`) : t('details.otherReason'));

  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">{list(`types.${row.type}`)}</span><span className="rounded-full border px-2.5 py-1 font-medium">{list(`priorities.${row.priority}`)}</span><CaseBadge status={row.status} />{row.awaitingReply && <span className="font-semibold text-primary">{t('details.newReply')}</span>}</div>
      <PageHeader title={row.subject} />
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="space-y-1"><p className="flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 text-muted-foreground" />{row.assignee ? t('details.assignedTo', { name: row.assignee.displayName }) : t('details.unassigned')}</p><p className="tabular-nums text-muted-foreground">{t('details.opened', { at: formatDateTime(row.openedAt) })}</p></div>
        <AdminResponseTarget slaDueAt={row.slaDueAt} slaBreached={row.slaBreached} now={now} />
      </div>
    </div>
    <AdminCaseControls key={row.id} data={data} handlers={handlers} initialDialog={initialDialog} replyState={replyState} resolutionState={resolutionState}>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-xl font-semibold">{t('details.opening')}</h2>
            {reason && <p className="text-sm font-medium">{t('details.reason', { reason })}</p>}
            {row.description && <p className="whitespace-pre-wrap leading-6">{row.description}</p>}
            <Photos photos={row.photos} sender={row.openedBy.displayName} />
          </section>
          {row.resolution && <section className="space-y-3 rounded-xl border border-success/30 bg-card p-4 sm:p-5">
            <h2 className="text-xl font-semibold">{t('details.resolution')}</h2>
            <p className="font-medium">{t(`resolutions.${row.resolution.type}`)}</p>
            <p className="whitespace-pre-wrap text-sm leading-6">{row.resolution.summary}</p>
            <time dateTime={row.resolution.at} className="block text-sm tabular-nums text-muted-foreground">{formatDateTime(row.resolution.at)}</time>
          </section>}
          {data.context && <AdminConversationGate key={row.id} context={data.context} onRevealConversation={handlers.onRevealConversation} now={now} {...conversationState} />}
          {data.review && <AdminReportedReview key={`${row.id}:${data.review.status}`} data={data.review} onModerate={handlers.onModerateReview} />}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t('details.timeline')}</h2>
            {data.events.length ? <ol aria-label={t('details.timeline')} className="space-y-3">{data.events.map((event) => <CaseEvent key={event.id} event={event} parties={data.parties} now={now} />)}</ol> : <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{t('details.emptyTimeline')}</p>}
          </section>
        </div>
        <div className="min-w-0 space-y-5 max-xl:row-start-1">
          <section className="space-y-3 rounded-xl border bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-xl font-semibold">{t('details.people')}</h2>
            <ul className="divide-y">{data.parties.map(({ person, role }) => <li key={person.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{person.initials}</span>
              <div className="min-w-0 space-y-1"><p className="text-sm font-semibold">{person.displayName}</p><p className="text-sm text-muted-foreground">{t(`details.roles.${role}`)}</p>{role !== 'opener' && person.id === row.openedBy.id && <p className="text-sm text-muted-foreground">{t('details.roles.opener')}</p>}</div>
            </li>)}</ul>
          </section>
          {data.booking && <Booking booking={data.booking} />}
          {data.taskId && <Link href={routes.admin.task(data.taskId)} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('details.openTask')}</Link>}
        </div>
      </div>
    </AdminCaseControls>
  </div>;
}
