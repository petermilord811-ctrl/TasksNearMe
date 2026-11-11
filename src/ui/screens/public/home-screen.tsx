import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HomePageData, type ISODateTime } from '@/contracts';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/ui/primitives/accordion';
import { CategoryGrid, Coverage, FeaturedHelpers, RecentTasks, TrustStrip } from './marketing-sections';

export function HomeScreen({ data, now }: { data: HomePageData; now: ISODateTime }) {
  const t = useTranslations('publicPages');
  return <div className="space-y-section">
    <section className="grid gap-8 rounded-xl bg-secondary p-card text-secondary-foreground lg:grid-cols-[1.2fr_1fr] lg:p-8">
      <div className="space-y-5">
        <p className="flex items-center gap-2 text-sm font-medium"><MapPin aria-hidden="true" className="size-4" />{t('home.eyebrow', { market: data.market.name, state: data.market.state })}</p>
        <h1 className="max-w-lg text-[30px] leading-9 font-bold tracking-tight lg:text-[40px] lg:leading-12">{t('home.title')}</h1>
        <p className="max-w-lg">{t('home.description')}</p>
        <div className="flex flex-wrap gap-3"><Link href={routes.app.newTask()} className={buttonVariants()}>{t('shared.postTask')}<ArrowRight aria-hidden="true" /></Link><Link href={routes.taskBoard(data.market.slug)} className={buttonVariants({ variant: 'outline' })}>{t('home.browseTasks')}</Link></div>
      </div>
      <div className="rounded-xl bg-card p-card text-foreground shadow-card">
        <h2 className="text-xl font-semibold">{t('home.stepsTitle')}</h2>
        <ol className="mt-5 space-y-5">{(['post', 'choose', 'done'] as const).map((step, index) => <li key={step} className="flex gap-3"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground tabular-nums">{index + 1}</span><div><h3 className="text-[17px] font-semibold">{t(`home.steps.${step}.title`)}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`home.steps.${step}.body`)}</p></div></li>)}</ol>
        <Link href={routes.howItWorks()} className={buttonVariants({ variant: 'link', className: 'mt-3 px-0' })}>{t('home.howLink')}<ArrowRight aria-hidden="true" /></Link>
      </div>
    </section>
    <CategoryGrid categories={data.categories} market={data.market} />
    <TrustStrip />
    <RecentTasks tasks={data.recentTasks} now={now} />
    <FeaturedHelpers helpers={data.featuredHelpers} />
    <Coverage market={data.market} />
    <section className="flex flex-col gap-5 rounded-xl bg-secondary p-card text-secondary-foreground sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">{t('home.helperTitle')}</h2><p className="mt-2 max-w-xl">{t('home.helperBody')}</p></div><Link href={routes.becomeAHelper()} className={buttonVariants()}>{t('home.helperAction')}<ArrowRight aria-hidden="true" /></Link></section>
    <div className="mx-auto max-w-reading"><Section title={t('home.faqTitle')}><Accordion type="single" collapsible>{(['payment', 'address', 'account', 'rebook'] as const).map((key) => <AccordionItem key={key} value={key}><AccordionTrigger className="min-h-11 text-base">{t(`home.faq.${key}.question`)}</AccordionTrigger><AccordionContent className="text-base leading-6 text-muted-foreground">{t(`home.faq.${key}.answer`)}</AccordionContent></AccordionItem>)}</Accordion></Section></div>
  </div>;
}
