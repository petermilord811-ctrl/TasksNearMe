import { ImagePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PhoneVerifyHandlers, PortalPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { VerifyPhoneButton } from '@/ui/components/community/verify-phone-button';
import { InitialsAvatar } from '@/ui/components/people/initials-avatar';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

/**
 * Share something with your neighbors, at the top (completion plan 9.10, Nextdoor and Facebook; 2026-11-22, one line):
 * your avatar and the prompt, which opens the new-post form in a dialog over the page (src/app/[locale]/@modal/(.)app/
 * community/new; its URL alone opens the full page). The kind, words, photos and place are chosen there, so this stays
 * one slim line. Tasks are posted from the app's own "Post a task". While posting waits for a verified phone, it says so,
 * and "Verify your phone" verifies it in a dialog over the page (2026-11-23).
 */
export function PortalComposer({ data, handlers }: { data: Pick<PortalPageData, 'me' | 'postBlocked'>; handlers?: Partial<PhoneVerifyHandlers> }) {
  const t = useTranslations('portal.composer');
  const community = useTranslations('community');
  return <section aria-label={t('label')} className="rounded-2xl border border-border bg-card p-2 shadow-card">
    <div className="flex items-center gap-2">
      <InitialsAvatar initials={data.me.initials} photo={data.me.photo} size="sm" />
      <Link href={routes.app.newCommunityPost()} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted/60 pr-3 pl-3.5 text-[14px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <span className="min-w-0 flex-1 truncate">{t('prompt')}</span>
        <ImagePlus aria-hidden="true" className="size-4 shrink-0 text-primary" />
      </Link>
    </div>
    {data.postBlocked && <p role="status" className="mt-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
      {community(`postBlocked.${data.postBlocked}`)} {data.postBlocked === 'phone_required' && <VerifyPhoneButton handlers={handlers} />}
    </p>}
  </section>;
}
