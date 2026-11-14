'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityPostKind } from '@/contracts/community';
import { useRealtime } from '@/ui/lib/realtime';

/**
 * The feed, live (completion plan 7.7): a post someone just made, in what you're looking at (near you, or one
 * kind), becomes "2 new posts · Show" above the feed; nothing moves under the reader until they ask.
 */
export function CommunityFeedLive({ shownIds, liveAreaIds, kind, listId }: { shownIds: string[]; liveAreaIds?: string[]; kind?: CommunityPostKind; listId: string }) {
  const t = useTranslations('community.live');
  const router = useRouter();
  const [fresh, setFresh] = useState<string[]>([]);
  const [loading, startTransition] = useTransition();
  const shown = useMemo(() => new Set(shownIds), [shownIds]);
  useRealtime('community', (notice) => {
    if (notice.event !== 'posted' || typeof notice.post !== 'string') return;
    if (kind && notice.kind !== kind) return;
    // Near you: a market-wide post (no neighborhood) or one in a neighborhood near you.
    if (liveAreaIds && notice.area && !liveAreaIds.includes(String(notice.area))) return;
    const post = notice.post;
    setFresh((ids) => (ids.includes(post) ? ids : [...ids, post].slice(-50)));
    return true;
  });
  const count = fresh.filter((id) => !shown.has(id)).length;
  const show = () => {
    setFresh([]);
    document.getElementById(listId)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    startTransition(() => router.refresh());
  };
  return <>
    <p aria-live="polite" className="sr-only">{count > 0 ? t('announce', { count }) : ''}</p>
    {(count > 0 || loading) && <button type="button" onClick={show} disabled={loading} className="fixed top-[calc(var(--app-header-offset,4rem)+0.75rem)] left-1/2 z-30 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2">
      <ArrowUp aria-hidden="true" className="size-4" />{loading ? t('loading') : t('show', { count })}
    </button>}
  </>;
}

/** A post's page, live: new replies and reactions on it show without a reload (one refresh per burst). */
export function CommunityPostLive({ postId }: { postId: string }) {
  const router = useRouter();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useRealtime('community', (notice) => {
    if (notice.post !== postId || notice.event === 'posted') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => router.refresh(), 600);
    return true;
  });
  return null;
}
