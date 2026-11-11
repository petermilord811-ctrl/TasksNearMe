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

export function InboxScreen({ data, now }: InboxScreenProps) {
  const t = useTranslations('inbox');

  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    {data.threads.length === 0 ? <div className="space-y-3">
      <EmptyState title={t('empty.title')} body={t('empty.body')} icon={<MessagesSquare className="size-6" />} action={{ label: t('viewTasks'), href: routes.app.tasks() }} />
      <div className="flex justify-center"><Link href={routes.app.findWork()} className={buttonVariants({ variant: 'outline' })}>{t('findWork')}</Link></div>
    </div> : <ul aria-label={t('conversations')} className="divide-y divide-border overflow-hidden rounded-xl border bg-card shadow-card">
      {data.threads.map((thread) => <li key={thread.id}>
        <Link href={routes.app.thread(thread.id)} className="group flex min-w-0 gap-3 p-4 transition-colors hover:bg-accent focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:gap-4 sm:p-6">
          <InitialsAvatar initials={thread.otherParty.initials} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="min-w-0 break-words text-[17px]/6 font-semibold group-hover:text-primary">{thread.otherParty.displayName}</h2>
              <StatusBadge tone="neutral" label={t(`kinds.${thread.kind}`)} />
              {thread.unreadCount > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-sm font-semibold text-primary-foreground tabular-nums">{t('unread', { count: thread.unreadCount })}</span>}
            </div>
            <p className="break-words text-sm font-medium">{thread.title}</p>
            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {thread.lastMessage ? <InboxMessage message={thread.lastMessage} /> : t('noMessage')}
            </p>
            {thread.lastMessage && <time dateTime={thread.lastMessage.createdAt} className="block text-sm text-muted-foreground tabular-nums">
              <span>{formatDateTime(thread.lastMessage.createdAt)}</span><span aria-hidden="true"> · </span><span>{formatRelative(thread.lastMessage.createdAt, now)}</span>
            </time>}
          </div>
          <ChevronRight aria-hidden="true" className="mt-3 size-5 shrink-0 text-muted-foreground" />
        </Link>
      </li>)}
    </ul>}
  </div>;
}
