import Link from 'next/link';
import { ArrowRight, BadgeCheck, Check, Gift, LockKeyhole, MapPin, ShieldCheck, WalletCards } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HomePageData, type ISODateTime } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { HomeHeroIllustration } from '@/ui/components/illustrations/home-hero-illustration';
import { NeighborhoodIllustration } from '@/ui/components/illustrations/neighborhood-illustration';
import { buttonVariants } from '@/ui/primitives/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/primitives/accordion';
import { HomeCategories, HomeFeeExample, HomeHelpers, HomeTasks } from './home-sections';

export function HomeScreen({ data, now }: { data: HomePageData; now: ISODateTime }) {
  const t = useTranslations('home.landing');
  return <div className="space-y-16 pb-8 md:space-y-24">
    <section className="grid items-center gap-6 pt-3 lg:grid-cols-[1.06fr_1fr] lg:gap-8 lg:pt-6">
      <div className="relative z-10">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold tracking-wide text-primary"><MapPin aria-hidden="true" className="size-4" />{t(`market.${data.market.status}`, { market: data.market.name, state: data.market.state })}</p>
        <h1 className="text-[46px]/[1.04] font-medium tracking-[-0.045em] sm:text-[60px] lg:text-[70px]">{t('hero.title')}<br /><span className="text-primary">{t('hero.titleAccent')}</span></h1>
        <p className="mt-6 max-w-md text-base/7 text-muted-foreground sm:text-lg/8">{t('hero.body')}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={routes.app.newTask()} className={buttonVariants({ size: 'lg', className: 'min-h-12 px-6 text-base' })}>{t('postTask')}<ArrowRight aria-hidden="true" /></Link>
          <Link href={routes.becomeAHelper()} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'min-h-12 px-5 text-base' })}>{t('becomeHelper')}</Link>
        </div>
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Check aria-hidden="true" className="size-4 shrink-0 text-primary" />{t('hero.note')}</p>
      </div>
      <div className="relative mx-auto w-full max-w-lg"><HomeHeroIllustration className="h-auto w-full" /><p className="mt-2 text-center text-xs tracking-wide text-muted-foreground">{t('hero.artNote')}</p></div>
    </section>
    <HomeCategories categories={data.categories} market={data.market} />
    <section aria-labelledby="home-steps" className="border-t border-border pt-12 md:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div><p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('steps.eyebrow')}</p><h2 id="home-steps" className="max-w-lg text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('steps.title')}</h2></div>
        <Link href={routes.howItWorks()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('steps.link')}<ArrowRight aria-hidden="true" /></Link>
      </div>
      <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">{(['post', 'choose', 'done'] as const).map((step, index) => <li key={step} className="flex gap-4 md:block"><span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/30 font-heading text-2xl text-primary tabular-nums">{index + 1}</span><div><h3 className="text-xl/7 font-semibold md:mt-5">{t(`steps.${step}.title`)}</h3><p className="mt-2 text-sm/6 text-muted-foreground">{t(`steps.${step}.body`)}</p></div></li>)}</ol>
    </section>
    <HomeFeeExample breakdown={data.feeExample} />
    <section aria-labelledby="home-trust">
      <p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('trust.eyebrow')}</p><h2 id="home-trust" className="max-w-xl text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('trust.title')}</h2>
      <div className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">{([{ key: 'identity', Icon: ShieldCheck }, { key: 'privacy', Icon: LockKeyhole }, { key: 'payment', Icon: WalletCards }, { key: 'reviews', Icon: BadgeCheck }] as const).map(({ key, Icon }) => <div key={key}><Icon aria-hidden="true" className="mb-4 size-7 text-primary" strokeWidth={1.5} /><h3 className="text-xl/7 font-semibold">{t(`trust.${key}.title`)}</h3><p className="mt-2 text-sm/6 text-muted-foreground">{t(`trust.${key}.body`)}</p></div>)}</div>
      <Link href={routes.trustAndSafety()} className={buttonVariants({ variant: 'link', className: 'mt-4 px-0' })}>{t('trust.link')}<ArrowRight aria-hidden="true" /></Link>
    </section>
    <HomeTasks tasks={data.recentTasks} market={data.market} now={now} />
    <HomeHelpers helpers={data.featuredHelpers} />
    <section aria-labelledby="home-for-helpers" className="grid gap-8 rounded-2xl border border-border bg-brand-soft p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14 lg:p-12">
      <div><p className="mb-3 text-xs font-semibold tracking-widest text-primary uppercase">{t('forHelpers.eyebrow')}</p><h2 id="home-for-helpers" className="max-w-lg text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('forHelpers.title')}</h2><p className="mt-4 max-w-lg text-base/7 text-muted-foreground">{t('forHelpers.body')}</p><Link href={routes.becomeAHelper()} className={buttonVariants({ className: 'mt-6 min-h-12' })}>{t('becomeHelper')}<ArrowRight aria-hidden="true" /></Link></div>
      <div className="flex flex-col justify-center gap-6"><ul className="space-y-4">{(['earnings', 'prices', 'repeat'] as const).map((key) => <li key={key} className="flex gap-3 text-sm/6"><Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />{t(`forHelpers.${key}`)}</li>)}</ul>
        {data.welcomeReward && <section aria-labelledby="home-welcome-reward" className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2"><Gift aria-hidden="true" className="size-5 text-primary" /><h3 id="home-welcome-reward" className="text-lg font-semibold">{t('forHelpers.rewardTitle')}</h3></div>
          <p className="mt-3 font-heading text-2xl font-semibold text-primary tabular-nums">{t('forHelpers.rewardAmount', { amount: formatMoney(data.welcomeReward.amountCents) })}</p>
          <p className="mt-2 text-sm/6 text-muted-foreground">{t('forHelpers.rewardBody', { count: data.welcomeReward.cohortLimit })}</p>
          <p className="mt-3 text-sm font-medium tabular-nums">{t('forHelpers.claimed', { claimed: data.welcomeReward.spotsClaimed, limit: data.welcomeReward.cohortLimit })}</p>
          <Link href={routes.becomeAHelper()} className={buttonVariants({ variant: 'link', className: 'mt-1 max-w-full px-0 text-left whitespace-normal' })}>{t('forHelpers.terms')}<ArrowRight aria-hidden="true" /></Link>
        </section>}
      </div>
    </section>
    <section aria-labelledby="home-coverage" className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
      <div><p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('coverage.eyebrow')}</p><h2 id="home-coverage" className="text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('coverage.title', { market: data.market.name })}</h2><p className="mt-4 text-base/7 text-muted-foreground">{t('coverage.body', { market: data.market.name, miles: data.market.serviceRadiusMiles })}</p>
        <ul className="mt-5 flex flex-wrap gap-2">{data.market.areaNames.map((area) => <li key={area} className="rounded-full border border-border bg-card px-3 py-2 text-sm">{area}</li>)}</ul>
        <p className="mt-6 text-sm text-muted-foreground">{t('coverage.outside')}</p><Link href={routes.waitlist()} className={buttonVariants({ variant: 'link', className: 'px-0' })}>{t('coverage.waitlist')}<ArrowRight aria-hidden="true" /></Link>
      </div><NeighborhoodIllustration className="mx-auto h-auto w-full max-w-lg" />
    </section>
    <section aria-labelledby="home-faq" className="grid gap-6 border-t border-border pt-12 md:grid-cols-[0.8fr_1.2fr] md:gap-16 md:pt-16">
      <div><p className="mb-3 text-xs font-semibold tracking-widest text-clay uppercase">{t('faq.eyebrow')}</p><h2 id="home-faq" className="text-3xl/9 font-medium tracking-tight md:text-[40px]/11">{t('faq.title')}</h2></div>
      <Accordion type="single" collapsible>{(['payment', 'address', 'account', 'rebook'] as const).map((key) => <AccordionItem key={key} value={key}><AccordionTrigger className="min-h-14 py-5 text-base">{t(`faq.${key}.question`)}</AccordionTrigger><AccordionContent className="text-base/7 text-muted-foreground">{t(`faq.${key}.answer`)}</AccordionContent></AccordionItem>)}</Accordion>
    </section>
    <section aria-labelledby="home-closing" className="rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground md:py-16">
      <p className="text-xs font-semibold tracking-widest uppercase">{t('closing.eyebrow')}</p><h2 id="home-closing" className="mx-auto mt-4 max-w-xl text-4xl/10 font-medium tracking-tight md:text-5xl/13">{t('closing.title')}</h2><p className="mt-4 text-base/7">{t('closing.body')}</p>
      <Link href={routes.app.newTask()} className={buttonVariants({ variant: 'secondary', size: 'lg', className: 'mt-7 min-h-12 px-6' })}>{t('postTask')}<ArrowRight aria-hidden="true" /></Link>
    </section>
  </div>;
}
