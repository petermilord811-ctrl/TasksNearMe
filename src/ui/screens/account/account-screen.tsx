import Link from 'next/link';
import { ArrowRight, BadgeCheck, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AccountHandlers, type AccountPageData } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { Button } from '@/ui/primitives/button';
import { AccountProfileForm } from './account-profile-form';
import { AccountPreferences } from './account-preferences';
import { AccountPrivacy, AccountSignOut } from './account-privacy';
import { AccountSignIn } from './account-sign-in';

const cardClass = 'rounded-xl border bg-card p-4 shadow-card sm:p-6';

export function AccountScreen({ data, handlers }: { data: AccountPageData; handlers: AccountHandlers }) {
  const t = useTranslations('account');
  const helperStatus = data.helper.status;
  return <div className="mx-auto w-full max-w-[720px] space-y-6 lg:space-y-8">
    <PageHeader title={t('title')} description={t('description')} />
    <div className={cardClass}>
      <Section title={t('profile.title')} description={t('profile.description')}>
        <AccountProfileForm key={`${data.profile.firstName}-${data.profile.lastName}-${data.profile.displayName}`} profile={data.profile} onSave={handlers.onSaveProfile} />
        <dl className="mt-6 space-y-4 border-t pt-6 text-sm">
          <div><dt className="font-medium">{t('profile.email')}</dt><dd className="mt-1 break-all text-muted-foreground">{data.profile.email}</dd><dd className="mt-1 text-muted-foreground">{t('profile.emailHint')}</dd></div>
          <div><dt className="font-medium">{t('profile.phone')}</dt><dd className="mt-1 flex items-center gap-2 text-muted-foreground">{data.phone?.verified ? <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-success" /> : <Phone aria-hidden="true" className="size-4 shrink-0" />}<span className="tabular-nums">{data.phone ? t(data.phone.verified ? 'profile.phoneVerified' : 'profile.phoneUnverified', { last4: data.phone.last4 }) : t('profile.noPhone')}</span></dd>{!data.phone && <dd className="mt-1 text-muted-foreground">{t('profile.noPhoneHint')}</dd>}</div>
        </dl>
      </Section>
    </div>
    <div className={cardClass}><Section title={t('signIn.title')} description={t('signIn.description')}><AccountSignIn methods={data.signIn} onConnect={handlers.onConnectSignIn} onDisconnect={handlers.onDisconnectSignIn} /></Section></div>
    <div className={cardClass}><Section title={t('preferences.title')} description={t('preferences.description')}><AccountPreferences preferences={data.preferences} onSave={handlers.onSavePreference} /></Section></div>
    <div className={cardClass}><Section title={t('helper.title')} description={t(`helper.descriptions.${helperStatus}`)}>
      {helperStatus === 'suspended' ? <Link href={routes.help()} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t('helper.contactSupport')}</Link> : <Button variant="outline" asChild className="h-auto min-h-11 max-w-full whitespace-normal"><Link href={helperStatus === 'none' || helperStatus === 'draft' ? routes.app.helperOnboarding() : routes.app.helperProfile()}>{t(helperStatus === 'none' ? 'helper.become' : helperStatus === 'draft' ? 'helper.finish' : 'helper.edit')}<ArrowRight aria-hidden="true" /></Link></Button>}
    </Section></div>
    <div className={cardClass}><Section title={t('privacy.title')} description={t('privacy.description')}><AccountPrivacy privacy={data.privacy} handlers={handlers} /></Section></div>
    <AccountSignOut onSignOut={handlers.onSignOut} />
  </div>;
}
