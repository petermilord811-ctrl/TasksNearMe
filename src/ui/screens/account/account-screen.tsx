import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AccountHandlers, type AccountPageData } from '@/contracts';
import { ProfilePhotoField } from '@/ui/components/forms/profile-photo-field';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { PushDeviceSetting } from '@/ui/components/push/push-device';
import { Button } from '@/ui/primitives/button';
import { AccountContact } from './account-contact';
import { AccountProfileForm } from './account-profile-form';
import { AccountPreferences } from './account-preferences';
import { AccountPrivacy, AccountSignOut } from './account-privacy';
import { AccountLanguage } from './account-language';
import { AccountActivity } from './account-activity';
import { AccountPasskeys } from './account-passkeys';
import { AccountSignIn } from './account-sign-in';
import { VerificationChecklist } from '../helper/helper-standing';
import { ACCOUNT_GROUPS, type AccountGroup } from './account-group-ids';
import { AccountGroupLink, AccountGroups, AccountGroupSection } from './account-groups';
import { OwnBadgesPanel } from '@/ui/components/people/achievement-badges';

// Phones: a little tighter (plan 9.14b).
const cardClass = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card dark:border-white/[0.06] p-3.5 shadow-card sm:p-6';

/**
 * The account in five groups (audit M37): Profile (photo and name, contact details, verification, badges), Sign-in
 * and security, Notifications (and the language), Plan and helping, and Privacy and data. An index at the top on
 * phones and beside them from 1024 px jumps to each; everything stays on the one page, so links into it still work.
 * On phones and tablets the groups fold (plan 9.14b): each is one row saying what's inside until it's opened, and the
 * one the person came for starts open (AccountGroups); from 1024 px all are open.
 */
export function AccountScreen({ data, handlers, initialDialog }: {
  data: AccountPageData;
  handlers: AccountHandlers;
  /** Previews only: an email or phone dialog open at its code step. */
  initialDialog?: { channel: 'email' | 'phone'; sentTo?: string };
}) {
  const t = useTranslations('account');
  const push = useTranslations('push');
  const badges = useTranslations('badges');
  const helperStatus = data.helper.status;
  // On phones the groups fold (plan 9.14b); these start open: Profile, or Sign-in when coming back from connecting
  // Google or Microsoft, and Privacy while a deletion is scheduled or a copy of the data is ready.
  const defaultOpen: AccountGroup[] = [data.signIn.notice ? 'security' : 'profile'];
  if (data.privacy.deletion || data.privacy.export?.status === 'ready') defaultOpen.push('privacy');
  return <div className="mx-auto w-full max-w-content space-y-6 lg:space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <AccountGroups defaultOpen={defaultOpen}>
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav aria-label={t('groups.label')} className="max-lg:mb-4 lg:sticky lg:top-24">
        {/* Phones: one row that scrolls sideways; each link opens its group as it jumps there. */}
        <ul className="flex gap-2 max-lg:-mx-gutter max-lg:overflow-x-auto max-lg:px-gutter max-lg:py-0.5 max-lg:[scrollbar-width:none] lg:flex-col lg:gap-0.5 max-lg:[&::-webkit-scrollbar]:hidden">
          {ACCOUNT_GROUPS.map((group) => <li key={group} className="shrink-0"><AccountGroupLink group={group} className="inline-flex min-h-10 items-center rounded-full border border-foreground/[0.1] bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:flex lg:min-h-11 lg:rounded-xl lg:border-transparent lg:bg-transparent lg:px-3 lg:text-muted-foreground lg:hover:bg-foreground/[0.05] lg:hover:text-foreground dark:border-white/[0.1] dark:lg:border-transparent">{t(`groups.${group}`)}</AccountGroupLink></li>)}
        </ul>
      </nav>
      <div className="min-w-0 space-y-3 lg:space-y-10">
        <AccountGroupSection id="profile" title={t('groups.profile')} summary={t('groups.summaries.profile')}>
          <div className={cardClass}>
            <Section headingLevel={3} title={t('profile.title')} description={t('profile.description')}>
              <ProfilePhotoField initials={data.profile.initials} photo={data.profile.photo} maxPhotoMegabytes={data.maxPhotoMegabytes} note={helperStatus === 'active' || helperStatus === 'paused' ? 'publicProfile' : undefined} onUpload={handlers.onUploadPhoto} onRemove={handlers.onRemovePhoto} />
              <div className="mt-6 border-t pt-6">
                <AccountProfileForm key={`${data.profile.firstName}-${data.profile.lastName}-${data.profile.displayName}`} profile={data.profile} onSave={handlers.onSaveProfile} />
              </div>
            </Section>
          </div>
          <div className={cardClass}><Section headingLevel={3} title={t('contact.title')} description={t('contact.description')}><AccountContact email={data.profile.email} phone={data.phone} held={data.contactChangesHeld === true} texts={data.textsOff !== true} handlers={handlers} initialDialog={initialDialog} /></Section></div>
          {/* The checklist says each check's state once; the same facts as badges above it repeated it (audit M37). */}
          {data.verification && <div className={cardClass}><Section headingLevel={3} title={t('verification.title')} description={t(`verification.descriptions.${data.verification.role === 'client' && !data.verification.steps.some((entry) => entry.step === 'phone') ? 'clientIdOnly' : data.verification.role}`)}>
            <VerificationChecklist steps={data.verification.steps} role={data.verification.role} />
          </Section></div>}
          {data.badges && <div className={cardClass}><Section headingLevel={3} title={badges('title')} description={badges('description')}><OwnBadgesPanel data={data.badges} /></Section></div>}
        </AccountGroupSection>
        <AccountGroupSection id="security" title={t('groups.security')} summary={t('groups.summaries.security')}>
          <div className={cardClass}><Section headingLevel={3} title={t('signIn.title')} description={t('signIn.description')}><AccountSignIn methods={data.signIn} held={data.contactChangesHeld === true} onConnect={handlers.onConnectSignIn} onDisconnect={handlers.onDisconnectSignIn} />{handlers.onPasskeyRegistrationOptions && handlers.onAddPasskey && handlers.onRemovePasskey && <AccountPasskeys passkeys={data.signIn.passkeys} held={data.contactChangesHeld === true} handlers={{ onPasskeyRegistrationOptions: handlers.onPasskeyRegistrationOptions, onAddPasskey: handlers.onAddPasskey, onRemovePasskey: handlers.onRemovePasskey }} />}</Section></div>
        </AccountGroupSection>
        <AccountGroupSection id="notifications" title={t('groups.notifications')} summary={t('groups.summaries.notifications')}>
          <div className={cardClass}><Section headingLevel={3} title={t('preferences.title')} description={t('preferences.description')}><AccountPreferences preferences={data.preferences} onSave={handlers.onSavePreference} /></Section></div>
          <div className={cardClass}><Section headingLevel={3} title={push('device.title')}><PushDeviceSetting push={data.push} handlers={handlers} /></Section></div>
          {handlers.onSaveLanguage && <div className={cardClass}><Section headingLevel={3} title={t('language.title')} description={t('language.description')}><AccountLanguage language={data.language} onSave={handlers.onSaveLanguage} /></Section></div>}
        </AccountGroupSection>
        <AccountGroupSection id="helping" title={t('groups.helping')} summary={t('groups.summaries.helping')}>
          {/* Two short cards side by side where there's room; a card on its own takes the row. */}
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 sm:[&>:only-child]:col-span-2">
          <div className={cardClass}><Section headingLevel={3} title={t('plan.title')} description={t('plan.description')}>
            <Button variant="outline" asChild className="h-auto min-h-11 max-w-full whitespace-normal"><Link href={routes.app.plan()}>{t('plan.link')}<ArrowRight aria-hidden="true" /></Link></Button>
          </Section></div>
          <div className={cardClass}><Section headingLevel={3} title={t('helper.title')} description={t(`helper.descriptions.${helperStatus}`)}>
            {helperStatus === 'suspended' ? <Link href={routes.help()} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t('helper.contactSupport')}</Link> : <Button variant="outline" asChild className="h-auto min-h-11 max-w-full whitespace-normal"><Link href={helperStatus === 'none' || helperStatus === 'draft' ? routes.app.helperOnboarding() : routes.app.helperProfile()}>{t(helperStatus === 'none' ? 'helper.become' : helperStatus === 'draft' ? 'helper.finish' : 'helper.edit')}<ArrowRight aria-hidden="true" /></Link></Button>}
          </Section></div>
          </div>
        </AccountGroupSection>
        <AccountGroupSection id="privacy" title={t('groups.privacy')} summary={t('groups.summaries.privacy')}>
          {data.activity && handlers.onSaveActivity && <div className={cardClass}><Section headingLevel={3} title={t('activity.title')} description={t('activity.description')}><AccountActivity shown={data.activity.shown} onSave={handlers.onSaveActivity} /></Section></div>}
          <div className={cardClass}><Section headingLevel={3} title={t('privacy.title')} description={t('privacy.description')}><AccountPrivacy privacy={data.privacy} handlers={handlers} /></Section></div>
          <AccountSignOut onSignOut={handlers.onSignOut} onRemovePushSubscription={handlers.onRemovePushSubscription} />
        </AccountGroupSection>
      </div>
    </div>
    </AccountGroups>
  </div>;
}
