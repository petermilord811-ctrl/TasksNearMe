import Link from 'next/link';
import { ArrowLeftRight, CalendarCheck, CalendarPlus, CheckCheck, ChevronRight, CircleAlert, ClipboardCheck, Clock, CreditCard, DoorOpen, MessageCircle, MessagesSquare, RefreshCw, UserRoundPlus, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AttentionItem, AttentionKind } from '@/contracts';
import { formatDate, formatDateTime, formatTime } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { cn } from '@/ui/lib/utils';
import { attentionHref } from '@/ui/lib/attention-href';

const icons: Record<AttentionKind, LucideIcon> = {
  approve_work: ClipboardCheck,
  review_offers: MessagesSquare,
  finish_payment: CreditCard,
  answer_cant_access: DoorOpen,
  unread_messages: MessageCircle,
  check_in_today: CalendarCheck,
  reconfirm_offer: RefreshCw,
  finish_setup: UserRoundPlus,
  payout_action_needed: CircleAlert,
  answer_invite: CalendarPlus,
  answer_counter: ArrowLeftRight,
  answer_proposal: CalendarPlus,
};

function AttentionRow({ item }: { item: AttentionItem }) {
  const t = useTranslations('home');
  const Icon = icons[item.kind];
  const payout = item.kind === 'payout_action_needed';
  const setup = item.kind === 'finish_setup';
  const named = item.actorName !== undefined && (item.kind === 'answer_invite' || item.kind === 'answer_counter' || item.kind === 'answer_proposal');
  const headline = named
    ? `named.${item.kind}`
    : item.kind === 'review_offers' && item.count === undefined
      ? 'reviewOffersWithoutCount'
      : item.kind === 'unread_messages' && item.count === undefined
        ? 'messagesWithoutCount'
        : item.kind;
  const deadlineKey = item.kind === 'approve_work' ? 'approvalDeadline'
    : item.kind === 'finish_payment' ? 'paymentDeadline'
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
        <span className="block text-sm leading-6 text-muted-foreground">{t(`attention.body.${item.kind}`)}</span>
        {item.dueAt && <span className="flex items-start gap-1.5 pt-0.5 text-sm font-medium tabular-nums">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <time dateTime={item.dueAt}>{item.kind === 'check_in_today'
            ? t('attention.startTime', { time: formatTime(item.dueAt), date: formatDate(item.dueAt) })
            : t(`attention.${deadlineKey}`, { deadline: formatDateTime(item.dueAt) })}</time>
        </span>}
      </span>
      <ChevronRight aria-hidden="true" className="mt-2.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  </li>;
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const t = useTranslations('home');
  return items.length > 0
    ? <ul className="overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] [&>li+li]:border-t [&>li+li]:border-foreground/[0.07] dark:[&>li+li]:border-white/[0.06]">{items.map((item) => <AttentionRow key={item.id} item={item} />)}</ul>
    : <EmptyState headingLevel={3} title={t('empty.attention.title')} body={t('empty.attention.body')} icon={<CheckCheck className="size-6" />} />;
}
