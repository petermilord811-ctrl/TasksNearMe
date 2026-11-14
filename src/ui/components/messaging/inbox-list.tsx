'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ISODateTime, ThreadSummary } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

export const INBOX_FILTERS = ['all', 'unread', 'offers', 'bookings'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

/** Which conversations a filter keeps, and whether a search matches (the other person's name or the task). */
export function keepThread(thread: ThreadSummary, filter: InboxFilter, query: string): boolean {
  if (filter === 'unread' && thread.unreadCount === 0) return false;
  if (filter === 'offers' && thread.kind !== 'offer' && thread.kind !== 'invite') return false;
  if (filter === 'bookings' && thread.kind !== 'booking' && thread.kind !== 'series') return false;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${thread.otherParty.displayName} ${thread.title}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function LastMessage({ message }: { message: NonNullable<ThreadSummary['lastMessage']> }) {
  const { formatTime } = useFormat();
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
 * The conversations (completion plan 7.3): filters (all, unread, offers, bookings) and a search over names and
 * tasks that answer as you type, then one row per conversation, newest first. `pane` is the narrow list beside an
 * open conversation on wide screens, with the open one marked.
 */
export function InboxList({ threads, now, currentId, variant = 'full' }: { threads: ThreadSummary[]; now: ISODateTime; currentId?: string; variant?: 'full' | 'pane' }) {
  const t = useTranslations('inbox');
  const { formatDateTime, formatRelative } = useFormat();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => threads.filter((thread) => keepThread(thread, filter, query)), [threads, filter, query]);
  const pane = variant === 'pane';
  const unreadTotal = threads.reduce((sum, thread) => sum + (thread.unreadCount > 0 ? 1 : 0), 0);

  return <div className={cn('flex min-h-0 flex-col', pane ? 'h-full' : 'space-y-3')}>
    <div className={cn('space-y-2', pane && 'border-b border-foreground/[0.07] p-3 dark:border-white/[0.06]')}>
      <label className="relative block">
        <span className="sr-only">{t('search.label')}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search.placeholder')} className="h-10 w-full rounded-xl border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
      </label>
      <div role="group" aria-label={t('filters.label')} className="flex flex-wrap gap-1.5">
        {INBOX_FILTERS.map((option) => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={cn('inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', filter === option ? 'border-primary/40 bg-brand-soft text-foreground' : 'border-foreground/[0.1] bg-card text-muted-foreground hover:text-foreground dark:border-white/[0.1]')}>
          {filter === option && <Check aria-hidden="true" className="size-3.5" />}{t(`filters.${option}`)}{option === 'unread' && unreadTotal > 0 && <span className="tabular-nums">({unreadTotal})</span>}
        </button>)}
      </div>
    </div>
    <p role="status" className="sr-only">{t('shown', { count: shown.length })}</p>
    {shown.length === 0
      ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('noMatch')}</p>
      : <ul aria-label={t('conversations')} className={cn('divide-y divide-foreground/[0.07] dark:divide-white/[0.06]', pane ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : 'overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]')}>
        {shown.map((thread) => {
          const unread = thread.unreadCount > 0;
          const current = thread.id === currentId;
          return <li key={thread.id}>
            <Link href={routes.app.thread(thread.id)} aria-current={current ? 'page' : undefined} className={cn(
              'group flex min-w-0 gap-3 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:hover:bg-white/[0.03]',
              pane ? 'px-3 py-3' : 'p-4 sm:gap-4 sm:px-6 sm:py-5',
              current && 'bg-brand-soft/60 hover:bg-brand-soft/70',
            )}>
              <span className="relative shrink-0">
                <InitialsAvatar initials={thread.otherParty.initials} size={pane ? 'sm' : 'md'} />
                {unread && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 items-baseline justify-between gap-2">
                  <h2 className={cn('min-w-0 truncate group-hover:text-primary', pane ? 'text-sm' : 'text-[17px]/6', unread ? 'font-bold' : 'font-semibold')}>{thread.otherParty.displayName}</h2>
                  {thread.lastMessage && <time dateTime={thread.lastMessage.createdAt} title={formatDateTime(thread.lastMessage.createdAt)} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <span className="sr-only">{formatDateTime(thread.lastMessage.createdAt)} · </span>{formatRelative(thread.lastMessage.createdAt, now)}
                  </time>}
                </div>
                <p className={cn('flex min-w-0 items-center gap-1.5 text-xs', pane ? '' : 'sm:text-sm')}>
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px font-medium text-secondary-foreground">{t(`kinds.${thread.kind}`)}</span>
                  <span className="truncate font-medium">{thread.title}</span>
                  {unread && <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-px font-semibold text-primary-foreground tabular-nums">{t('unread', { count: thread.unreadCount })}</span>}
                </p>
                <p className={cn('text-sm leading-5 [overflow-wrap:anywhere]', pane ? 'line-clamp-1' : 'line-clamp-2 leading-6', unread ? 'text-foreground' : 'text-muted-foreground')}>
                  {thread.lastMessage ? <LastMessage message={thread.lastMessage} /> : t('noMessage')}
                </p>
              </div>
              {!pane && <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />}
            </Link>
          </li>;
        })}
      </ul>}
  </div>;
}
