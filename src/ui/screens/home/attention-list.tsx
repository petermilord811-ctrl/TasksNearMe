import Link from 'next/link';
import { CalendarCheck, CheckCheck, ChevronRight, CircleAlert, ClipboardCheck, CreditCard, DoorOpen, MessageCircle, MessagesSquare, RefreshCw, UserRoundPlus, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AttentionItem, type AttentionKind, type AttentionTarget } from '@/contracts';
import { formatDate, formatDateTime, formatTime } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { cn } from '@/ui/lib/utils';

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
};

function attentionHref(target: AttentionTarget): string {
  switch (target.kind) {
    case 'booking': return routes.app.booking(target.bookingId);
    case 'task': return routes.app.task(target.taskId);
    case 'thread': return routes.app.thread(target.threadId);
    case 'messages': return routes.app.messages();
    case 'find_work_task': return routes.app.findWorkTask(target.taskId);
    case 'onboarding': return routes.app.helperOnboarding(target.step);
    case 'earnings': return routes.app.earnings();
  }
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const t = useTranslations('home');
  const Icon = icons[item.kind];
  const payout = item.kind === 'payout_action_needed';
  const setup = item.kind === 'finish_setup';
  const headline = item.kind === 'review_offers' && item.count === undefined
    ? 'reviewOffersWithoutCount'
    : item.kind === 'unread_messages' && item.count === undefined
      ? 'messagesWithoutCount'
      : item.kind;
  const deadlineKey = item.kind === 'approve_work' ? 'approvalDeadline'
    : item.kind === 'finish_payment' ? 'paymentDeadline'
      : item.kind === 'answer_cant_access' ? 'answerDeadline' : 'deadline';

  return <li>
    <Link href={attentionHref(item.target)} className={cn(
      'group flex min-h-11 items-start gap-3 p-4 transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px] md:gap-4 md:p-5',
      payout && 'border-l-4 border-l-destructive bg-badge-danger',
      setup && 'border-l-4 border-l-warning bg-badge-warning',
    )}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground', payout && 'bg-card text-destructive', setup && 'bg-card text-warning')}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1 space-y-1 break-words">
        <span className={cn('block font-semibold tabular-nums group-hover:underline underline-offset-4', payout && 'text-badge-danger-foreground', setup && 'text-badge-warning-foreground')}>
          {t(`attention.${headline}`, { title: item.title ?? t('attention.taskFallback'), count: item.count ?? 0 })}
        </span>
        <span className="block text-sm leading-6 text-muted-foreground">{t(`attention.body.${item.kind}`)}</span>
        {item.dueAt && <span className="block text-sm font-medium tabular-nums">
          <time dateTime={item.dueAt}>{item.kind === 'check_in_today'
            ? t('attention.startTime', { time: formatTime(item.dueAt), date: formatDate(item.dueAt) })
            : t(`attention.${deadlineKey}`, { deadline: formatDateTime(item.dueAt) })}</time>
        </span>}
      </span>
      <ChevronRight aria-hidden="true" className="mt-2.5 size-5 shrink-0 text-muted-foreground" />
    </Link>
  </li>;
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const t = useTranslations('home');
  return items.length > 0
    ? <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-card [&>li+li]:border-t">{items.map((item) => <AttentionRow key={item.id} item={item} />)}</ul>
    : <EmptyState headingLevel={3} title={t('empty.attention.title')} body={t('empty.attention.body')} icon={<CheckCheck className="size-6" />} />;
}
