import type { ReactNode } from 'react';
import { CircleHelp, CornerDownRight, HandHeart, HandHelping, Lightbulb, MapPin, Pin, Reply, Star, UserRoundSearch, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  ActionHandler,
  ActionResult,
  CommunityEditInput,
  CommunityFollowInput,
  CommunityPostKind,
  CommunityPostView,
  CommunityReactInput,
  CommunityReactorsView,
  CommunityReplyInput,
  CommunityReplyView,
  CommunityThreadHelper,
  ISODateTime,
  Photo,
  PortalQuery,
  QueryHandler,
} from '@/contracts';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { AuthorLine } from './author-line';
import { ExpandableText } from './expandable-text';
import { Highlight, highlightWords } from './highlight';
import { HelperRecommendation } from './helper-recommendation';
import { CommunityItemActions } from './item-actions';
import { NewSinceVisit } from './new-since-visit';
import { PostCardFooter } from './post-card-footer';
import { PostPhotos } from './post-photos';
import { PostTaskLink } from './post-task-link';
import { ReactionBar } from './reaction-bar';

export const kindIcons: Record<CommunityPostKind, LucideIcon> = { recommendation: UserRoundSearch, question: CircleHelp, tip: Lightbulb, thanks: HandHeart };
export const kindTone: Record<CommunityPostKind, string> = {
  recommendation: 'bg-badge-brand text-badge-brand-foreground',
  question: 'bg-badge-info text-badge-info-foreground',
  tip: 'bg-badge-warning text-badge-warning-foreground',
  thanks: 'bg-badge-success text-badge-success-foreground',
};

/** The kind of post as a colored pill; on phones its icon alone (the word stays for screen readers), so the author's name keeps the line. */
export function KindBadge({ kind }: { kind: CommunityPostKind }) {
  const t = useTranslations('community.kindBadge');
  const Icon = kindIcons[kind];
  return <span title={t(kind)} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold max-sm:px-1.5 max-sm:py-1', kindTone[kind])}><Icon aria-hidden="true" className="size-3" /><span className="max-sm:sr-only">{t(kind)}</span></span>;
}

/**
 * One reply (completion plan 7.7, plan 10): its author, who it answers ("Replying to Maya R."), the words, its photo, a
 * named helper, and its reactions. With `visitKey` (the post page's), a reply posted since the reader's last visit says
 * "New" (plan 7.6); with `onReplyTo`, a Reply button answers its author.
 */
export function ReplyItem({ reply, now, onReact, actions, compact = false, visitKey, onReplyTo, footer }: {
  reply: CommunityReplyView;
  now: ISODateTime;
  onReact: ActionHandler<CommunityReactInput>;
  actions?: ReactNode;
  compact?: boolean;
  visitKey?: string;
  /** Answer this reply's author (the post page's reply form, plan 10.10). */
  onReplyTo?: (reply: CommunityReplyView) => void;
  /** Under the words: "See translation" (plan 10.23). */
  footer?: ReactNode;
}) {
  const t = useTranslations('community');
  return <article id={`reply-${reply.id}`} aria-label={reply.author.displayName} className={cn('min-w-0 scroll-mt-28 space-y-2', reply.pinned && !compact && 'rounded-2xl border border-primary/25 bg-brand-soft/40 p-3 sm:p-4', reply.moderation && 'rounded-2xl border border-dashed border-destructive/50 p-3')}>
    <div className="flex items-start justify-between gap-2">
      <AuthorLine author={reply.author} at={reply.createdAt} now={now} size="sm" {...(reply.editedAt ? { edited: reply.editedAt } : {})} />
      <div className="flex shrink-0 items-center gap-1">
        {visitKey && <NewSinceVisit at={reply.createdAt} visitKey={visitKey} own={reply.author.isYou} />}
        {reply.pinned && <span title={t('pinned')} className={cn('inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground', compact && 'max-sm:px-1.5 max-sm:py-1')}><Pin aria-hidden="true" className="size-3" /><span className={compact ? 'max-sm:sr-only' : undefined}>{t('pinned')}</span></span>}
        {actions}
      </div>
    </div>
    {reply.moderation && <p className="text-xs font-semibold text-destructive">{t(`moderation.${reply.moderation.status}`)}{reply.moderation.reason && <> · {t('moderation.reason', { reason: reply.moderation.reason === 'reports' ? t('moderation.byReports') : reply.moderation.reason })}</>}</p>}
    {reply.replyTo && !compact && <a href={`#reply-${reply.replyTo.id}`} className="inline-flex min-h-7 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"><CornerDownRight aria-hidden="true" className="size-3.5" />{t('replyingTo', { name: reply.replyTo.authorName })}</a>}
    <p className={cn('whitespace-pre-line text-[15px]/6 [overflow-wrap:anywhere]', compact && 'line-clamp-3 text-sm/6')}>{reply.body}</p>
    {reply.photo && !compact && <PostPhotos photos={[reply.photo]} label={reply.author.displayName} compact />}
    {footer}
    {reply.recommendedHelper && <HelperRecommendation helper={reply.recommendedHelper} label="recommended" />}
    {!compact && <div className="flex flex-wrap items-center gap-1">
      <ReactionBar target={{ kind: 'reply', id: reply.id }} reactions={reply.reactions} own={reply.author.isYou} onReact={onReact} />
      {onReplyTo && !reply.author.isYou && !reply.moderation && <button type="button" onClick={() => onReplyTo(reply)} aria-label={t('replyToPerson', { name: reply.author.displayName })} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.06]">
        <Reply aria-hidden="true" className="size-4" /><span className="max-sm:sr-only">{t('replyTo')}</span>
      </button>}
    </div>}
  </article>;
}

/**
 * "Recommended in this thread" (plan 10.4): the helpers neighbors named on a recommendation request, most named first,
 * each with how many named them and Request. On a card, the first one and how many more; on the post's page, all.
 * `stacked`: the actions under each name (the post page's narrow side column).
 */
export function ThreadRecommendations({ recommended, postHref, full = false, stacked = false }: { recommended: CommunityThreadHelper[]; postHref?: string; full?: boolean; stacked?: boolean }) {
  const t = useTranslations('community.threadHelpers');
  const card = useTranslations('community.helperCard');
  if (recommended.length === 0) return null;
  const shown = full ? recommended : recommended.slice(0, 1);
  const more = recommended.length - shown.length;
  return <section aria-label={t('label')} className="rounded-2xl border border-primary/20 bg-brand-soft/40 p-3">
    {full && <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase"><Star aria-hidden="true" className="size-3.5 fill-current text-sun" />{t('title')}</h2>}
    <ul className="space-y-2">{shown.map(({ helper, count }) => <li key={helper.handle} className={cn('flex min-w-0', stacked ? 'flex-col items-start gap-0.5' : 'items-center justify-between gap-3')}>
      <p className="min-w-0 text-sm leading-snug">
        {!full && <Star aria-hidden="true" className="mr-1.5 inline size-3.5 fill-current align-[-2px] text-sun" />}
        <span className="font-semibold">{helper.selfTag ? t('selfTagged', { name: helper.displayName }) : t('recommendedBy', { count, name: helper.displayName })}</span>
        {helper.rating && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">★ {helper.rating.average.toFixed(1)} ({helper.rating.count})</span>}
      </p>
      <span className={cn('flex shrink-0 items-center gap-1.5', stacked && '-ml-2.5')}>
        <Link href={routes.helperProfile(helper.handle)} className="hidden min-h-9 items-center rounded-full px-2.5 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex">{card('view')}</Link>
        {helper.requestHref && <Link href={helper.requestHref} aria-label={card('requestLabel', { name: helper.displayName })} className="inline-flex min-h-9 items-center rounded-full border border-primary/35 bg-card px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring">{card('request')}</Link>}
      </span>
    </li>)}</ul>
    {more > 0 && postHref && <Link href={postHref} className="mt-1.5 inline-flex min-h-8 items-center text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('more', { count: more })}</Link>}
  </section>;
}

const flairClass = 'inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-medium text-secondary-foreground';
const flairLinkClass = `${flairClass} transition-colors hover:bg-brand-soft hover:text-primary focus-visible:outline-2 focus-visible:outline-ring`;

export interface PostCardProps {
  post: CommunityPostView;
  now: ISODateTime;
  onReact: ActionHandler<CommunityReactInput>;
  mode?: 'feed' | 'page';
  actions?: ReactNode;
  /** Save (plan 9.10); without it, no Save button. */
  onSavePost?: ActionHandler<{ postId: string; saved: boolean }>;
  /** The portal's filters (plan 9.10): the service and neighborhood flairs become links that filter by them. */
  linkBase?: PortalQuery;
  /** The heading level in the feed (the portal's cards sit under an h2 for the list). */
  headingLevel?: 2 | 3;
  /** A card's reply box (plan 10.3): the portal's Server Action, called with the post named. */
  onReplyInline?: (postId: string, input: CommunityReplyInput) => Promise<ActionResult>;
  /** The viewer, beside the reply box. */
  me?: { initials: string; photo?: Photo };
  /** Who reacted, behind the counts (plan 10.2). */
  onLoadReactors?: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityReactorsView | null>;
  /** A card's menu (plan 10.5, 10.9): follow or mute, edit and delete your own, report someone else's. */
  onFollow?: ActionHandler<CommunityFollowInput>;
  onEdit?: ActionHandler<CommunityEditInput>;
  onDelete?: ActionHandler<{ target: 'post' | 'reply'; id: string }>;
  /** A post's page: Reply moves to its reply form. */
  onReplyClick?: () => void;
  /** Under the words on a post's page: "See translation" (plan 10.23). */
  bodyFooter?: ReactNode;
}

/**
 * A post in the feed or at the top of its page (completion plan 7.7, 9.10; plan 10, Nextdoor's card): who wrote it and
 * where, what kind it is, the question and its words (folded with "More" in the feed), its photos, the flairs (which
 * filter in the portal), a thanked helper's card or the helpers named in the thread, the task it became, a line of what
 * neighbors did and a row of actions (Helpful, Thanks, Reply, Save, and "Ask for help" on the viewer's own ask), and in
 * the feed its pinned answer or latest replies with a reply box.
 */
export function PostCard({ post, now, onReact, mode = 'feed', actions, onSavePost, linkBase, headingLevel = 2, onReplyInline, me, onLoadReactors, onFollow, onEdit, onDelete, onReplyClick, bodyFooter }: PostCardProps) {
  const t = useTranslations('community');
  const card = useTranslations('taskCard');
  const href = routes.app.communityPost(post.id);
  const Heading = mode === 'page' ? 'h1' : headingLevel === 3 ? 'h3' : 'h2';
  const portal = (change: PortalQuery) => routes.app.community({ ...linkBase, ...change, page: undefined });
  // A search's words, marked in the card (plan 10.23).
  const searched = highlightWords(linkBase?.q);
  // The feed's own menu (the post's page brings its own, with pin and staff tools).
  const feedMenu = mode === 'feed' && !post.moderation && (onFollow || (post.author.isYou && (onEdit || onDelete)) || !post.author.isYou)
    ? <CommunityItemActions
        target="post"
        id={post.id}
        label={post.title}
        own={post.author.isYou}
        {...(onDelete ? { onDelete } : {})}
        {...(!post.author.isYou ? { reportHref: routes.app.report('post', post.id) } : {})}
        {...(onFollow && post.follow ? { follow: { postId: post.id, state: post.follow, onFollow } } : {})}
        {...(onEdit && post.canEdit ? { edit: { item: { target: 'post', id: post.id, title: post.title, body: post.body, kind: post.kind }, onEdit } } : {})}
      />
    : null;
  return <article aria-labelledby={`post-${post.id}`} className={cn('min-w-0 space-y-3 rounded-[1.375rem] border border-border bg-card p-4 shadow-card sm:p-5', post.moderation && 'border-dashed border-destructive/50')}>
    <div className="flex items-start justify-between gap-3">
      <AuthorLine author={post.author} at={post.createdAt} now={now} {...(post.editedAt ? { edited: post.editedAt } : {})} />
      <div className="flex shrink-0 items-center gap-1"><KindBadge kind={post.kind} />{actions ?? feedMenu}</div>
    </div>
    {post.moderation && <p className="text-sm font-semibold text-destructive">{t(`moderation.${post.moderation.status}`)}{post.moderation.reason && <> · {t('moderation.reason', { reason: post.moderation.reason === 'reports' ? t('moderation.byReports') : post.moderation.reason })}</>}</p>}
    <div className="space-y-1.5">
      <Heading id={`post-${post.id}`} className={cn('font-display font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]', mode === 'page' ? 'text-[1.5rem]/[1.2] sm:text-[1.75rem]/[1.15]' : 'text-[1.0625rem]/6')}>
        {mode === 'feed' ? <Link href={href} className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Highlight text={post.title} words={searched} /></Link> : post.title}
      </Heading>
      {post.body && (mode === 'feed'
        ? <ExpandableText text={post.body} words={searched} className="text-[15px]/6 text-foreground/90" />
        : <p className="whitespace-pre-line text-[15px]/6 text-foreground/90 [overflow-wrap:anywhere]">{post.body}</p>)}
      {bodyFooter}
    </div>
    {post.photos && post.photos.length > 0 && <PostPhotos photos={post.photos} label={post.title} eager={mode === 'page'} />}
    {(post.categorySlug || post.areaName) && <p className="flex flex-wrap gap-1.5">
      {post.categorySlug && (linkBase
        ? <Link href={portal({ category: post.categorySlug })} className={flairLinkClass}>{card(`categories.${post.categorySlug}`)}</Link>
        : <span className={flairClass}>{card(`categories.${post.categorySlug}`)}</span>)}
      {post.areaName && (linkBase && post.areaSlug
        ? <Link href={portal({ area: post.areaSlug })} className={flairLinkClass}><MapPin aria-hidden="true" className="size-3" />{post.areaName}</Link>
        : <span className={flairClass}><MapPin aria-hidden="true" className="size-3" />{post.areaName}</span>)}
    </p>}
    {post.thankedHelper && <HelperRecommendation helper={post.thankedHelper} label="thanked" />}
    {mode === 'feed' && post.recommended && <ThreadRecommendations recommended={post.recommended} postHref={href} />}
    {post.task && <PostTaskLink task={post.task} />}
    <PostCardFooter
      post={post}
      mode={mode}
      onReact={onReact}
      {...(onSavePost ? { onSavePost } : {})}
      {...(onReplyInline ? { onReplyInline } : {})}
      {...(me ? { me } : {})}
      {...(onLoadReactors ? { onLoadReactors } : {})}
      {...(onReplyClick ? { onReplyClick } : {})}
      askForHelp={post.askForHelpHref ? <Link href={post.askForHelpHref} title={t('askForHelp.hint')} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-primary/35 px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring sm:flex-none"><HandHelping aria-hidden="true" className="size-4" />{t('askForHelp.action')}</Link> : null}
      previews={mode === 'feed' && post.previewReplies.length > 0
        ? <div className="space-y-3 rounded-2xl bg-muted/60 p-3">
            {post.previewReplies.map((reply) => <ReplyItem key={reply.id} reply={reply} now={now} onReact={onReact} compact />)}
            {post.replyCount > post.previewReplies.length && <Link href={href} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('seeReplies', { count: post.replyCount })}</Link>}
          </div>
        : null}
    />
  </article>;
}
