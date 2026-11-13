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
import { AccountSignIn } from './account-sign-in';

const cardClass = 'rounded-xl border bg-card p-4 shadow-card sm:p-6';

export function AccountScreen({ data, handlers, initialDialog }: {
  data: AccountPageData;
  handlers: AccountHandlers;
  /** Previews only: an email or phone dialog open at its code step. */
  initialDialog?: { channel: 'email' | 'phone'; sentTo?: string };
}) {
  const t = useTranslations('account');
  const push = useTranslations('push');
  const helperStatus = data.helper.status;
  return <div className="mx-auto w-full max-w-[720px] space-y-6 lg:space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <div className={cardClass}>
      <Section title={t('profile.title')} description={t('profile.description')}>
        <ProfilePhotoField initials={data.profile.initials} photo={data.profile.photo} maxPhotoMegabytes={data.maxPhotoMegabytes} note={helperStatus === 'active' || helperStatus === 'paused' ? 'publicProfile' : undefined} onUpload={handlers.onUploadPhoto} onRemove={handlers.onRemovePhoto} />
        <div className="mt-6 border-t pt-6">
          <AccountProfileForm key={`${data.profile.firstName}-${data.profile.lastName}-${data.profile.displayName}`} profile={data.profile} onSave={handlers.onSaveProfile} />
        </div>
      </Section>
    </div>
    <div className={cardClass}><Section title={t('contact.title')} description={t('contact.description')}><AccountContact email={data.profile.email} phone={data.phone} handlers={handlers} initialDialog={initialDialog} /></Section></div>
    <div className={cardClass}><Section title={t('signIn.title')} description={t('signIn.description')}><AccountSignIn methods={data.signIn} onConnect={handlers.onConnectSignIn} onDisconnect={handlers.onDisconnectSignIn} /></Section></div>
    <div className={cardClass}><Section title={t('preferences.title')} description={t('preferences.description')}><AccountPreferences preferences={data.preferences} onSave={handlers.onSavePreference} /></Section></div>
    <div className={cardClass}><Section title={push('device.title')}><PushDeviceSetting push={data.push} handlers={handlers} /></Section></div>
    <div className={cardClass}><Section title={t('helper.title')} description={t(`helper.descriptions.${helperStatus}`)}>
      {helperStatus === 'suspended' ? <Link href={routes.help()} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t('helper.contactSupport')}</Link> : <Button variant="outline" asChild className="h-auto min-h-11 max-w-full whitespace-normal"><Link href={helperStatus === 'none' || helperStatus === 'draft' ? routes.app.helperOnboarding() : routes.app.helperProfile()}>{t(helperStatus === 'none' ? 'helper.become' : helperStatus === 'draft' ? 'helper.finish' : 'helper.edit')}<ArrowRight aria-hidden="true" /></Link></Button>}
    </Section></div>
    <div className={cardClass}><Section title={t('privacy.title')} description={t('privacy.description')}><AccountPrivacy privacy={data.privacy} handlers={handlers} /></Section></div>
    <AccountSignOut onSignOut={handlers.onSignOut} />
  </div>;
}
