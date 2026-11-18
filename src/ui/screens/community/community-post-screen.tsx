import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityPostHandlers, CommunityPostPageData, ISODateTime } from '@/contracts';
import { routes } from '@/contracts/routes';
import { CommunityItemActions } from '@/ui/components/community/item-actions';
import { CommunityPostLive } from '@/ui/components/community/community-live';
import { RepliesSinceVisit } from '@/ui/components/community/new-since-visit';
import { PostCard } from '@/ui/components/community/post-card';
import { CommunityReplyForm } from '@/ui/components/community/reply-form';
import { ThreadReplies } from '@/ui/components/community/thread-replies';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

export interface CommunityPostScreenProps { data: CommunityPostPageData; handlers: CommunityPostHandlers; now: ISODateTime }

/**
 * One community post and its conversation (completion plan 7.7–7.8, 9.10): the post (Save, and "Ask for help" on
 * your own ask, or the task it became), the pinned answer first, then the replies in order, folded after ten in a
 * long thread, each with Thanks and Helpful; the author pins the answer that helped; anyone can report; staff hide
 * or remove with a reason. New replies arrive live, and the ones since your last visit say "New".
 */
export function CommunityPostScreen({ data, handlers, now }: CommunityPostScreenProps) {
  const t = useTranslations('community');
  const { post, viewer } = data;
  // This browser's last look at the post marks the replies since (completion plan 7.6).
  const visitKey = `post:${post.id}`;
  return <div className="mx-auto max-w-2xl space-y-5">
    <CommunityPostLive postId={post.id} />
    <Link href={routes.app.community()} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t('back')}</Link>

    <PostCard post={post} now={now} onReact={handlers.onReact} mode="page" {...(handlers.onSavePost ? { onSavePost: handlers.onSavePost } : {})} actions={<CommunityItemActions
      target="post"
      id={post.id}
      label={post.title}
      own={viewer.isAuthor}
      onDelete={handlers.onDelete}
      {...(!viewer.isAuthor ? { reportHref: routes.app.report('post', post.id) } : {})}
      {...(viewer.isStaff && handlers.onModerate ? { onModerate: handlers.onModerate, hidden: Boolean(post.moderation) } : {})}
    />} />

    <section aria-labelledby="community-replies" className="space-y-4">
      <h2 id="community-replies" className="text-base font-semibold">{t('replyCount', { count: data.replies.length })}<RepliesSinceVisit visitKey={visitKey} replies={data.replies.map((reply) => ({ at: reply.createdAt, own: reply.author.isYou }))} /></h2>
      {data.replies.length > 0 && <ThreadReplies data={data} handlers={handlers} now={now} visitKey={visitKey} />}
    </section>

    <div className="space-y-3 rounded-[1.375rem] border border-border bg-card p-4 shadow-card sm:p-5">
      {viewer.canReply ? <CommunityReplyForm data={data} onReply={handlers.onReply} /> : <p className="text-sm text-muted-foreground">{t('replyForm.closed')}</p>}
      <p className="text-xs text-muted-foreground">{t('guidelines')} <Link href={routes.legal('community-guidelines')} className="font-medium text-primary underline underline-offset-4">{t('guidelinesLink')}</Link></p>
    </div>
  </div>;
}
