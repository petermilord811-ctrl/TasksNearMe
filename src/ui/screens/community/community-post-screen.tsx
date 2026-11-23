import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityPostHandlers, CommunityPostPageData, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { CommunityItemActions } from '@/ui/components/community/item-actions';
import { CommunityPostLive } from '@/ui/components/community/community-live';
import { RepliesSinceVisit } from '@/ui/components/community/new-since-visit';
import { ThreadRecommendations } from '@/ui/components/community/post-card';
import { PostPageCard } from '@/ui/components/community/post-page-card';
import { CommunityReplyForm } from '@/ui/components/community/reply-form';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { VerifyPhoneButton } from '@/ui/components/community/verify-phone-button';
import { ReplyTargetProvider } from '@/ui/components/community/reply-target';
import { ThreadReplies } from '@/ui/components/community/thread-replies';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

export interface CommunityPostScreenProps { data: CommunityPostPageData; handlers: CommunityPostHandlers; now: ISODateTime }

const railCard = 'min-w-0 rounded-2xl border border-border bg-card p-3.5 shadow-card';
const railTitle = 'flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase';

/**
 * One community post and its conversation (completion plan 7.7–7.8, 9.10; plan 10): the post (photos, Save, Follow and
 * Edit in its menu, "Ask for help" on your own ask, or the task it became), the pinned answer first, then the replies in
 * order, folded after ten in a long thread, each with Thanks and Helpful and Reply; the author pins the answer that
 * helped; anyone can report; staff hide or remove with a reason. New replies arrive live, and the ones since your last
 * visit say "New". On wide screens a column beside it: the helpers named in the thread, more from the neighborhood, and
 * the rules.
 */
export function CommunityPostScreen({ data, handlers, now }: CommunityPostScreenProps) {
  const t = useTranslations('community');
  const { post, viewer } = data;
  // This browser's last look at the post marks the replies since (completion plan 7.6).
  const visitKey = `post:${post.id}`;
  const recommended = post.recommended ?? [];
  const related = data.related ?? [];
  return <ReplyTargetProvider>
    <div className="mx-auto grid max-w-content items-start gap-4 xl:grid-cols-[minmax(0,40rem)_17rem] xl:justify-center xl:gap-x-5">
      <div className="min-w-0 space-y-3.5">
        <CommunityPostLive postId={post.id} />
        <Link href={routes.app.community()} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>

        <PostPageCard post={post} now={now} handlers={handlers} canReply={viewer.canReply} actions={<CommunityItemActions
          target="post"
          id={post.id}
          label={post.title}
          own={viewer.isAuthor}
          onDelete={handlers.onDelete}
          {...(!viewer.isAuthor ? { reportHref: routes.app.report('post', post.id) } : {})}
          {...(viewer.isStaff && handlers.onModerate ? { onModerate: handlers.onModerate, hidden: Boolean(post.moderation) } : {})}
          {...(handlers.onFollow && post.follow && !post.moderation ? { follow: { postId: post.id, state: post.follow, onFollow: handlers.onFollow } } : {})}
          {...(handlers.onEdit && post.canEdit ? { edit: { item: { target: 'post', id: post.id, title: post.title, body: post.body, kind: post.kind }, onEdit: handlers.onEdit } } : {})}
        />} />

        {/* On phones the thread's named helpers come before the replies; wide screens show them beside. */}
        {recommended.length > 0 && <div className="xl:hidden"><ThreadRecommendations recommended={recommended} full /></div>}

        <section aria-labelledby="community-replies" className="space-y-3">
          <h2 id="community-replies" className="text-[15px] font-semibold">{t('replyCount', { count: data.replies.length })}<RepliesSinceVisit visitKey={visitKey} replies={data.replies.map((reply) => ({ at: reply.createdAt, own: reply.author.isYou }))} /></h2>
          {data.replies.length > 0 && <ThreadReplies data={data} handlers={handlers} now={now} visitKey={visitKey} />}
        </section>

        <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-card sm:p-4">
          {/* An open post this reader can't reply to says why, as a new post does (sweep P3); "Replies are closed" is for
              a post that is. */}
          {viewer.canReply
            ? <CommunityReplyForm data={data} onReply={handlers.onReply} {...(handlers.onUploadPhoto ? { onUploadPhoto: handlers.onUploadPhoto } : {})} />
            : viewer.replyBlocked
              ? <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t(`postBlocked.${viewer.replyBlocked}`)} {viewer.replyBlocked === 'phone_required' && <VerifyPhoneButton handlers={handlers} />}</p>
              : <p className="text-sm text-muted-foreground">{t('replyForm.closed')}</p>}
          <p className="text-xs text-muted-foreground">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
        </div>

        {related.length > 0 && <section aria-labelledby="community-related-phone" className={`${railCard} xl:hidden`}>
          <h2 id="community-related-phone" className={railTitle}><MessagesSquare aria-hidden="true" className="size-4 text-primary" />{t('related.title')}</h2>
          <RelatedList related={related} />
        </section>}
      </div>

      <aside aria-label={t('related.aside')} className="hidden space-y-3 xl:sticky xl:top-24 xl:block">
        {recommended.length > 0 && <ThreadRecommendations recommended={recommended} full stacked />}
        {related.length > 0 && <section aria-labelledby="community-related" className={railCard}>
          <h2 id="community-related" className={railTitle}><MessagesSquare aria-hidden="true" className="size-4 text-primary" />{t('related.title')}</h2>
          <RelatedList related={related} />
        </section>}
        <section aria-labelledby="community-rules" className={railCard}>
          <h2 id="community-rules" className={railTitle}>{t('related.rules')}</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{t('guidelines')}</p>
        </section>
      </aside>
    </div>
  </ReplyTargetProvider>;
}

/**
 * A post and its conversation in a dialog over the page it was opened from (2026-11-23, owner: "I hate to redirect to
 * new pages continually … if possible, use dialog"): a post's title or "View all replies" in the Neighbors feed, a
 * notification. The feed underneath keeps its place and filters. The same card, named helpers, replies and reply form
 * as the post's page, without its side column; loaded directly, the post's URL opens that page.
 */
export function CommunityPostDialog({ data, handlers, now }: CommunityPostScreenProps) {
  const t = useTranslations('community');
  const { post, viewer } = data;
  const visitKey = `post:${post.id}`;
  const recommended = post.recommended ?? [];
  return <ReplyTargetProvider>
    <RouteDialogHeader title={post.author.isYou ? t('postDialog.yours') : t('postDialog.title', { name: post.author.displayName })} />
    <RouteDialogBody className="space-y-3.5">
      <CommunityPostLive postId={post.id} />
      <PostPageCard post={post} now={now} handlers={handlers} canReply={viewer.canReply} headingLevel={2} actions={<CommunityItemActions
        target="post"
        id={post.id}
        label={post.title}
        own={viewer.isAuthor}
        onDelete={handlers.onDelete}
        {...(!viewer.isAuthor ? { reportHref: routes.app.report('post', post.id) } : {})}
        {...(viewer.isStaff && handlers.onModerate ? { onModerate: handlers.onModerate, hidden: Boolean(post.moderation) } : {})}
        {...(handlers.onFollow && post.follow && !post.moderation ? { follow: { postId: post.id, state: post.follow, onFollow: handlers.onFollow } } : {})}
        {...(handlers.onEdit && post.canEdit ? { edit: { item: { target: 'post', id: post.id, title: post.title, body: post.body, kind: post.kind }, onEdit: handlers.onEdit } } : {})}
      />} />
      {recommended.length > 0 && <ThreadRecommendations recommended={recommended} full />}
      <section aria-label={t('replyCount', { count: data.replies.length })} className="space-y-3">
        <h3 className="text-[15px] font-semibold">{t('replyCount', { count: data.replies.length })}<RepliesSinceVisit visitKey={visitKey} replies={data.replies.map((reply) => ({ at: reply.createdAt, own: reply.author.isYou }))} /></h3>
        {data.replies.length > 0 && <ThreadReplies data={data} handlers={handlers} now={now} visitKey={visitKey} />}
      </section>
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3.5 shadow-card sm:p-4">
        {viewer.canReply
          ? <CommunityReplyForm data={data} onReply={handlers.onReply} {...(handlers.onUploadPhoto ? { onUploadPhoto: handlers.onUploadPhoto } : {})} />
          : viewer.replyBlocked
            ? <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t(`postBlocked.${viewer.replyBlocked}`)} {viewer.replyBlocked === 'phone_required' && <VerifyPhoneButton handlers={handlers} />}</p>
            : <p className="text-sm text-muted-foreground">{t('replyForm.closed')}</p>}
        <p className="text-xs text-muted-foreground">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
      </div>
    </RouteDialogBody>
  </ReplyTargetProvider>;
}

function RelatedList({ related }: { related: NonNullable<CommunityPostPageData['related']> }) {
  const t = useTranslations('community');
  return <ul className="mt-2 space-y-0.5">{related.map((post) => <li key={post.id}>
    <Link href={routes.app.communityPost(post.id)} className="group/row -mx-2 block rounded-lg px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <span className="line-clamp-2 text-[13.5px] font-medium group-hover/row:text-primary">{post.title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{t(`kindBadge.${post.kind}`)} · {t('replyCount', { count: post.replyCount })}{post.areaName && <> · {post.areaName}</>}</span>
    </Link>
  </li>)}</ul>;
}
