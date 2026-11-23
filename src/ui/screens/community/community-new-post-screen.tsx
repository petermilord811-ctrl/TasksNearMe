import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityNewPostHandlers, CommunityNewPostPageData } from '@/contracts/community';
import { routes } from '@/contracts/routes';
import { CommunityPostForm } from '@/ui/components/community/post-form';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Card } from '@/ui/primitives/card';

export interface CommunityNewPostScreenProps { data: CommunityNewPostPageData; handlers: CommunityNewPostHandlers }

function PostBlockedNote({ data }: { data: CommunityNewPostPageData }) {
  const t = useTranslations('community');
  if (!data.postBlocked) return null;
  return <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t(`postBlocked.${data.postBlocked}`)} {data.postBlocked === 'phone_required' && <Link href={routes.app.account()} className="font-semibold text-primary underline underline-offset-4">{t('verifyPhone')}</Link>}</p>;
}

/**
 * A new community post (completion plan 7.7) on its own page: the same form as the dialog, for a link loaded directly
 * (an email, a refresh, a page opened without JavaScript).
 */
export function CommunityNewPostScreen({ data, handlers }: CommunityNewPostScreenProps) {
  const t = useTranslations('community');
  return <div className="mx-auto max-w-xl space-y-3">
    <Link href={routes.app.community()} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t('newPost.back')}</Link>
    <h1 className="font-display text-xl/7 font-semibold tracking-[-0.015em] sm:text-2xl/8">{t('newPost.title')}</h1>
    <PostBlockedNote data={data} />
    <Card className="gap-0 p-4 sm:p-5">
      <CommunityPostForm data={data} initialKind={data.kind} onPost={handlers.onPost} {...(handlers.onUploadPhoto ? { onUploadPhoto: handlers.onUploadPhoto } : {})} label={t('newPost.title')} />
    </Card>
  </div>;
}

/**
 * The same form in a dialog over the page it was opened from (2026-11-22, owner: "do post with dialog"): the composer,
 * a booking's "Write a thanks", Home's links. Posting closes it and the page underneath shows the new post.
 */
export function CommunityNewPostDialog({ data, handlers }: CommunityNewPostScreenProps) {
  const t = useTranslations('community');
  return <>
    <RouteDialogHeader title={t('newPost.title')} />
    <RouteDialogBody className="space-y-3">
      <PostBlockedNote data={data} />
      <CommunityPostForm data={data} initialKind={data.kind} onPost={handlers.onPost} {...(handlers.onUploadPhoto ? { onUploadPhoto: handlers.onUploadPhoto } : {})} label={t('newPost.title')} focusOnMount />
    </RouteDialogBody>
  </>;
}
