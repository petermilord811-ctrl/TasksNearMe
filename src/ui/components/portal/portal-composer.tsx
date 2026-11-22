'use client';

import { useState, type MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityPostInput, PhotoUploadResult, PortalPageData, QueryHandler } from '@/contracts';
import { COMMUNITY_POST_KINDS, type CommunityPostKind } from '@/contracts/community';
import { routes } from '@/contracts/routes';
import { kindIcons } from '@/ui/components/community/post-card';
import { CommunityPostForm } from '@/ui/components/community/post-form';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

const chipClass = 'inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Ask your neighbors, at the top (completion plan 9.10, Nextdoor and Reddit): your avatar and "Ask your
 * neighbors…", then the kinds of post, one tap each, and "Post a task" for the wizard. A tap opens the form right
 * here with that kind chosen (the same form as its own page, where the kind can still change); Cancel folds it
 * away. On phones it's one line, the prompt and a + for a task, so the stream starts sooner. Without JavaScript
 * each is a link to the new-post page. While posting waits for a verified phone, it says so and links there.
 */
export function PortalComposer({ data, onPost, onUploadPhoto }: { data: Pick<PortalPageData, 'composer' | 'me' | 'postBlocked'>; onPost: ActionHandler<CommunityPostInput>; onUploadPhoto?: QueryHandler<FormData, PhotoUploadResult> }) {
  const t = useTranslations('portal.composer');
  const community = useTranslations('community');
  const [kind, setKind] = useState<CommunityPostKind | null>(null);
  const open = (next: CommunityPostKind) => (event: MouseEvent) => {
    if (data.postBlocked) return;
    event.preventDefault();
    setKind(next);
  };

  return <section aria-label={t('label')} className="rounded-[1.375rem] border border-border bg-card p-3.5 shadow-card sm:p-4">
    {kind
      ? <CommunityPostForm data={data.composer} initialKind={kind} onPost={onPost} {...(onUploadPhoto ? { onUploadPhoto } : {})} label={t('label')} onCancel={() => setKind(null)} focusOnMount className="pt-1" />
      : <>
          <div className="flex items-center gap-3">
            <InitialsAvatar initials={data.me.initials} photo={data.me.photo} size="md" />
            <Link href={routes.app.newCommunityPost()} onClick={open('recommendation')} className="flex min-h-11 min-w-0 flex-1 items-center rounded-full border border-border bg-muted/50 px-4 text-[15px] text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <span className="truncate">{t('prompt')}</span>
            </Link>
            <Link href={routes.app.newTask()} aria-label={t('postTask')} title={t('postTask')} className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-primary transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring sm:hidden"><Plus aria-hidden="true" className="size-5" /></Link>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1 max-sm:hidden">
            {COMMUNITY_POST_KINDS.map((option) => {
              const Icon = kindIcons[option];
              return <li key={option}><Link href={routes.app.newCommunityPost(option)} onClick={open(option)} className={cn(chipClass, 'text-foreground/85 hover:bg-muted')}><Icon aria-hidden="true" className="size-4 text-primary" />{t(`kinds.${option}`)}</Link></li>;
            })}
            <li className="ml-auto"><Link href={routes.app.newTask()} className={cn(chipClass, 'bg-brand-soft text-primary hover:bg-secondary')}><Plus aria-hidden="true" className="size-4" />{t('postTask')}</Link></li>
          </ul>
          {data.postBlocked && <p role="status" className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
            {community(`postBlocked.${data.postBlocked}`)} {data.postBlocked === 'phone_required' && <Link href={routes.app.account()} className="font-semibold text-primary underline underline-offset-4">{community('verifyPhone')}</Link>}
          </p>}
        </>}
  </section>;
}
