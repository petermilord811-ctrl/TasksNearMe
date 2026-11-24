'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Bell, BellOff, Check, ChevronRight, MoreHorizontal, PanelLeft, Pin, PinOff, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useShownPerson } from '@/ui/lib/shown-person';
import type { ActionResult, ConversationFlag, ConversationListHandlers, ISODateTime, ThreadSummary } from '@/contracts';
import { routes } from '@/contracts/routes';
import { formatHours, formatMoney } from '@/shared/format';
import { MaskedText } from '@/ui/components/messaging/masked-text';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { Spinner } from '@/ui/primitives/spinner';
import { ConversationMarks } from './conversation-tools';

/** Requests and Archived (2026-11-23) show only when they hold something. */
export const INBOX_FILTERS = ['all', 'unread', 'requests', 'offers', 'bookings', 'archived'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

/**
 * Which conversations a filter keeps, and whether a search matches (the other person's name or the task). Message
 * requests wait under Requests and archived conversations under Archived (2026-11-23); every other filter leaves both out.
 */
export function keepThread(thread: ThreadSummary, filter: InboxFilter, query: string): boolean {
  if (filter === 'archived' ? !thread.archived : thread.archived) return false;
  if (filter === 'requests' ? !thread.request : filter !== 'archived' && thread.request) return false;
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
    return <>{message.sender === 'me' && <span>{t('youPrefix')}</span>}<MaskedText segments={message.preview} links={false} /></>;
  }
  const params = message.event.params;
  return <>{timeline(message.event.type, {
    hasAmount: params?.amountCents !== undefined ? 'yes' : 'no', amount: params?.amountCents !== undefined ? formatMoney(params.amountCents) : '',
    hasMinutes: params?.minutes !== undefined ? 'yes' : 'no', minutes: params?.minutes ?? 0,
    hasHours: params?.hours !== undefined ? 'yes' : 'no', hours: params?.hours !== undefined ? formatHours(params.hours) : '',
    hasTime: params?.at !== undefined ? 'yes' : 'no', time: params?.at !== undefined ? formatTime(params.at) : '',
    // A family follower's name (2026-11-24).
    name: params?.name ?? '',
  })}</>;
}

/**
 * The conversations (completion plan 7.3): filters (all, unread, offers, bookings) and a search over names and
 * tasks that answer as you type, then one row per conversation, unread ones first (audit M33). `pane` is the narrow
 * list beside an open conversation on wide screens, with the open one marked; `split` is the full list on phones and
 * that pane from 1024 px (the inbox page, beside "Choose a conversation": audit M34). On a row the person, anything
 * unread and how long ago come first, then the kind and the task on a line of their own (M39), then the last message.
 */
export function InboxList({ threads, now, currentId, variant = 'full', pinned, onSelect, handlers, onOpenBeside }: {
  threads: ThreadSummary[];
  now: ISODateTime;
  currentId?: string;
  variant?: 'full' | 'pane' | 'split';
  /** Above the conversations, whatever the filters: the Help conversation (2026-11-22). */
  pinned?: ReactNode;
  /** The chat window opens a conversation in place (a plain click; Ctrl or ⌘ still opens its page in a new tab). */
  onSelect?: (threadId: string) => void;
  /** Pin, mute, archive and accept from a row's menu (2026-11-23); no menu without them. */
  handlers?: ConversationListHandlers;
  /** The chat window on wide screens: "Open beside" in a row's menu, a docked window of its own. */
  onOpenBeside?: (threadId: string) => void;
}) {
  const t = useTranslations('inbox');
  const { formatDateTime, formatRelative } = useFormat();
  // Someone whose account was deleted, in the page's own words (J-PR15).
  const person = useShownPerson();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => threads.filter((thread) => keepThread(thread, filter, query)), [threads, filter, query]);
  const unreadTotal = threads.reduce((sum, thread) => sum + (thread.unreadCount > 0 && !thread.archived && !thread.request ? 1 : 0), 0);
  // Requests and Archived show when they hold something (or are the filter in use).
  const counts: Partial<Record<InboxFilter, number>> = { unread: unreadTotal, requests: threads.filter((thread) => thread.request && !thread.archived).length, archived: threads.filter((thread) => thread.archived).length };
  const offered = INBOX_FILTERS.filter((option) => (option !== 'requests' && option !== 'archived') || (counts[option] ?? 0) > 0 || filter === option);
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
        {offered.map((option) => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={cn('inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring', as({ full: 'px-3', pane: 'px-2.5', split: 'px-3 lg:px-2.5' }), filter === option ? 'border-primary/40 bg-brand-soft text-foreground' : 'border-foreground/[0.1] bg-card text-muted-foreground hover:text-foreground dark:border-white/[0.1]')}>
          {filter === option && <Check aria-hidden="true" className="size-3.5" />}{t(`filters.${option}`)}{(option === 'unread' || option === 'requests') && (counts[option] ?? 0) > 0 && <span className="tabular-nums">({counts[option]})</span>}
        </button>)}
      </div>
    </div>
    {pinned}
    <p role="status" className="sr-only">{t('shown', { count: shown.length })}</p>
    {shown.length === 0
      ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{filter === 'requests' ? t('noRequests') : filter === 'archived' ? t('noArchived') : t('noMatch')}</p>
      : <ul aria-label={t('conversations')} className={cn('divide-y divide-foreground/[0.07] dark:divide-white/[0.06]', as({
        full: 'overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]',
        pane: 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        split: 'overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none',
      }))}>
        {shown.map((thread) => {
          const unread = thread.unreadCount > 0;
          const current = thread.id === currentId;
          const other = person(thread.otherParty);
          return <li key={thread.id} className="group/row relative">
            <Link href={routes.app.thread(thread.id)} aria-current={current ? 'page' : undefined} onClick={onSelect ? (event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onSelect(thread.id);
            } : undefined} className={cn(
              'group flex min-w-0 gap-3 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:hover:bg-white/[0.03]',
              as({ full: 'px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4', pane: 'gap-2.5 px-3 py-2', split: 'px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 lg:gap-3 lg:px-3 lg:py-3' }),
              current && 'bg-brand-soft/60 hover:bg-brand-soft/70',
              handlers && 'pr-12',
            )}>
              <span className="relative shrink-0">
                <InitialsAvatar initials={other.initials} photo={other.photo} size={variant === 'full' ? 'md' : 'sm'} />
                {unread && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className={cn('min-w-0 truncate group-hover:text-primary', as({ full: 'text-base/6 sm:text-[17px]/6', pane: 'text-sm', split: 'text-base/6 sm:text-[17px]/6 lg:text-sm' }), unread ? 'font-bold' : 'font-semibold')}>{other.displayName}</h2>
                  <ConversationMarks thread={thread} />
                  <span className="min-w-0 flex-1" />
                  {thread.lastMessage && <time dateTime={thread.lastMessage.createdAt} title={formatDateTime(thread.lastMessage.createdAt)} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <span className="sr-only">{formatDateTime(thread.lastMessage.createdAt)} · </span>{formatRelative(thread.lastMessage.createdAt, now)}
                  </time>}
                </div>
                <p className={cn('flex min-w-0 items-center gap-1.5 text-xs', as({ full: 'sm:text-sm', pane: '', split: 'sm:text-sm lg:text-xs' }))}>
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px font-medium text-secondary-foreground">{t(`kinds.${thread.kind}`)}</span>
                  {/* A direct conversation's title is the person's name, already the row's heading. */}
                  {thread.kind !== 'direct' && <span className="min-w-0 truncate font-medium">{thread.title}</span>}
                </p>
                {/* The unread count at the end of the last message's line, as in any messenger (2026-11-24): on the name's
                    line, beside the time, it squeezed a name to "…" in the chat window's narrow list. */}
                <div className="flex min-w-0 items-start gap-2">
                  <p className={cn('min-w-0 flex-1 leading-5 [overflow-wrap:anywhere]', as({ full: 'line-clamp-2 text-sm', pane: 'line-clamp-1 text-[13px]', split: 'line-clamp-2 text-sm lg:line-clamp-1' }), unread ? 'text-foreground' : 'text-muted-foreground')}>
                    {thread.lastMessage ? <LastMessage message={thread.lastMessage} /> : t('noMessage')}
                  </p>
                  {unread && <span className="mt-px inline-flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"><span aria-hidden="true">{thread.unreadCount}</span><span className="sr-only">{t('unread', { count: thread.unreadCount })}</span></span>}
                </div>
              </div>
              {variant !== 'pane' && !handlers && <ChevronRight aria-hidden="true" className={cn('mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none', variant === 'split' && 'lg:hidden')} />}
            </Link>
            {handlers && <RowMenu thread={thread} name={other.displayName} handlers={handlers} {...(onOpenBeside ? { onOpenBeside: () => onOpenBeside(thread.id) } : {})} />}
          </li>;
        })}
      </ul>}
  </div>;
}

/** A flag's change said in a toast; a refusal (three pinned already, a lost connection) says why. */
function useSaid() {
  const t = useTranslations('thread.tools');
  return (flag: ConversationFlag | 'accepted', on: boolean, result: ActionResult) => {
    if (result.ok) toast.success(flag === 'accepted' ? t('done.accepted') : t(`done.${flag}`, { on: on ? 'yes' : 'no' }));
    else toast.error(result.code === 'limit_reached' ? t('pinLimit') : t('failed'));
  };
}

/**
 * A row's ⋯ menu (2026-11-23): pin, mute, archive, or accept a message request, without opening the conversation. Beside
 * the row's link (never inside it), quiet until the pointer or the keyboard comes near on wide screens.
 */
function RowMenu({ thread, name, handlers, onOpenBeside }: { thread: ThreadSummary; name: string; handlers: ConversationListHandlers; onOpenBeside?: () => void }) {
  const t = useTranslations('thread.tools');
  const said = useSaid();
  const [pending, setPending] = useState(false);
  async function run(flag: ConversationFlag | 'accepted', on: boolean) {
    if (pending) return;
    setPending(true);
    try {
      said(flag, on, flag === 'accepted' ? await handlers.onAccept(thread.id) : await handlers.onFlag(thread.id, { flag, on }));
    } catch {
      said(flag, on, { ok: false, code: 'unknown' });
    } finally {
      setPending(false);
    }
  }
  return <div className="absolute top-2 right-2 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/row:opacity-100 lg:focus-within:opacity-100 lg:has-[[data-state=open]]:opacity-100">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t('rowMenu', { name })} disabled={pending} aria-busy={pending} className="grid size-9 place-items-center rounded-full bg-card/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {pending ? <Spinner aria-hidden="true" className="size-4" /> : <MoreHorizontal aria-hidden="true" className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onOpenBeside && <DropdownMenuItem onSelect={onOpenBeside}><PanelLeft aria-hidden="true" />{t('openBeside')}</DropdownMenuItem>}
        {thread.request && !thread.archived && <DropdownMenuItem onSelect={() => void run('accepted', true)}><UserCheck aria-hidden="true" />{t('accept')}</DropdownMenuItem>}
        {!thread.archived && !thread.request && <DropdownMenuItem onSelect={() => void run('pinned', !thread.pinned)}>{thread.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{t(thread.pinned ? 'unpin' : 'pin')}</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => void run('muted', !thread.muted)}>{thread.muted ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}{t(thread.muted ? 'unmute' : 'mute')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('archived', !thread.archived)}>{thread.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}{t(thread.archived ? 'unarchive' : 'archive')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
