import type { ReactNode } from 'react';
import { CircleHelp, HandHeart, Lightbulb, MapPin, Pin, UserRoundSearch, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityPostKind, CommunityPostView, CommunityReactInput, CommunityReplyView, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { AuthorLine } from './author-line';
import { HelperRecommendation } from './helper-recommendation';
import { ReactionBar } from './reaction-bar';

export const kindIcons: Record<CommunityPostKind, LucideIcon> = { recommendation: UserRoundSearch, question: CircleHelp, tip: Lightbulb, thanks: HandHeart };
const kindTone: Record<CommunityPostKind, string> = {
  recommendation: 'bg-badge-brand text-badge-brand-foreground',
  question: 'bg-badge-info text-badge-info-foreground',
  tip: 'bg-badge-warning text-badge-warning-foreground',
  thanks: 'bg-badge-success text-badge-success-foreground',
};

export function KindBadge({ kind }: { kind: CommunityPostKind }) {
  const t = useTranslations('community.kindBadge');
  const Icon = kindIcons[kind];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', kindTone[kind])}><Icon aria-hidden="true" className="size-3" />{t(kind)}</span>;
}

/** One reply: its author, the words, a named helper, and its reactions (completion plan 7.7). */
export function ReplyItem({ reply, now, onReact, actions, compact = false }: { reply: CommunityReplyView; now: ISODateTime; onReact: ActionHandler<CommunityReactInput>; actions?: ReactNode; compact?: boolean }) {
  const t = useTranslations('community');
  return <article id={`reply-${reply.id}`} aria-label={reply.author.displayName} className={cn('min-w-0 space-y-2', reply.pinned && !compact && 'rounded-2xl border border-primary/25 bg-brand-soft/40 p-3 sm:p-4', reply.moderation && 'rounded-2xl border border-dashed border-destructive/50 p-3')}>
    <div className="flex items-start justify-between gap-2">
      <AuthorLine author={reply.author} at={reply.createdAt} now={now} size="sm" />
      <div className="flex shrink-0 items-center gap-1">
        {reply.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"><Pin aria-hidden="true" className="size-3" />{t('pinned')}</span>}
        {actions}
      </div>
    </div>
    {reply.moderation && <p className="text-xs font-semibold text-destructive">{t(`moderation.${reply.moderation.status}`)}{reply.moderation.reason && <> · {t('moderation.reason', { reason: reply.moderation.reason })}</>}</p>}
    <p className={cn('whitespace-pre-line text-[15px]/6 [overflow-wrap:anywhere]', compact && 'line-clamp-3 text-sm/6')}>{reply.body}</p>
    {reply.recommendedHelper && <HelperRecommendation helper={reply.recommendedHelper} label="recommended" />}
    {!compact && <ReactionBar target={{ kind: 'reply', id: reply.id }} reactions={reply.reactions} own={reply.author.isYou} onReact={onReact} />}
  </article>;
}

/**
 * A post in the feed or at the top of its page (completion plan 7.7): what kind it is, who wrote it and where,
 * the question, a thanked helper's card, Thanks and Helpful, and in the feed its pinned answer or latest replies.
 */
export function PostCard({ post, now, onReact, mode = 'feed', actions }: { post: CommunityPostView; now: ISODateTime; onReact: ActionHandler<CommunityReactInput>; mode?: 'feed' | 'page'; actions?: ReactNode }) {
  const t = useTranslations('community');
  const card = useTranslations('taskCard');
  const href = routes.app.communityPost(post.id);
  const Heading = mode === 'page' ? 'h1' : 'h2';
  const hiddenReplies = post.replyCount - post.previewReplies.length;
  return <article aria-labelledby={`post-${post.id}`} className={cn('min-w-0 space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]', post.moderation && 'border-destructive/40')}>
    <div className="flex items-start justify-between gap-3">
      <AuthorLine author={post.author} at={post.createdAt} now={now} />
      <div className="flex shrink-0 items-center gap-1"><KindBadge kind={post.kind} />{actions}</div>
    </div>
    {post.moderation && <p className="text-sm font-semibold text-destructive">{t(`moderation.${post.moderation.status}`)}{post.moderation.reason && <> · {t('moderation.reason', { reason: post.moderation.reason })}</>}</p>}
    <div className="space-y-1.5">
      <Heading id={`post-${post.id}`} className={cn('font-display font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]', mode === 'page' ? 'text-[1.5rem]/[1.2] sm:text-[1.75rem]/[1.15]' : 'text-[1.0625rem]/6')}>
        {mode === 'feed' ? <Link href={href} className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{post.title}</Link> : post.title}
      </Heading>
      <p className={cn('whitespace-pre-line text-[15px]/6 text-foreground/90 [overflow-wrap:anywhere]', mode === 'feed' && 'line-clamp-4')}>{post.body}</p>
    </div>
    {(post.categorySlug || post.areaName) && <p className="flex flex-wrap gap-1.5 text-xs">
      {post.categorySlug && <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">{card(`categories.${post.categorySlug}`)}</span>}
      {post.areaName && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground"><MapPin aria-hidden="true" className="size-3" />{post.areaName}</span>}
    </p>}
    {post.thankedHelper && <HelperRecommendation helper={post.thankedHelper} label="thanked" />}
    <div className="border-t border-foreground/[0.06] pt-1 dark:border-white/[0.05]">
      <ReactionBar target={{ kind: 'post', id: post.id }} reactions={post.reactions} own={post.author.isYou} onReact={onReact} replies={mode === 'feed' ? { count: post.replyCount, href } : undefined} />
    </div>
    {mode === 'feed' && post.previewReplies.length > 0 && <div className="space-y-3 rounded-2xl bg-foreground/[0.025] p-3 dark:bg-white/[0.03]">
      {post.previewReplies.map((reply) => <ReplyItem key={reply.id} reply={reply} now={now} onReact={onReact} compact />)}
      {hiddenReplies > 0 && <Link href={href} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('seeReplies', { count: post.replyCount })}</Link>}
    </div>}
  </article>;
}
