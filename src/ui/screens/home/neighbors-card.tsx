import { ArrowRight, MessageCircleQuestion, MessagesSquare, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DashboardNeighbors, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { kindIcons } from '@/ui/components/community/post-card';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

/**
 * "From your neighbors" on the home (plan 10.19): the two newest posts near the person and the asks waiting for an
 * answer, each a link into Neighbors. Shown only when there's something.
 */
export function NeighborsCard({ neighbors, now }: { neighbors: DashboardNeighbors; now: ISODateTime }) {
  const t = useTranslations('home.neighbors');
  const community = useTranslations('community');
  const { formatRelative, formatDateTime } = useFormat();
  return <section aria-labelledby="home-neighbors" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id="home-neighbors" className="flex items-center gap-2 font-display text-lg leading-7 font-semibold tracking-[-0.015em]"><UsersRound aria-hidden="true" className="size-5 text-primary" />{t('title')}</h2>
      <Link href={routes.app.community()} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('open')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </div>
    <div className="overflow-hidden rounded-[1.375rem] border border-border bg-card shadow-card">
      <p className="border-b border-border/70 bg-muted/40 px-4 py-2 text-[13px] text-muted-foreground">{neighbors.place.kind === 'nearby' ? t('placeNearby', { area: neighbors.place.name }) : t('placeMarket', { market: neighbors.place.name })}</p>
      {neighbors.posts.length > 0 && <ul className="divide-y divide-border/70">{neighbors.posts.map((post) => {
        const Icon = kindIcons[post.kind];
        return <li key={post.id}>
          <Link href={routes.app.communityPost(post.id)} className="group/row flex min-w-0 items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-primary"><Icon aria-hidden="true" className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px]/6 font-semibold group-hover/row:text-primary">{post.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
                <span>{community(`kindBadge.${post.kind}`)}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{post.authorName}{post.areaName && <> · {post.areaName}</>}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>{formatRelative(post.createdAt, now)}</time>
                <span className="inline-flex items-center gap-1 tabular-nums"><MessagesSquare aria-hidden="true" className="size-3.5" />{post.replyCount}<span className="sr-only">{community('replyCount', { count: post.replyCount })}</span></span>
              </span>
            </span>
          </Link>
        </li>;
      })}</ul>}
      {neighbors.unansweredCount > 0 && <Link href={routes.app.community({ unanswered: true })} className="flex min-h-12 items-center gap-2.5 border-t border-border/70 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-brand-soft/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <MessageCircleQuestion aria-hidden="true" className="size-4.5 shrink-0" />{t('waiting', { count: neighbors.unansweredCount })}<ArrowRight aria-hidden="true" className="ml-auto size-4" />
      </Link>}
    </div>
  </section>;
}
