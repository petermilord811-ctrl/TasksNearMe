import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { BadgeCheck, CalendarCheck2, Camera, CreditCard, Lock, MessagesSquare, PencilLine, Search, ShieldCheck, Star, UsersRound, Wallet, type LucideIcon } from 'lucide-react';
import { routes } from '@/contracts/routes';
import { PageHeader } from '@/ui/components/layout/page-header';
import { buttonVariants } from '@/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs';

const STEPS = ['one', 'two', 'three', 'four', 'five'] as const;

/** One picture per step, so the five steps read at a glance (the number stays in the step's label). */
const STEP_ICONS: Record<'poster' | 'helper', readonly LucideIcon[]> = {
  poster: [PencilLine, UsersRound, CalendarCheck2, MessagesSquare, Star],
  helper: [BadgeCheck, Search, CalendarCheck2, Camera, Wallet],
};

const PROMISES = [
  { key: 'payment', Icon: CreditCard },
  { key: 'privacy', Icon: Lock },
  { key: 'identity', Icon: ShieldCheck },
] as const;

/**
 * How it works: the five steps for each side in tabs, and beside them (below them on phones) what holds for
 * everyone: when you pay, your address, and ID-checked helpers. On wide screens that column stays in view.
 */
export function HowItWorksScreen() {
  const t = useTranslations('publicPages');
  return <div className="space-y-section">
    <PageHeader title={t('howItWorks.title')} description={t('howItWorks.description')} />
    <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-14">
      <Tabs defaultValue="poster" className="min-w-0 gap-6">
        <TabsList aria-label={t('howItWorks.tabLabel')} className="w-full"><TabsTrigger value="poster">{t('howItWorks.posterTab')}</TabsTrigger><TabsTrigger value="helper">{t('howItWorks.helperTab')}</TabsTrigger></TabsList>
        {(['poster', 'helper'] as const).map((role) => <TabsContent key={role} value={role} className="space-y-7">
          <h2 className="font-display text-xl font-semibold tracking-[-0.015em]">{t(`howItWorks.${role}.title`)}</h2>
          <ol className="relative space-y-7 before:absolute before:top-5 before:bottom-5 before:left-5 before:w-px before:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_35%,transparent),color-mix(in_oklab,var(--violet)_25%,transparent))]">
            {STEPS.map((step, index) => {
              const Icon = STEP_ICONS[role][index]!;
              return <li key={step} className="relative flex gap-4">
                <span aria-hidden="true" className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary ring-4 ring-background"><Icon className="size-5" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.06em] text-primary uppercase tabular-nums">{t('howItWorks.step', { number: index + 1 })}</p>
                  <h3 className="mt-0.5 font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] lg:text-lg">{t(`howItWorks.${role}.${step}.title`)}</h3>
                  <p className="mt-1.5 text-muted-foreground">{t(`howItWorks.${role}.${step}.body`)}</p>
                </div>
              </li>;
            })}
          </ol>
          <Link href={role === 'poster' ? routes.app.newTask() : routes.signIn(routes.app.helperOnboarding())} className={buttonVariants({ className: 'ml-14' })}>{t(role === 'poster' ? 'shared.postTask' : 'howItWorks.helperAction')}</Link>
        </TabsContent>)}
      </Tabs>
      <aside aria-labelledby="how-promises" className="space-y-4 lg:sticky lg:top-28">
        <h2 id="how-promises" className="font-display text-xl font-semibold tracking-[-0.015em]">{t('shared.trustTitle')}</h2>
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {PROMISES.map(({ key, Icon }) => <li key={key} className="flex gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:flex-col lg:flex-row dark:border-white/[0.06]">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary"><Icon className="size-5" /></span>
            <div className="min-w-0">
              <h3 className="font-semibold">{t(`shared.${key}Title`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`shared.${key}`)}</p>
            </div>
          </li>)}
        </ul>
      </aside>
    </div>
  </div>;
}
