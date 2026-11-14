'use client';

import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityFeedHandlers, CommunityFeedQuery, CommunityPostView, CommunityReactInput, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { PostCard } from './post-card';

/** Pages that load on their own as the reader nears the end; then "Show more posts" waits, so the footer is reachable. */
export const AUTO_PAGES = 3;
/** How close to the end of the list (px) the next page starts loading. */
const AHEAD_PX = 600;

export interface CommunityFeedListProps {
  posts: CommunityPostView[];
  /** The feed's filters; the next pages keep them. */
  query: Omit<CommunityFeedQuery, 'page'>;
  page: number;
  pageCount: number;
  now: ISODateTime;
  onReact: ActionHandler<CommunityReactInput>;
  onMore?: CommunityFeedHandlers['onMore'];
}

/**
 * The feed's posts, continuous like LinkedIn's (completion plan 7.7): the page's posts, then the next pages added
 * underneath, by themselves for the first few as the reader nears the end, then with "Show more posts". Nothing
 * already on screen moves; a post that shifted between pages shows once. Screen readers hear how many were added.
 * Without JavaScript, "Show more posts" is the link to the next page.
 */
export function CommunityFeedList({ posts, query, page, pageCount, now, onReact, onMore }: CommunityFeedListProps) {
  const t = useTranslations('community.feedMore');
  const [more, setMore] = useState<CommunityPostView[]>([]);
  const [next, setNext] = useState(page + 1);
  const [last, setLast] = useState(pageCount);
  const [autoLoads, setAutoLoads] = useState(0);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [loading, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const shownIds = new Set(posts.map((post) => post.id));
  const added = more.filter((post) => !shownIds.has(post.id));
  const hasMore = next <= last;
  // The next page's own address: the link without JavaScript, and for opening it in a new tab.
  const moreHref = routes.app.community({ ...query, page: next });

  const load = (auto: boolean) => {
    if (!onMore || loading || !hasMore) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<NonNullable<typeof onMore>>> = null;
      try {
        result = await onMore({ ...query, page: next });
      } catch {
        result = null;
      }
      startTransition(() => {
        if (!result) {
          setFailed(true);
          return;
        }
        // Pages load one at a time, so `more` is current here. A post that moved between pages shows once.
        const seen = new Set([...shownIds, ...more.map((post) => post.id)]);
        const fresh = result.posts.filter((post) => !seen.has(post.id));
        setMore([...more, ...fresh]);
        setNext(result.page + 1);
        setLast(result.pageCount);
        setFailed(false);
        if (auto) setAutoLoads((count) => count + 1);
        setAnnouncement(t('loaded', { count: fresh.length }));
      });
    });
  };
  // The observer outlives renders: an effect event reads the latest state when the end comes into view.
  const onEndVisible = useEffectEvent(() => {
    if (autoLoads < AUTO_PAGES && !failed) load(true);
  });

  useEffect(() => {
    const node = end.current;
    if (!node || !onMore || typeof IntersectionObserver === 'undefined') return;
    // Observed again after every page: if the end is still in view, the next page follows.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onEndVisible();
    }, { rootMargin: `${AHEAD_PX}px 0px` });
    observer.observe(node);
    return () => observer.disconnect();
  }, [next, onMore]);

  return <>
    <ol className="space-y-3">
      {posts.map((post) => <li key={post.id}><PostCard post={post} now={now} onReact={onReact} /></li>)}
      {added.map((post) => <li key={post.id}><PostCard post={post} now={now} onReact={onReact} /></li>)}
    </ol>
    <p aria-live="polite" className="sr-only">{announcement}</p>
    <div ref={end} className="flex flex-col items-center gap-2 pt-1">
      {hasMore
        ? <Link
            href={moreHref}
            prefetch={false}
            aria-disabled={loading || undefined}
            onClick={(event) => {
              if (!onMore) return;
              event.preventDefault();
              load(false);
            }}
            className={buttonVariants({ variant: 'outline' })}
          >
            {loading && <Spinner aria-hidden="true" />}{loading ? t('loading') : t('show')}
          </Link>
        : !hasMore && posts.length > 0 && <p className="text-sm text-muted-foreground">{t('end')}</p>}
      {failed && <p role="alert" className="text-sm text-destructive">{t('failed')}</p>}
    </div>
  </>;
}
