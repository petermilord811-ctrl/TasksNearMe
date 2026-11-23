import type { ReactNode } from 'react';
import { CircleHelp, CornerDownRight, HandHeart, HandHelping, Lightbulb, MapPin, MessageSquareText, Pin, Reply, Star, UserRoundSearch, type LucideIcon } from 'lucide-react';
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

export const kindIcons: Record<CommunityPostKind, LucideIcon> = { general: MessageSquareText, recommendation: UserRoundSearch, question: CircleHelp, tip: Lightbulb, thanks: HandHeart };
export const kindTone: Record<CommunityPostKind, string> = {
  general: 'bg-secondary text-secondary-foreground',
  recommendation: 'bg-badge-brand text-badge-brand-foreground',
  question: 'bg-badge-info text-badge-info-foreground',
  tip: 'bg-badge-warning text-badge-warning-foreground',
  thanks: 'bg-badge-success text-badge-success-foreground',
};

/**
 * The kind of post as a colored pill; on phones its icon alone (the word stays for screen readers), so the author's name
 * keeps the line. A general post has none: it's just a post.
 */
export function KindBadge({ kind }: { kind: CommunityPostKind }) {
  const t = useTranslations('community.kindBadge');
  if (kind === 'general') return null;
  const Icon = kindIcons[kind];
  return <span title={t(kind)} className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] leading-4 font-semibold max-sm:py-1', kindTone[kind])}><Icon aria-hidden="true" className="size-3" /><span className="max-sm:sr-only">{t(kind)}</span></span>;
}

/**
 * One reply (completion plan 7.7, plan 10): its author, who it answers ("Replying to Maya R."), the words, its photo, a
 * named helper, and its reactions. With `visitKey` (the post page's), a reply posted since the reader's last visit says
 * "New" (plan 7.6); with `onReplyTo`, a Reply button answers its author. `compact`: under a card in the feed, one line
 * for who and when, two for the words, a line for a named helper.
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
  return <article id={`reply-${reply.id}`} aria-label={reply.author.displayName} className={cn('min-w-0 scroll-mt-28', compact ? 'space-y-1' : 'space-y-1.5', reply.pinned && !compact && 'rounded-xl border border-primary/25 bg-brand-soft/40 p-2.5 sm:p-3', reply.moderation && 'rounded-xl border border-dashed border-destructive/50 p-2.5')}>
    <div className="flex items-center justify-between gap-2">
      <AuthorLine author={reply.author} at={reply.createdAt} now={now} size={compact ? 'xs' : 'sm'} {...(reply.editedAt ? { edited: reply.editedAt } : {})} />
      <div className="flex shrink-0 items-center gap-1">
        {visitKey && <NewSinceVisit at={reply.createdAt} visitKey={visitKey} own={reply.author.isYou} />}
        {reply.pinned && <span title={t('pinned')} className={cn('inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-px text-[10.5px] leading-4 font-semibold text-primary-foreground', compact && 'max-sm:py-1')}><Pin aria-hidden="true" className="size-3" /><span className={compact ? 'max-sm:sr-only' : undefined}>{t('pinned')}</span></span>}
        {actions}
      </div>
    </div>
    {reply.moderation && <p className="text-xs font-semibold text-destructive">{t(`moderation.${reply.moderation.status}`)}{reply.moderation.reason && <> · {t('moderation.reason', { reason: reply.moderation.reason === 'reports' ? t('moderation.byReports') : reply.moderation.reason })}</>}</p>}
    {reply.replyTo && !compact && <a href={`#reply-${reply.replyTo.id}`} className="inline-flex min-h-6 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"><CornerDownRight aria-hidden="true" className="size-3.5" />{t('replyingTo', { name: reply.replyTo.authorName })}</a>}
    <p className={cn('whitespace-pre-line [overflow-wrap:anywhere]', compact ? 'line-clamp-2 text-[13.5px]/5' : 'text-[14.5px]/6')}>{reply.body}</p>
    {reply.photo && !compact && <PostPhotos photos={[reply.photo]} label={reply.author.displayName} compact />}
    {footer}
    {reply.recommendedHelper && <HelperRecommendation helper={reply.recommendedHelper} label="recommended" compact={compact} />}
    {!compact && <div className="flex flex-wrap items-center gap-1">
      <ReactionBar target={{ kind: 'reply', id: reply.id }} reactions={reply.reactions} own={reply.author.isYou} onReact={onReact} />
      {onReplyTo && !reply.author.isYou && !reply.moderation && <button type="button" onClick={() => onReplyTo(reply)} aria-label={t('replyToPerson', { name: reply.author.displayName })} className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.06]">
        <Reply aria-hidden="true" className="size-4" /><span className="max-sm:sr-only">{t('replyTo')}</span>
      </button>}
    </div>}
  </article>;
}

/**
 * "Recommended in this thread" (plan 10.4): the helpers neighbors named on a recommendation request, most named first,
 * each with how many named them and Request. On a card, one line with the first and how many more; on the post's page,
 * all. `stacked`: the actions under each name (the post page's narrow side column).
 */
export function ThreadRecommendations({ recommended, postHref, full = false, stacked = false }: { recommended: CommunityThreadHelper[]; postHref?: string; full?: boolean; stacked?: boolean }) {
  const t = useTranslations('community.threadHelpers');
  const card = useTranslations('community.helperCard');
  if (recommended.length === 0) return null;
  if (!full) {
    const { helper, count } = recommended[0]!;
    const more = recommended.length - 1;
    return <section aria-label={t('label')} className="flex min-w-0 items-center gap-2 rounded-xl bg-brand-soft/50 py-1 pr-1 pl-2.5 text-[13px]">
      <Star aria-hidden="true" className="size-3.5 shrink-0 fill-current text-sun" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{helper.selfTag ? t('selfTagged', { name: helper.displayName }) : t('recommendedBy', { count, name: helper.displayName })}</span>
        {helper.rating && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">★ {helper.rating.average.toFixed(1)} ({helper.rating.count})</span>}
        {more > 0 && postHref && <> · <Link href={postHref} className="rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('more', { count: more })}</Link></>}
      </p>
      {helper.requestHref && <Link href={helper.requestHref} aria-label={card('requestLabel', { name: helper.displayName })} className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-primary/35 bg-card px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring">{card('request')}</Link>}
    </section>;
  }
  return <section aria-label={t('label')} className="rounded-xl border border-primary/20 bg-brand-soft/40 p-2.5">
    <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Star aria-hidden="true" className="size-3.5 fill-current text-sun" />{t('title')}</h2>
    <ul className="space-y-1.5">{recommended.map(({ helper, count }) => <li key={helper.handle} className={cn('flex min-w-0', stacked ? 'flex-col items-start gap-0.5' : 'items-center justify-between gap-3')}>
      <p className="min-w-0 text-[13.5px] leading-snug">
        <span className="font-semibold">{helper.selfTag ? t('selfTagged', { name: helper.displayName }) : t('recommendedBy', { count, name: helper.displayName })}</span>
        {helper.rating && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">★ {helper.rating.average.toFixed(1)} ({helper.rating.count})</span>}
      </p>
      <span className={cn('flex shrink-0 items-center gap-1', stacked && '-ml-2')}>
        <Link href={routes.helperProfile(helper.handle)} className="hidden min-h-8 items-center rounded-full px-2 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex">{card('view')}</Link>
        {helper.requestHref && <Link href={helper.requestHref} aria-label={card('requestLabel', { name: helper.displayName })} className="inline-flex min-h-8 items-center rounded-full border border-primary/35 bg-card px-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring">{card('request')}</Link>}
      </span>
    </li>)}</ul>
  </section>;
}

const metaLinkClass = 'inline-flex items-center gap-0.5 rounded-sm underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring';

export interface PostCardProps {
  post: CommunityPostView;
  now: ISODateTime;
  onReact: ActionHandler<CommunityReactInput>;
  mode?: 'feed' | 'page';
  actions?: ReactNode;
  /** Save (plan 9.10); without it, no Save button. */
  onSavePost?: ActionHandler<{ postId: string; saved: boolean }>;
  /** The portal's filters (plan 9.10): the service and neighborhood become links that filter by them. */
  linkBase?: PortalQuery;
  /**
   * The heading level: in the feed the portal's cards sit under an h2 for the list (2, 3); on the post's page its title
   * is the page's h1, and in its dialog an h2 under the dialog's own (2026-11-23).
   */
  headingLevel?: 1 | 2 | 3;
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
 * A post in the feed or at the top of its page (completion plan 7.7, 9.10; plan 10, Nextdoor's card; 2026-11-22, lighter):
 * who wrote it, where and when (the time is its link), what kind it is, the question and its words (folded with "More"
 * in the feed), its photos, its service and neighborhood on one quiet line (links that filter in the portal), a thanked
 * helper or the helpers named in the thread, the task it became, a line of what neighbors did and a row of actions, and
 * in the feed its pinned answer or latest replies with a reply box. A general post has no title: its words come first
 * (the title the server made from them names it for screen readers).
 */
export function PostCard({ post, now, onReact, mode = 'feed', actions, onSavePost, linkBase, headingLevel = mode === 'page' ? 1 : 2, onReplyInline, me, onLoadReactors, onFollow, onEdit, onDelete, onReplyClick, bodyFooter }: PostCardProps) {
  const t = useTranslations('community');
  const card = useTranslations('taskCard');
  const href = routes.app.communityPost(post.id);
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 3 ? 'h3' : 'h2';
  const untitled = post.kind === 'general';
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
  const words = post.body && (mode === 'feed'
    ? <ExpandableText text={post.body} words={searched} lines={untitled ? 5 : 3} className={untitled ? 'text-[15px]/6' : 'text-[14.5px]/6 text-foreground/85'} />
    : <p className={cn('whitespace-pre-line [overflow-wrap:anywhere]', untitled ? 'text-[16px]/7' : 'text-[15px]/6 text-foreground/90')}>{post.body}</p>);
  return <article aria-labelledby={`post-${post.id}`} className={cn('min-w-0 space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-card sm:p-4', post.moderation && 'border-dashed border-destructive/50')}>
    <div className="flex items-start justify-between gap-2">
      <AuthorLine author={post.author} at={post.createdAt} now={now} {...(mode === 'feed' ? { href } : {})} {...(post.editedAt ? { edited: post.editedAt } : {})} />
      <div className="flex shrink-0 items-center gap-0.5"><KindBadge kind={post.kind} />{actions ?? feedMenu}</div>
    </div>
    {post.moderation && <p className="text-sm font-semibold text-destructive">{t(`moderation.${post.moderation.status}`)}{post.moderation.reason && <> · {t('moderation.reason', { reason: post.moderation.reason === 'reports' ? t('moderation.byReports') : post.moderation.reason })}</>}</p>}
    <div className="space-y-1">
      {untitled
        ? <Heading id={`post-${post.id}`} className="sr-only">{post.title}</Heading>
        : <Heading id={`post-${post.id}`} className={cn('font-display font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]', mode === 'page' ? 'text-xl/7 sm:text-[1.375rem]/[1.3]' : 'text-[15.5px]/[1.35]')}>
            {mode === 'feed' ? <Link href={href} className="rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Highlight text={post.title} words={searched} /></Link> : post.title}
          </Heading>}
      {words}
      {bodyFooter}
    </div>
    {post.photos && post.photos.length > 0 && <PostPhotos photos={post.photos} label={post.title} eager={mode === 'page'} />}
    {(post.categorySlug || post.areaName) && <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      {post.categorySlug && (linkBase
        ? <Link href={portal({ category: post.categorySlug })} className={metaLinkClass}>{card(`categories.${post.categorySlug}`)}</Link>
        : <span>{card(`categories.${post.categorySlug}`)}</span>)}
      {post.categorySlug && post.areaName && <span aria-hidden="true">·</span>}
      {post.areaName && (linkBase && post.areaSlug
        ? <Link href={portal({ area: post.areaSlug })} className={metaLinkClass}><MapPin aria-hidden="true" className="size-3" />{post.areaName}</Link>
        : <span className="inline-flex items-center gap-0.5"><MapPin aria-hidden="true" className="size-3" />{post.areaName}</span>)}
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
      askForHelp={post.askForHelpHref ? <Link href={post.askForHelpHref} title={t('askForHelp.hint')} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-primary/35 px-3 text-[13px] font-semibold whitespace-nowrap text-primary transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring"><HandHelping aria-hidden="true" className="size-4" />{t('askForHelp.action')}</Link> : null}
      previews={mode === 'feed' && post.previewReplies.length > 0
        ? <div className="space-y-2 rounded-xl bg-muted/50 p-2.5">
            {post.previewReplies.map((reply) => <ReplyItem key={reply.id} reply={reply} now={now} onReact={onReact} compact />)}
            {post.replyCount > post.previewReplies.length && <Link href={href} className="inline-flex min-h-7 items-center text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('seeReplies', { count: post.replyCount })}</Link>}
          </div>
        : null}
    />
  </article>;
}
