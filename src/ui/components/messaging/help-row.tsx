'use client';

import { ChevronRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HelpSummary, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

/** TasksNearMe Help's picture in lists and headers: the brand's color with a spark, never a person's initials. */
export function HelpAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_55%,#f6b26b))] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]', size === 'sm' ? 'size-9' : 'size-11')}>
    <Sparkles className={size === 'sm' ? 'size-4' : 'size-5'} />
  </span>;
}

/**
 * The pinned Help row at the top of every conversation list (2026-11-22): TasksNearMe Help, the AI assistant with a
 * person from support behind it. With an open case: support's reply (unread), or that it's waiting for support, and
 * the last line. `onSelect` opens it in the chat window (a plain click; Ctrl or ⌘ still opens its page).
 */
export function HelpRow({ summary, now, current = false, onSelect, variant = 'full' }: { summary?: HelpSummary; now: ISODateTime; current?: boolean; onSelect?: () => void; /** `split`: a card on phones, the pane's row from 1024 px (the Messages page). */ variant?: 'full' | 'pane' | 'split' }) {
  const t = useTranslations('chat.help');
  const { formatRelative, formatDateTime } = useFormat();
  const open = summary?.case;
  const status = open ? (open.unread ? t('rowReplied') : t('rowWaiting')) : summary?.assistantAvailable === false ? t('rowUnavailable') : t('rowAssistant');
  const line = open?.last ? (open.last.from === 'me' ? t('rowYou', { text: open.last.body }) : open.last.body) : undefined;
  return <Link href={routes.app.helpChat()} aria-current={current ? 'page' : undefined} onClick={onSelect ? (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onSelect();
  } : undefined} data-help-row="" className={cn(
    'group relative flex min-w-0 items-center gap-3 transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:hover:bg-white/[0.03]',
    variant === 'pane'
      ? 'border-b border-foreground/[0.07] px-3 py-3 dark:border-white/[0.06]'
      : variant === 'split'
        ? 'rounded-[1.375rem] border border-primary/20 bg-card px-4 py-3.5 shadow-card sm:px-6 lg:rounded-none lg:border-0 lg:border-b lg:border-foreground/[0.07] lg:bg-transparent lg:px-3 lg:py-3 lg:shadow-none dark:lg:border-white/[0.06]'
        : 'rounded-[1.375rem] border border-primary/20 bg-card px-4 py-3.5 shadow-card sm:px-6',
    current && 'bg-brand-soft/60 hover:bg-brand-soft/70',
  )}>
    <span className="relative shrink-0">
      <HelpAvatar size={variant === 'pane' ? 'sm' : 'md'} />
      {open?.unread && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
    </span>
    <span className="min-w-0 flex-1 space-y-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate group-hover:text-primary', variant === 'pane' ? 'text-sm' : 'text-base/6', open?.unread ? 'font-bold' : 'font-semibold')}>{t('title')}</span>
        {open?.last && <time dateTime={open.last.at} title={formatDateTime(open.last.at)} className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelative(open.last.at, now)}</time>}
      </span>
      <span className={cn('block truncate text-xs', open?.unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>{status}</span>
      {line && <span className={cn('block truncate text-sm', open?.unread ? 'text-foreground' : 'text-muted-foreground')}>{line}</span>}
    </span>
    {variant !== 'pane' && <ChevronRight aria-hidden="true" className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none', variant === 'split' && 'lg:hidden')} />}
  </Link>;
}
