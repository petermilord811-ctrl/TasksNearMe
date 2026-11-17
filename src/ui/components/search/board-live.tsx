'use client';

import { useEffect, useEffectEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TaskLiveState, TaskPublicView } from '@/contracts';
import { taskMatchesBoard, type BoardMatchQuery } from '@/shared/board-match';
import { cn } from '@/ui/lib/utils';
import { setTaskLiveState } from './board-live-store';

/** A tab in the background lets its stream go after this long, and opens it again when it's back. */
const HIDDEN_CLOSE_MS = 120_000;

export interface BoardLiveProps {
  marketSlug: string;
  /** The market's zone: "today" and "mornings" in the board's filters are on its clock. */
  timeZone: string;
  query: BoardMatchQuery;
  /** The market's neighborhoods (slug and name): a public task names its area, the filter its slug. */
  areas: { slug: string; name: string }[];
  /** The tasks the page shows now, so a task already on the page never counts as new. */
  shownIds: string[];
  /** Where to bring the reader when they show the new tasks. */
  listId: string;
}

/**
 * The board, live (completion plan 7.6): the market's public stream says when a task is posted; the ones that fit
 * the board's own filters become "2 new tasks · Show", a pill above the list that loads them when tapped. Nothing
 * is inserted under the reader, and nothing counts who is looking. A task's offers and its end (booked, closed)
 * reach its row as they happen (board-live-store). Without JavaScript or a stream, the board is simply the page
 * as it loaded.
 */
export function BoardLive({ marketSlug, timeZone, query, areas, shownIds, listId }: BoardLiveProps) {
  const t = useTranslations('taskBoard.live');
  const router = useRouter();
  const [fresh, setFresh] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, startTransition] = useTransition();
  const shown = useMemo(() => new Set(shownIds), [shownIds]);
  const areaNames = useMemo(() => new Map(areas.map((area) => [area.slug, area.name])), [areas]);
  // The filters can change while the stream stays open (a soft navigation): an effect event reads the latest.
  const onTask = useEffectEvent((task: TaskPublicView) => {
    if (!taskMatchesBoard(task, query, { now: new Date(), areaNames, timeZone })) return;
    setFresh((ids) => (ids.includes(task.id) ? ids : [...ids, task.id].slice(-50)));
  });
  const onState = useEffectEvent((state: TaskLiveState) => {
    setTaskLiveState(state);
    // A new task that's already booked or closed is no longer worth showing.
    if (state.state !== 'open') setFresh((ids) => (ids.includes(state.id) ? ids.filter((id) => id !== state.id) : ids));
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let hiddenTimer: number | undefined;
    const open = () => {
      if (source || typeof EventSource === 'undefined') return;
      source = new EventSource(`/api/realtime/market/${encodeURIComponent(marketSlug)}`);
      source.onopen = () => setConnected(true);
      // The browser reconnects by itself (the server says when); a refused stream just stays quiet.
      source.onerror = () => setConnected(source?.readyState === EventSource.OPEN);
      source.addEventListener('task', (event) => {
        try {
          const task = JSON.parse((event as MessageEvent<string>).data) as TaskPublicView;
          if (task?.id) onTask(task);
        } catch {
          /* not a task: ignore */
        }
      });
      source.addEventListener('task-state', (event) => {
        try {
          const state = JSON.parse((event as MessageEvent<string>).data) as TaskLiveState;
          if (state?.id && typeof state.offerCount === 'number' && typeof state.readAt === 'string') onState(state);
        } catch {
          /* not a state: ignore */
        }
      });
    };
    const close = () => {
      source?.close();
      source = null;
      setConnected(false);
    };
    const onVisibility = () => {
      window.clearTimeout(hiddenTimer);
      if (document.visibilityState === 'hidden') hiddenTimer = window.setTimeout(close, HIDDEN_CLOSE_MS);
      else open();
    };
    open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(hiddenTimer);
      close();
    };
  }, [marketSlug]);

  const count = fresh.filter((id) => !shown.has(id)).length;
  const show = () => {
    setFresh([]);
    document.getElementById(listId)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    startTransition(() => router.refresh());
  };

  return <>
    {connected && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground" title={t('liveHint')}>
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {t('live')}
    </span>}
    <p aria-live="polite" className="sr-only">{count > 0 ? t('announce', { count }) : ''}</p>
    {(count > 0 || loading) && <button
      type="button"
      onClick={show}
      disabled={loading}
      className={cn(
        'fixed top-24 left-1/2 z-30 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity duration-200 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2',
        loading && 'opacity-70',
      )}
    >
      <ArrowUp aria-hidden="true" className="size-4" />{loading ? t('loading') : t('show', { count })}
    </button>}
  </>;
}
