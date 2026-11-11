import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts';
import { PageHeader } from '@/ui/components/layout/page-header';
import { buttonVariants } from '@/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';

export function HowItWorksScreen() {
  const t = useTranslations('publicPages');
  return <div className="mx-auto max-w-reading space-y-section">
    <PageHeader title={t('howItWorks.title')} description={t('howItWorks.description')} />
    <Tabs defaultValue="poster" className="gap-6">
      <TabsList aria-label={t('howItWorks.tabLabel')} className="w-full"><TabsTrigger value="poster">{t('howItWorks.posterTab')}</TabsTrigger><TabsTrigger value="helper">{t('howItWorks.helperTab')}</TabsTrigger></TabsList>
      {(['poster', 'helper'] as const).map((role) => <TabsContent key={role} value={role} className="space-y-6">
        <h2 className="text-xl font-semibold">{t(`howItWorks.${role}.title`)}</h2>
        <ol className="space-y-6">{(['one', 'two', 'three', 'four', 'five'] as const).map((step, index) => <li key={step} className="flex gap-4"><span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground tabular-nums">{index + 1}</span><div className="min-w-0"><h3 className="text-[17px] leading-6 font-semibold lg:text-lg">{t(`howItWorks.${role}.${step}.title`)}</h3><p className="mt-2 text-muted-foreground">{t(`howItWorks.${role}.${step}.body`)}</p></div></li>)}</ol>
        <Link href={role === 'poster' ? routes.app.newTask() : routes.signIn(routes.app.helperOnboarding())} className={buttonVariants()}>{t(role === 'poster' ? 'shared.postTask' : 'howItWorks.helperAction')}</Link>
      </TabsContent>)}
    </Tabs>
    <aside className="space-y-3 rounded-xl border bg-secondary p-card text-secondary-foreground"><p>{t('shared.payment')}</p><p>{t('shared.privacy')}</p></aside>
  </div>;
}
