import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { CircleDollarSign, ClipboardCheck, HandCoins, Languages, Lock, MapPin, MessageSquareHeart, MessagesSquare, ShieldCheck, UsersRound, Wallet, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { routes } from '@/contracts/routes';
import { ClosingCta } from '@/ui/components/layout/closing-cta';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';

/** The product's principles (blueprint 01 §2), each with a picture. */
const PRINCIPLES = [
  { key: 'task', Icon: ClipboardCheck },
  { key: 'money', Icon: CircleDollarSign },
  { key: 'funded', Icon: Wallet },
  { key: 'privacy', Icon: Lock },
  { key: 'platform', Icon: MessagesSquare },
  { key: 'reviews', Icon: MessageSquareHeart },
  { key: 'account', Icon: UsersRound },
] as const;

const LINK = 'inline-flex min-h-11 items-center rounded-md font-medium text-primary underline underline-offset-4 hover:no-underline';
const CARD = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]';

/** A part of the page told beside its picture, as on the trust and safety page. */
function Told({ Icon, children }: { Icon: LucideIcon; children: ReactNode }) {
  return <div className="flex gap-3"><Icon aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" /><div className="min-w-0 space-y-3">{children}</div></div>;
}

/**
 * About TasksNearMe: what it is and does, what it stands for, where it's open, how it keeps people safe, what it
 * offers helpers, its two languages, and how to reach support. Search engines read it as the page about the
 * organization behind the site (the route adds its structured data); people read it to see who they're dealing with.
 */
export function AboutScreen() {
  const t = useTranslations('publicPages');
  return <div className="mx-auto max-w-reading space-y-section">
    <PageHeader title={t('about.title')} description={t('about.description')} />
    <Section title={t('about.whatTitle')}>
      <div className="space-y-3">
        <p>{t('about.whatBody1')}</p>
        <p className="text-muted-foreground">{t('about.whatBody2')}</p>
        <p className="text-muted-foreground">{t('about.whatBody3')}</p>
        <Link href={routes.pricing()} className={LINK}>{t('about.pricingLink')}</Link>
      </div>
    </Section>
    <Section title={t('about.principlesTitle')}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {/* Seven: the last one takes the whole row in two columns, rather than half of it. */}
        {PRINCIPLES.map(({ key, Icon }) => <li key={key} className={`flex gap-3 p-4 sm:last:col-span-2 ${CARD}`}>
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary"><Icon className="size-5" /></span>
          <div className="min-w-0"><h3 className="text-[17px] leading-6 font-semibold">{t(`about.principles.${key}.title`)}</h3><p className="mt-1 text-muted-foreground">{t(`about.principles.${key}.body`)}</p></div>
        </li>)}
      </ul>
    </Section>
    <Section title={t('about.whereTitle')}>
      <Told Icon={MapPin}>
        <p>{t('about.whereBody')}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={routes.cities()} className={buttonVariants({ variant: 'outline' })}>{t('about.whereCities')}</Link>
          <Link href={routes.waitlist()} className={buttonVariants({ variant: 'outline' })}>{t('about.whereWaitlist')}</Link>
        </div>
      </Told>
    </Section>
    <Section title={t('about.trustTitle')}>
      <Told Icon={ShieldCheck}><p>{t('about.trustBody')}</p><Link href={routes.trustAndSafety()} className={LINK}>{t('about.trustLink')}</Link></Told>
    </Section>
    <Section title={t('about.helpersTitle')}>
      <Told Icon={HandCoins}><p>{t('about.helpersBody')}</p><Link href={routes.becomeAHelper()} className={LINK}>{t('about.helpersLink')}</Link></Told>
    </Section>
    <Section title={t('about.languagesTitle')}>
      <Told Icon={Languages}><p>{t('about.languagesBody')}</p></Told>
    </Section>
    <ClosingCta
      title={t('about.contactTitle')}
      body={<>{t('about.contactBody')} <Link href={routes.help()} className="font-medium text-primary underline underline-offset-4 hover:no-underline">{t('about.helpLink')}</Link></>}
      action={{ href: routes.helpContact(), label: t('about.contactLink') }}
    />
  </div>;
}
