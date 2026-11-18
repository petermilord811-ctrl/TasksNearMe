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
 * tasks that answer as you type, then one row per conversation, unread ones first (audit M33). `pane` is the narrow
 * list beside an open conversation on wide screens, with the open one marked; `split` is the full list on phones and
 * that pane from 1024 px (the inbox page, beside "Choose a conversation": audit M34). On a row the person, anything
 * unread and how long ago come first, then the kind and the task on a line of their own (M39), then the last message.
 */
export function InboxList({ threads, now, currentId, variant = 'full' }: { threads: ThreadSummary[]; now: ISODateTime; currentId?: string; variant?: 'full' | 'pane' | 'split' }) {
  const t = useTranslations('inbox');
  const { formatDateTime, formatRelative } = useFormat();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => threads.filter((thread) => keepThread(thread, filter, query)), [threads, filter, query]);
  const unreadTotal = threads.reduce((sum, thread) => sum + (thread.unreadCount > 0 ? 1 : 0), 0);
  // The pane's look, always (`pane`) or from 1024 px (`split`, every class written out so Tailwind finds it).
  const as = (look: { full: string; pane: string; split: string }) => look[variant];

  return <div className={cn('flex min-h-0 flex-col', as({ full: 'space-y-3', pane: 'h-full', split: 'space-y-3 lg:h-full lg:space-y-0' }))}>
    <div className={cn('space-y-2', as({ full: '', pane: 'border-b border-foreground/[0.07] p-3 dark:border-white/[0.06]', split: 'lg:border-b lg:border-foreground/[0.07] lg:p-3 dark:lg:border-white/[0.06]' }))}>
      <label className="relative block">
        <span className="sr-only">{t('search.label')}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search.placeholder')} className="h-10 w-full rounded-xl border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40" />
      </label>
      {/* One line in the pane, sideways if it must (audit L13); wrapping where there's room. */}
      <div role="group" aria-label={t('filters.label')} className={cn('flex gap-1.5', variant !== 'full' && 'lg:gap-1', as({ full: 'flex-wrap', pane: 'flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', split: 'flex-wrap lg:flex-nowrap lg:overflow-x-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden' }))}>
        {INBOX_FILTERS.map((option) => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={cn('inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring', as({ full: 'px-3', pane: 'px-2.5', split: 'px-3 lg:px-2.5' }), filter === option ? 'border-primary/40 bg-brand-soft text-foreground' : 'border-foreground/[0.1] bg-card text-muted-foreground hover:text-foreground dark:border-white/[0.1]')}>
          {filter === option && <Check aria-hidden="true" className="size-3.5" />}{t(`filters.${option}`)}{option === 'unread' && unreadTotal > 0 && <span className="tabular-nums">({unreadTotal})</span>}
        </button>)}
      </div>
    </div>
    <p role="status" className="sr-only">{t('shown', { count: shown.length })}</p>
    {shown.length === 0
      ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('noMatch')}</p>
      : <ul aria-label={t('conversations')} className={cn('divide-y divide-foreground/[0.07] dark:divide-white/[0.06]', as({
        full: 'overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]',
        pane: 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        split: 'overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none',
      }))}>
        {shown.map((thread) => {
          const unread = thread.unreadCount > 0;
          const current = thread.id === currentId;
          return <li key={thread.id}>
            <Link href={routes.app.thread(thread.id)} aria-current={current ? 'page' : undefined} className={cn(
              'group flex min-w-0 gap-3 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:hover:bg-white/[0.03]',
              as({ full: 'px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4', pane: 'px-3 py-3', split: 'px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 lg:gap-3 lg:px-3 lg:py-3' }),
              current && 'bg-brand-soft/60 hover:bg-brand-soft/70',
            )}>
              <span className="relative shrink-0">
                <InitialsAvatar initials={thread.otherParty.initials} photo={thread.otherParty.photo} size={variant === 'full' ? 'md' : 'sm'} />
                {unread && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className={cn('min-w-0 flex-1 truncate group-hover:text-primary', as({ full: 'text-base/6 sm:text-[17px]/6', pane: 'text-sm', split: 'text-base/6 sm:text-[17px]/6 lg:text-sm' }), unread ? 'font-bold' : 'font-semibold')}>{thread.otherParty.displayName}</h2>
                  {unread && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-xs font-semibold text-primary-foreground tabular-nums">{t('unread', { count: thread.unreadCount })}</span>}
                  {thread.lastMessage && <time dateTime={thread.lastMessage.createdAt} title={formatDateTime(thread.lastMessage.createdAt)} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <span className="sr-only">{formatDateTime(thread.lastMessage.createdAt)} · </span>{formatRelative(thread.lastMessage.createdAt, now)}
                  </time>}
                </div>
                <p className={cn('flex min-w-0 items-center gap-1.5 text-xs', as({ full: 'sm:text-sm', pane: '', split: 'sm:text-sm lg:text-xs' }))}>
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px font-medium text-secondary-foreground">{t(`kinds.${thread.kind}`)}</span>
                  <span className="min-w-0 truncate font-medium">{thread.title}</span>
                </p>
                <p className={cn('text-sm leading-5 [overflow-wrap:anywhere]', as({ full: 'line-clamp-2', pane: 'line-clamp-1', split: 'line-clamp-2 lg:line-clamp-1' }), unread ? 'text-foreground' : 'text-muted-foreground')}>
                  {thread.lastMessage ? <LastMessage message={thread.lastMessage} /> : t('noMessage')}
                </p>
              </div>
              {variant !== 'pane' && <ChevronRight aria-hidden="true" className={cn('mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none', variant === 'split' && 'lg:hidden')} />}
            </Link>
          </li>;
        })}
      </ul>}
  </div>;
}
