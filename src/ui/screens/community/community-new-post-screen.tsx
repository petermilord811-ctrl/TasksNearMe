import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityNewPostHandlers, CommunityNewPostPageData } from '@/contracts/community';
import { routes } from '@/contracts/routes';
import { CommunityPostForm } from '@/ui/components/community/post-form';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { Card } from '@/ui/primitives/card';

export interface CommunityNewPostScreenProps { data: CommunityNewPostPageData; handlers: CommunityNewPostHandlers }

/**
 * A new community post (completion plan 7.7) on its own page: the same form as the portal's composer (9.10), for
 * links from elsewhere (an empty state's prompts, notifications, a page opened without JavaScript).
 */
export function CommunityNewPostScreen({ data, handlers }: CommunityNewPostScreenProps) {
  const t = useTranslations('community');
  return <div className="mx-auto max-w-2xl space-y-5">
    <Link href={routes.app.community()} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />{t('newPost.back')}</Link>
    <h1 className="font-display text-[1.75rem]/[1.15] font-semibold tracking-[-0.02em]">{t('newPost.title')}</h1>
    {data.postBlocked && <p role="status" className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">{t(`postBlocked.${data.postBlocked}`)} {data.postBlocked === 'phone_required' && <Link href={routes.app.account()} className="font-semibold text-primary underline underline-offset-4">{t('verifyPhone')}</Link>}</p>}
    <Card className="gap-0 p-4 sm:p-6">
      <CommunityPostForm data={data} initialKind={data.kind} onPost={handlers.onPost} label={t('newPost.title')} />
    </Card>
  </div>;
}
