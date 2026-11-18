import { ArrowRight, MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityTaskDiscussion } from '@/contracts';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

/**
 * A task's discussion (completion plan 9.10): the neighborhood post it came from ("Ask for help"), on the task's own
 * pages for the client and for helpers, with its replies, so what neighbors said travels with the task.
 */
export function TaskDiscussionLink({ discussion }: { discussion: CommunityTaskDiscussion }) {
  const t = useTranslations('community');
  return <Link href={routes.app.communityPost(discussion.postId)} className="group/discussion flex min-w-0 items-center gap-3 rounded-[1.375rem] border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary"><MessagesSquare className="size-5" /></span>
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('fromTask')}</span>
      <span className="mt-0.5 block truncate font-semibold group-hover/discussion:text-primary">{discussion.title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{t('replyCount', { count: discussion.replyCount })}</span>
    </span>
    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/discussion:translate-x-0.5" />
  </Link>;
}
