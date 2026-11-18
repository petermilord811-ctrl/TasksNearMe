import Link from 'next/link';
import { ArrowLeftRight, CalendarCheck, CalendarPlus, ChevronRight, CircleAlert, ClipboardCheck, Clock, CreditCard, DoorOpen, ListChecks, MessageCircle, MessagesSquare, RefreshCw, UserRoundPlus, UserSearch, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AttentionItem, AttentionKind, ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { attentionHref } from '@/ui/lib/attention-href';
import { MoreItems } from './more-items';

const icons: Record<AttentionKind, LucideIcon> = {
  approve_work: ClipboardCheck,
  review_offers: MessagesSquare,
  finish_payment: CreditCard,
  retry_payment: CreditCard,
  answer_cant_access: DoorOpen,
  unread_messages: MessageCircle,
  check_in_today: CalendarCheck,
  reconfirm_offer: RefreshCw,
  finish_setup: UserRoundPlus,
  payout_action_needed: CircleAlert,
  answer_invite: CalendarPlus,
  answer_counter: ArrowLeftRight,
  answer_proposal: CalendarPlus,
  choose_offer: ListChecks,
  no_offers: UserSearch,
};

function AttentionRow({ item, now }: { item: AttentionItem; now?: ISODateTime }) {
  const { formatDate, formatDateTime, formatTime } = useFormat();
  const t = useTranslations('home');
  const Icon = icons[item.kind];
  // Money that didn't go through (a payout, or a charge for a booking paid later) stands out: something is lost if it waits.
  const payout = item.kind === 'payout_action_needed' || item.kind === 'retry_payment';
  const setup = item.kind === 'finish_setup';
  const named = item.actorName !== undefined && (item.kind === 'answer_invite' || item.kind === 'answer_counter' || item.kind === 'answer_proposal');
  // A check-in whose start has passed says so (audit M51), rather than "starts today".
  const late = item.kind === 'check_in_today' && item.dueAt !== undefined && now !== undefined && Date.parse(item.dueAt) < Date.parse(now);
  const headline = late ? 'check_in_late' : named
    ? `named.${item.kind}`
    : item.kind === 'review_offers' && item.count === undefined
      ? 'reviewOffersWithoutCount'
      : item.kind === 'unread_messages' && item.count === undefined
        ? 'messagesWithoutCount'
        : item.kind;
  const deadlineKey = item.kind === 'approve_work' ? 'approvalDeadline'
    : item.kind === 'finish_payment' ? 'paymentDeadline'
    : item.kind === 'retry_payment' ? 'retryDeadline'
    : item.kind === 'choose_offer' ? 'chooseDeadline'
      : item.kind === 'answer_cant_access' || item.kind === 'answer_invite' || item.kind === 'answer_counter' || item.kind === 'answer_proposal' ? 'answerDeadline' : 'deadline';

  return <li>
    <Link href={attentionHref(item.target)} className={cn(
      'group flex min-h-11 items-start gap-3 p-4 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px] md:gap-4 md:px-5 md:py-4.5 dark:hover:bg-white/[0.03]',
      payout && 'border-l-4 border-l-destructive bg-badge-danger hover:bg-badge-danger',
      setup && 'border-l-4 border-l-warning bg-badge-warning hover:bg-badge-warning',
    )}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none', payout && 'bg-card text-destructive', setup && 'bg-card text-warning')}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1 space-y-1 break-words">
        <span className={cn('block font-semibold tabular-nums group-hover:underline underline-offset-4', payout && 'text-badge-danger-foreground', setup && 'text-badge-warning-foreground')}>
          {t(`attention.${headline}`, { title: item.title ?? t('attention.taskFallback'), count: item.count ?? 0, name: item.actorName ?? '' })}
        </span>
        <span className="block text-sm leading-6 text-muted-foreground">{t(`attention.body.${late ? 'check_in_late' : item.kind}`)}</span>
        {item.dueAt && <span className="flex items-start gap-1.5 pt-0.5 text-sm font-medium tabular-nums">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <time dateTime={item.dueAt}>{item.kind === 'check_in_today'
            ? t(late ? 'attention.startedAt' : 'attention.startTime', { time: formatTime(item.dueAt), date: formatDate(item.dueAt) })
            : t(`attention.${deadlineKey}`, { deadline: formatDateTime(item.dueAt) })}</time>
        </span>}
      </span>
      <ChevronRight aria-hidden="true" className="mt-2.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  </li>;
}

/** How many items show before "Show N more": the most urgent, so the lists stay near the first screen (audit M15, M17). */
export const ATTENTION_SHOWN = 3;
const ROWS = '[&>li+li]:border-t [&>li+li]:border-foreground/[0.07] dark:[&>li+li]:border-white/[0.06]';

/** What needs the person, most urgent first (the dashboard says "You're all caught up" itself when there's nothing). */
export function AttentionList({ items, now }: { items: AttentionItem[]; now?: ISODateTime }) {
  const t = useTranslations('home.attention');
  const row = (item: AttentionItem) => <AttentionRow key={item.id} item={item} {...(now ? { now } : {})} />;
  const rest = items.slice(ATTENTION_SHOWN);
  return <div className="overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]">
    <ul className={ROWS}>{items.slice(0, ATTENTION_SHOWN).map(row)}</ul>
    {rest.length > 0 && <MoreItems more={t('more', { count: rest.length })} fewer={t('fewer')}>
      <ul className={cn(ROWS, 'border-t border-foreground/[0.07] dark:border-white/[0.06]')}>{rest.map(row)}</ul>
    </MoreItems>}
  </div>;
}
