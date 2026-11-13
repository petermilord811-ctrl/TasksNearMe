'use client';

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlarmClock, ArrowLeftRight, BadgeCheck, CalendarClock, CalendarOff, CirclePause, CirclePlay, CreditCard, LifeBuoy, Repeat, SkipForward, UserSearch, ShieldAlert, ShieldCheck, CalendarCheck, CalendarPlus, CalendarX, CheckCheck, ChevronRight, CircleAlert, CircleCheck, CircleDollarSign, ClipboardCheck, ClipboardPenLine, Clock, DoorOpen, Download, HandCoins, Headset, Hourglass, MapPin, MessageCircle, MessageSquarePlus, Navigation, RefreshCw, RotateCcw, Star, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult, ISODateTime, NotificationHandlers, NotificationType, NotificationView } from '@/contracts';
import { formatMoney, marketLocalToUtc } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { attentionHref } from '@/ui/lib/attention-href';
import { useFormat, type Formatters } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const icons: Record<NotificationType, LucideIcon> = {
  offer_received: MessageSquarePlus,
  offer_updated: RefreshCw,
  offer_declined: X,
  booking_confirmed: CalendarCheck,
  booking_canceled: CalendarX,
  helper_on_the_way: Navigation,
  helper_running_late: Clock,
  helper_arrived: MapPin,
  cant_access: DoorOpen,
  work_submitted: ClipboardCheck,
  work_approved: CheckCheck,
  problem_reported: CircleAlert,
  earnings_transferred: CircleDollarSign,
  payout_paid: CircleDollarSign,
  tip_received: HandCoins,
  review_published: Star,
  message_received: MessageCircle,
  support_replied: Headset,
  case_resolved: CircleCheck,
  change_proposed: ClipboardPenLine,
  change_applied: ClipboardCheck,
  invite_received: CalendarPlus,
  invite_countered: ArrowLeftRight,
  invite_accepted: CalendarCheck,
  rebook_proposed: CalendarPlus,
  rebook_accepted: CalendarCheck,
  rebook_declined: CalendarX,
  task_reopened: RotateCcw,
  approval_reminder: Hourglass,
  booking_reminder: AlarmClock,
  verification_passed: ShieldCheck,
  verification_action_needed: ShieldAlert,
  background_check_expiring: CalendarClock,
  helper_ready: BadgeCheck,
  task_match: MapPin,
  data_export_ready: Download,
  series_started: Repeat,
  series_visit_skipped: SkipForward,
  series_paused: CirclePause,
  series_resumed: CirclePlay,
  series_stopped: CalendarOff,
  scheduled_payment_failed: CreditCard,
  replacement_needed: LifeBuoy,
  replacement_search_started: UserSearch,
};

/** A notification's moment ("Tue, Dec 1, 9:00 am") or day ("Dec 8"), for its words. */
function notificationDate(params: NotificationView['params'], { formatDate, formatDateTime }: Formatters): string {
  if (params?.at) return formatDateTime(params.at);
  return params?.day ? formatDate(marketLocalToUtc(params.day, '12:00')) : '';
}

function NotificationRow({ notification, onOpen, now, navigationRequestRef }: {
  notification: NotificationView;
  onOpen: NotificationHandlers['onOpen'];
  now: ISODateTime;
  navigationRequestRef: RefObject<number>;
}) {
  const t = useTranslations('notifications');
  const format = useFormat();
  const { formatDateTime, formatRelative } = format;
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const Icon = icons[notification.type];
  const href = attentionHref(notification.target);
  const unread = !notification.readAt;

  async function open(event: MouseEvent<HTMLAnchorElement>) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!modified) event.preventDefault();
    if (locked.current) return;
    const request = modified ? undefined : ++navigationRequestRef.current;
    locked.current = true;
    setPending(true);
    let result: ActionResult | undefined;
    try {
      result = await onOpen({ notificationId: notification.id });
    } catch {
      // Reading a notification must never prevent opening its destination.
    } finally {
      locked.current = false;
      setPending(false);
      if (request !== undefined && request === navigationRequestRef.current) router.push(result?.ok && result.redirectTo ? result.redirectTo : href);
    }
  }

  return <li>
    <Link href={href} onClick={open} aria-busy={pending} aria-disabled={pending || undefined} className={cn(
      'group flex min-h-11 items-start gap-3 p-4 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px] md:gap-4 md:px-5 md:py-4.5 dark:hover:bg-white/[0.03]',
      unread && 'bg-secondary/40 hover:bg-secondary/55',
    )}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"><Icon aria-hidden="true" className="size-5" /></span>
      <span className="min-w-0 flex-1 space-y-1.5 break-words">
        <span className={cn('block leading-6 group-hover:underline underline-offset-4', unread && 'font-semibold')}>
          {t(`types.${notification.type}`, {
            title: notification.title ?? t('taskFallback'),
            actorName: notification.actorName ?? t('actorFallback'),
            hasAmount: notification.params?.amountCents === undefined ? 'no' : 'yes',
            amount: notification.params?.amountCents === undefined ? '' : formatMoney(notification.params.amountCents),
            hasMinutes: notification.params?.minutes === undefined ? 'no' : 'yes',
            minutes: notification.params?.minutes ?? 0,
            hasHours: notification.params?.hours === undefined ? 'no' : 'yes',
            hours: notification.params?.hours ?? 0,
            days: notification.params?.days ?? 0,
            track: notification.params?.track ?? 'other',
            hasDate: notification.params?.at === undefined && notification.params?.day === undefined ? 'no' : 'yes',
            date: notificationDate(notification.params, format),
            by: notification.params?.by ?? 'other',
          })}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5">
          {/* How long ago, with the full date and time on hover and for screen readers. */}
          <time dateTime={notification.createdAt} title={formatDateTime(notification.createdAt)} className="tabular-nums text-muted-foreground">
            {formatRelative(notification.createdAt, now)}<span className="sr-only"> · {formatDateTime(notification.createdAt)}</span>
          </time>
          {unread && <span className="inline-flex items-center gap-1.5 font-medium text-secondary-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />{t('unread')}</span>}
        </span>
        <span aria-live="polite" className={pending ? 'block text-sm text-muted-foreground' : 'sr-only'}>{pending ? t('opening') : ''}</span>
      </span>
      {pending ? <Spinner aria-hidden="true" className="mt-2.5 size-5 shrink-0" /> : <ChevronRight aria-hidden="true" className="mt-2.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />}
    </Link>
  </li>;
}

export function NotificationList({ notifications, onOpen, now }: {
  notifications: NotificationView[];
  onOpen: NotificationHandlers['onOpen'];
  now: ISODateTime;
}) {
  const navigationRequestRef = useRef(0);
  useEffect(() => () => { navigationRequestRef.current += 1; }, []);
  return <ul className="overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] [&>li+li]:border-t [&>li+li]:border-foreground/[0.07] dark:[&>li+li]:border-white/[0.06]">
    {notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} onOpen={onOpen} now={now} navigationRequestRef={navigationRequestRef} />)}
  </ul>;
}

export function MarkAllRead({ onMarkAllRead, hasUnread }: Pick<NotificationHandlers, 'onMarkAllRead'> & { hasUnread: boolean }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();

  async function markAllRead() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try { next = await onMarkAllRead(); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok) {
      if (next.redirectTo) router.push(next.redirectTo);
      else router.refresh();
    }
  }

  if (!hasUnread && !pending && !result) return null;

  return <div className="space-y-3">
    {(hasUnread || pending) && <Button type="button" variant="outline" disabled={pending} aria-busy={pending} onClick={markAllRead}>
      {pending ? <Spinner aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}{t(pending ? 'markingRead' : 'markAllRead')}
    </Button>}
    <FormFeedback result={result} successMessage={t('markedRead')} errorMessage={result && !result.ok && result.code === 'unknown' ? t('markError') : undefined} />
  </div>;
}
