'use client';

import { useEffect, useEffectEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PortalPageData, TaskLiveState, TaskPublicView } from '@/contracts';
import { PORTAL_GENERAL } from '@/contracts/portal';
import { setTaskLiveState } from '@/ui/components/search/board-live-store';
import { useRealtime } from '@/ui/lib/realtime';
import { cn } from '@/ui/lib/utils';

/** A tab in the background lets its task stream go after this long, and opens it again when it's back. */
const HIDDEN_CLOSE_MS = 120_000;

type Data = Pick<PortalPageData, 'query' | 'live' | 'areas' | 'market' | 'items'>;


/**
 * The portal, live (completion plan 9.10): a post someone just made (the signed-in stream's community notices)
 * and a task just posted (the market's public stream) that fit what the reader is looking at become one pill,
 * "3 new · Show", above the stream; nothing moves under the reader until they ask. Offer counts on task cards and
 * rows update as they change. A search or Saved view waits for a reload (a notice carries ids, not words).
 */
export function PortalLive({ data, listId, onCheckFresh }: { data: Data; listId: string; onCheckFresh?: (keys: string[]) => Promise<string[]> }) {
  const t = useTranslations('portal.live');
  const router = useRouter();
  const [fresh, setFresh] = useState<string[]>([]);
  const [loading, startTransition] = useTransition();
  const { query, live } = data;
  const shown = useMemo(() => new Set(data.items.map((item) => `${item.type}:${item.id}`)), [data.items]);
  const areaNames = useMemo(() => new Set(data.areas.filter((area) => !live.areaSlugs || live.areaSlugs.includes(area.slug)).map((area) => area.name)), [data.areas, live.areaSlugs]);
  // Top ranks by engagement, so a brand-new item wouldn't appear there (sweep P5).
  const quiet = Boolean(query.q) || query.saved || query.sort === 'top';
  // The server's word on each new item: would this reader see it (not their own, nobody blocked either way, still up)?
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const add = (key: string) => setFresh((keys) => (keys.includes(key) ? keys : [...keys, key].slice(-50)));

  useRealtime('community', (notice) => {
    if (notice.event !== 'posted' || typeof notice.post !== 'string' || quiet) return;
    if (query.type === 'task' || (query.type && notice.kind !== query.type)) return;
    const area = String(notice.area ?? '');
    if (live.areaIds && !(area ? live.areaIds.includes(area) : live.withRemote)) return;
    const category = String(notice.category ?? '');
    if (query.category && (query.category === PORTAL_GENERAL ? category !== '' : category !== query.category)) return;
    add(`post:${notice.post}`);
    return true;
  });

  const onTask = useEffectEvent((task: TaskPublicView) => {
    if (quiet || (query.type && query.type !== 'task')) return;
    if (query.category && task.categorySlug !== query.category) return;
    if (live.areaSlugs && !(task.location.kind === 'remote' ? live.withRemote : areaNames.has(task.location.areaName))) return;
    add(`task:${task.id}`);
  });
  const onState = useEffectEvent((state: TaskLiveState) => {
    setTaskLiveState(state);
    if (state.state !== 'open') setFresh((keys) => keys.filter((key) => key !== `task:${state.id}`));
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let hiddenTimer: number | undefined;
    const open = () => {
      if (source || typeof EventSource === 'undefined') return;
      source = new EventSource(`/api/realtime/market/${encodeURIComponent(data.market.slug)}`);
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
  }, [data.market.slug]);

  // Ask about the items not checked yet, a moment after they arrive (several notices become one request).
  useEffect(() => {
    if (!onCheckFresh) return;
    const pending = fresh.filter((key) => !(key in checked));
    if (pending.length === 0) return;
    const timer = window.setTimeout(() => {
      onCheckFresh(pending)
        .then((visible) => setChecked((before) => ({ ...before, ...Object.fromEntries(pending.map((key) => [key, visible.includes(key)])) })))
        .catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [fresh, checked, onCheckFresh]);

  const count = fresh.filter((key) => !shown.has(key) && (!onCheckFresh || checked[key] === true)).length;
  const show = () => {
    setFresh([]);
    document.getElementById(listId)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    startTransition(() => router.refresh());
  };
  return <>
    <p aria-live="polite" className="sr-only">{count > 0 ? t('announce', { count }) : ''}</p>
    {(count > 0 || loading) && <button
      type="button"
      onClick={show}
      disabled={loading}
      className={cn(
        'fixed top-[calc(var(--app-header-offset,4rem)+0.75rem)] left-1/2 z-30 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2',
        loading && 'opacity-70',
      )}
    >
      <ArrowUp aria-hidden="true" className="size-4" />{loading ? t('loading') : t('show', { count })}
    </button>}
  </>;
}
