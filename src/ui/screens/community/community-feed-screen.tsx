import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, MessagesSquare, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityFeedHandlers, CommunityFeedPageData, CommunityFeedQuery, ISODateTime } from '@/contracts';
import { COMMUNITY_POST_KINDS, COMMUNITY_SCOPES, COMMUNITY_SORTS } from '@/contracts/community';
import { routes } from '@/contracts/routes';
import { CommunityFeedLive } from '@/ui/components/community/community-live';
import { kindIcons, PostCard } from '@/ui/components/community/post-card';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

export interface CommunityFeedScreenProps { data: CommunityFeedPageData; handlers: CommunityFeedHandlers; now: ISODateTime }

function Tab({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return <li><Link href={href} aria-current={selected ? 'true' : undefined} className={cn('inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring', selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{selected && <Check aria-hidden="true" className="size-3.5" />}{children}</Link></li>;
}

function Chip({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return <li><Link href={href} aria-current={selected ? 'true' : undefined} className={cn('inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', selected ? 'border-primary/40 bg-brand-soft text-foreground' : 'border-foreground/[0.1] bg-card hover:border-foreground/25 dark:border-white/[0.1]')}>{children}</Link></li>;
}

/**
 * The community feed (completion plan 7.7, Nextdoor and LinkedIn-style): ask your neighbors at the top, then a
 * continuous feed of recommendation requests, questions, tips and thanks, near you or across the market, with
 * replies and reactions inline, and new posts announced live without moving the page.
 */
export function CommunityFeedScreen({ data, handlers, now }: CommunityFeedScreenProps) {
  const t = useTranslations('community');
  const { query, market } = data;
  const href = (change: CommunityFeedQuery) => routes.app.community({ ...query, ...change, page: undefined });
  const filtered = query.kind !== undefined || query.scope !== 'nearby';

  return <div className="mx-auto max-w-2xl space-y-5">
    <header className="space-y-1.5">
      <h1 className="font-display text-[1.75rem]/[1.15] font-semibold tracking-[-0.02em] sm:text-[2rem]/[1.1]">{t('title')}</h1>
      <p className="text-[15px] text-muted-foreground">{t('intro', { market: market.name })}</p>
      <p className="text-sm font-medium tabular-nums text-primary">{t('stats', { posts: data.stats.postsThisWeek, replies: data.stats.repliesToday })}</p>
    </header>

    {/* Ask first: the four kinds of post, one tap each. */}
    <section aria-label={t('composer.label')} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
      <Link href={routes.app.newCommunityPost()} className="flex min-h-12 items-center gap-3 rounded-2xl border border-foreground/[0.1] bg-background/70 px-4 text-[15px] text-muted-foreground transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring dark:border-white/[0.1]">
        <PenLine aria-hidden="true" className="size-4 shrink-0 text-primary" />{t('composer.prompt')}
      </Link>
      <ul className="grid grid-cols-2 gap-2">
        {COMMUNITY_POST_KINDS.map((kind) => {
          const Icon = kindIcons[kind];
          return <li key={kind}><Link href={routes.app.newCommunityPost(kind)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors hover:bg-foreground/[0.05] focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.06]"><Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />{t(`kinds.${kind}`)}</Link></li>;
        })}
      </ul>
      {data.postBlocked && <p className="text-sm text-muted-foreground">{t(`postBlocked.${data.postBlocked}`)} {data.postBlocked === 'phone_required' && <Link href={routes.app.account()} className="font-semibold text-primary underline underline-offset-4">{t('verifyPhone')}</Link>}</p>}
    </section>

    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t('scope.label')}><ul className="inline-flex rounded-lg bg-foreground/[0.05] p-0.5 dark:bg-white/[0.06]">
          {COMMUNITY_SCOPES.map((scope) => <Tab key={scope} href={href({ scope })} selected={query.scope === scope}>{scope === 'nearby' ? (data.yourArea ? t('scope.nearbyArea', { area: data.yourArea.name }) : t('scope.nearby')) : t('scope.market', { market: market.name })}</Tab>)}
        </ul></nav>
        <nav aria-label={t('sort.label')}><ul className="inline-flex rounded-lg bg-foreground/[0.05] p-0.5 dark:bg-white/[0.06]">
          {COMMUNITY_SORTS.map((sort) => <Tab key={sort} href={href({ sort })} selected={query.sort === sort}>{t(`sort.${sort}`)}</Tab>)}
        </ul></nav>
      </div>
      <nav aria-label={t('kindFilter.label')} className="-mx-gutter overflow-x-auto px-gutter py-0.5 [scrollbar-width:none]">
        <ul className="flex w-max gap-1.5">
          <Chip href={href({ kind: undefined })} selected={!query.kind}>{t('kindFilter.all')}</Chip>
          {COMMUNITY_POST_KINDS.map((kind) => {
            const Icon = kindIcons[kind];
            return <Chip key={kind} href={href({ kind })} selected={query.kind === kind}><Icon aria-hidden="true" className="size-3.5" />{t(`kindBadge.${kind}`)}</Chip>;
          })}
        </ul>
      </nav>
    </div>

    <CommunityFeedLive shownIds={data.posts.map((post) => post.id)} liveAreaIds={data.liveAreaIds} kind={query.kind} listId="community-feed" />

    <div id="community-feed" className="scroll-mt-28">
      {data.posts.length === 0
        ? <EmptyState icon={<MessagesSquare />} title={t(filtered ? 'empty.filteredTitle' : 'empty.title')} body={filtered ? t('empty.filteredBody', { market: market.name }) : t('empty.body')} action={{ label: t('kinds.recommendation'), href: routes.app.newCommunityPost('recommendation') }} />
        : <ol className="space-y-3">{data.posts.map((post) => <li key={post.id}><PostCard post={post} now={now} onReact={handlers.onReact} /></li>)}</ol>}
    </div>

    {data.pageCount > 1 && <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-center gap-3 pt-2">
      {query.page > 1 && <Link href={routes.app.community({ ...query, page: query.page - 1 })} rel="prev" className={buttonVariants({ variant: 'outline' })}><ArrowLeft aria-hidden="true" className="size-4" />{t('previous')}</Link>}
      <p className="text-sm tabular-nums">{t('page', { page: query.page, count: data.pageCount })}</p>
      {query.page < data.pageCount && <Link href={routes.app.community({ ...query, page: query.page + 1 })} rel="next" className={buttonVariants({ variant: 'outline' })}>{t('next')}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
    </nav>}

    <p className="text-sm text-muted-foreground">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
  </div>;
}
