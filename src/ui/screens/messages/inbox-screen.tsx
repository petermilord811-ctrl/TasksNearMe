import Link from 'next/link';
import { ChevronRight, MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type InboxPageData, type ISODateTime, type ThreadSummary } from '@/contracts';
import { formatDateTime, formatHours, formatMoney, formatRelative, formatTime } from '@/shared/format';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export interface InboxScreenProps {
  data: InboxPageData;
  now: ISODateTime;
}

function InboxMessage({ message }: { message: NonNullable<ThreadSummary['lastMessage']> }) {
  const t = useTranslations('inbox');
  const timeline = useTranslations('timeline');
  if (message.kind === 'text' || !message.event) {
    return <>{message.sender === 'me' && <span>{t('youPrefix')}</span>}<MaskedText segments={message.preview} /></>;
  }
  const params = message.event.params;
  return <>{timeline(message.event.type, {
    hasAmount: params?.amountCents !== undefined ? 'yes' : 'no', amount: params?.amountCents !== undefined ? formatMoney(params.amountCents) : '',
    hasMinutes: params?.minutes !== undefined ? 'yes' : 'no', minutes: params?.minutes ?? 0,
    hasHours: params?.hours !== undefined ? 'yes' : 'no', hours: params?.hours !== undefined ? formatHours(params.hours) : '',
    hasTime: params?.at !== undefined ? 'yes' : 'no', time: params?.at !== undefined ? formatTime(params.at) : '',
  })}</>;
}

/**
 * Messages: one row per conversation, newest first (as supplied). The person and how long ago sit on the first
 * line, the kind and anything unread under it, then the task and the last message. Unread conversations read
 * a little stronger.
 */
export function InboxScreen({ data, now }: InboxScreenProps) {
  const t = useTranslations('inbox');

  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    {data.threads.length === 0 ? <div className="space-y-3">
      <EmptyState title={t('empty.title')} body={t('empty.body')} icon={<MessagesSquare className="size-6" />} action={{ label: t('viewTasks'), href: routes.app.tasks() }} />
      <div className="flex justify-center"><Link href={routes.app.findWork()} className={buttonVariants({ variant: 'outline' })}>{t('findWork')}</Link></div>
    </div> : <ul aria-label={t('conversations')} className="divide-y divide-foreground/[0.07] overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:divide-white/[0.06] dark:border-white/[0.06]">
      {data.threads.map((thread) => {
        const unread = thread.unreadCount > 0;
        return <li key={thread.id}>
          <Link href={routes.app.thread(thread.id)} className="group flex min-w-0 gap-3 p-4 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:gap-4 sm:px-6 sm:py-5 dark:hover:bg-white/[0.03]">
            <span className="relative shrink-0">
              <InitialsAvatar initials={thread.otherParty.initials} />
              {unread && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <h2 className={cn('min-w-0 truncate text-[17px]/6 group-hover:text-primary', unread ? 'font-bold' : 'font-semibold')}>{thread.otherParty.displayName}</h2>
                {thread.lastMessage && <time dateTime={thread.lastMessage.createdAt} title={formatDateTime(thread.lastMessage.createdAt)} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  <span className="sr-only">{formatDateTime(thread.lastMessage.createdAt)} · </span>{formatRelative(thread.lastMessage.createdAt, now)}
                </time>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral" label={t(`kinds.${thread.kind}`)} />
                {unread && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">{t('unread', { count: thread.unreadCount })}</span>}
              </div>
              <p className="break-words text-sm font-medium">{thread.title}</p>
              <p className={cn('line-clamp-2 text-sm leading-6 [overflow-wrap:anywhere]', unread ? 'text-foreground' : 'text-muted-foreground')}>
                {thread.lastMessage ? <InboxMessage message={thread.lastMessage} /> : t('noMessage')}
              </p>
            </div>
            <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        </li>;
      })}
    </ul>}
  </div>;
}
