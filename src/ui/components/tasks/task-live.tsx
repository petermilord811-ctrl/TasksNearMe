'use client';

import { useTranslations } from 'next-intl';
import type { ISODateTime } from '@/contracts';
import { useTaskLiveState } from '@/ui/components/search/board-live-store';
import { useFormat } from '@/ui/lib/format';
import { useLastVisit } from '@/ui/lib/last-visit';
import { cn } from '@/ui/lib/utils';

/**
 * A board row's offer count, live (completion plan 7.6): the page's number until the market's stream has newer
 * news, then the new count, or "Booked" or "No longer taking offers" once the task stops taking them.
 */
export function LiveOfferCount({ taskId, offerCount, renderedAt }: { taskId: string; offerCount: number; renderedAt: ISODateTime }) {
  const t = useTranslations('taskBoard.row');
  const live = useTaskLiveState(taskId, renderedAt);
  if (live && live.state !== 'open') {
    return <span data-task-state={live.state} className="inline-flex items-center rounded-full bg-secondary px-2 py-px text-[12px] font-semibold text-secondary-foreground">{t(live.state === 'booked' ? 'booked' : 'closed')}</span>;
  }
  const count = live ? live.offerCount : offerCount;
  // A new count fades in, so the change is seen without moving anything.
  return <span key={count} className={cn('tabular-nums', count === 0 && 'font-medium text-foreground', live && 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500')}>
    {count === 0 ? t('first') : t('offers', { count })}
  </span>;
}

/**
 * "New" on a board row (completion plan 7.6): posted since the reader's last visit to this board, Reddit-style,
 * when this browser remembers one; otherwise posted within the last day (`recent`), as the server rendered it.
 */
export function NewSinceBadge({ postedAt, recent, visitKey }: { postedAt: ISODateTime; recent: boolean; visitKey: string }) {
  const t = useTranslations('taskBoard.row');
  const lastVisit = useLastVisit(visitKey);
  const sinceVisit = typeof lastVisit === 'number';
  if (!(sinceVisit ? Date.parse(postedAt) > lastVisit : recent)) return null;
  return <span title={sinceVisit ? t('newSinceVisit') : undefined} className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full bg-badge-brand px-1.5 py-px align-middle text-[11px] font-semibold text-badge-brand-foreground">
    {t('new')}
  </span>;
}

/**
 * The board's header note, after the market's counts: "New" means posted since your last visit, and when that was.
 * Nothing (not even its separator) without one.
 */
export function LastVisitNote({ visitKey, now }: { visitKey: string; now: ISODateTime }) {
  const t = useTranslations('taskBoard');
  const { formatRelative, formatDateTime } = useFormat();
  const lastVisit = useLastVisit(visitKey);
  if (typeof lastVisit !== 'number') return null;
  const at = new Date(lastVisit).toISOString();
  // The page can be cached a few minutes; a visit ends after half an hour away, so it's almost always earlier.
  // If not, "just now" rather than "in 2 minutes".
  const reference = new Date(Math.max(Date.parse(now), lastVisit)).toISOString();
  return <>
    <span aria-hidden="true" className="text-muted-foreground">·</span>
    <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
      <span className="inline-flex items-center rounded-full bg-badge-brand px-1.5 py-px text-[11px] font-semibold text-badge-brand-foreground">{t('row.new')}</span>
      <time dateTime={at} title={formatDateTime(at)}>{t('stats.sinceVisit', { when: formatRelative(at, reference) })}</time>
    </span>
  </>;
}
