import Link from 'next/link';
import { BadgeCheck, CircleDollarSign, Lock, MessageSquare, Phone, ShieldCheck, Siren } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';

export function TrustSafetyScreen() {
  const t = useTranslations('publicPages');
  return <div className="mx-auto max-w-reading space-y-section">
    <PageHeader title={t('trustSafety.title')} description={t('trustSafety.description')} />
    <Section title={t('trustSafety.badgesTitle')}>
      <div className="divide-y rounded-[1.375rem] border border-foreground/[0.07] bg-card px-card shadow-card dark:border-white/[0.06]">{([{ key: 'identity', Icon: ShieldCheck }, { key: 'background', Icon: BadgeCheck }, { key: 'phone', Icon: Phone }] as const).map(({ key, Icon }) => <div key={key} className="flex gap-3 py-5"><Icon aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" /><div><h3 className="text-[17px] font-semibold">{t(`trustSafety.badges.${key}.title`)}</h3><p className="mt-2 text-muted-foreground">{t(`trustSafety.badges.${key}.body`)}</p></div></div>)}</div>
      <p className="text-sm text-muted-foreground">{t('trustSafety.badgesLimit')}</p>
    </Section>
    <Section title={t('trustSafety.privacyTitle')}><div className="flex gap-3"><Lock aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" /><div className="space-y-3"><p>{t('shared.privacy')}</p><p className="text-muted-foreground">{t('trustSafety.privacyBody')}</p><p className="text-muted-foreground">{t('trustSafety.contactMasking')}</p></div></div></Section>
    <Section title={t('trustSafety.paymentTitle')}><div className="flex gap-3"><CircleDollarSign aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" /><div className="space-y-3"><p>{t('shared.payment')}</p><p className="text-muted-foreground">{t('trustSafety.paymentBody')}</p><Link href={routes.pricing()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('trustSafety.pricingLink')}</Link></div></div></Section>
    <Section title={t('trustSafety.reviewsTitle')}><div className="flex gap-3"><MessageSquare aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" /><div className="space-y-3"><p>{t('trustSafety.reviewsBody')}</p><p className="text-muted-foreground">{t('trustSafety.reviewRewards')}</p></div></div></Section>
    <Section title={t('trustSafety.safetyTitle')}><div className="space-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card dark:border-white/[0.06]"><p className="flex items-start gap-3 font-semibold"><Siren aria-hidden="true" className="mt-1 size-6 shrink-0 text-destructive" />{t('trustSafety.emergency')}</p><p className="text-muted-foreground">{t('trustSafety.reporting')}</p><Link href={routes.help()} className={buttonVariants({ variant: 'outline' })}>{t('trustSafety.helpLink')}</Link></div></Section>
    <Section title={t('trustSafety.prohibitedTitle')}><p className="text-muted-foreground">{t('trustSafety.prohibitedBody')}</p><Link href={routes.legal('prohibited-tasks')} className={buttonVariants({ variant: 'outline', className: 'h-auto whitespace-normal text-center' })}>{t('trustSafety.prohibitedLink')}</Link></Section>
  </div>;
}
