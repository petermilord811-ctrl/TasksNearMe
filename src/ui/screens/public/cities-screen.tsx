import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CitiesPageData, DirectoryState, OpenCity, StateCitiesPageData, WaitlistCity } from '@/contracts';
import { routes } from '@/contracts/routes';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Section } from '@/ui/components/layout/section';
import { buttonVariants } from '@/ui/primitives/button';

/**
 * Where TasksNearMe is open and where it goes next (completion plan 8.7): `/cities` with every state, and one page
 * per state. Real data only: the cities we serve and the ones people asked for (waitlist and waiting helpers).
 */
const card = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]';

function OpenCities({ cities, emptyText }: { cities: OpenCity[]; emptyText: string }) {
  const t = useTranslations('cities');
  if (cities.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return <ul className="grid gap-3 sm:grid-cols-2">
    {cities.map((city) => <li key={city.slug}>
      <Link href={routes.market(city.slug)} className={`flex min-h-16 items-center gap-3 ${card} transition-colors hover:border-primary/40`}>
        <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t('open.visit', { city: city.name })}</span>
          <span className="block text-sm text-muted-foreground">{t(`open.${city.status}`)}</span>
        </span>
      </Link>
    </li>)}
  </ul>;
}

function ComingNext({ cities, emptyText }: { cities: WaitlistCity[]; emptyText: string }) {
  const t = useTranslations('cities');
  const wait = useTranslations('waitlist');
  if (cities.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return <ol className={`divide-y divide-foreground/[0.07] dark:divide-white/[0.07] ${card}`}>
    {cities.map((city, index) => <li key={`${city.city}-${city.state}`} className="flex min-h-12 items-center gap-3 py-2">
      <span aria-hidden="true" className="w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}</span>
      <span className="min-w-0 flex-1 font-medium">{wait('comingNext.city', { city: city.city, state: city.state })}</span>
      <span className="shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {t('next.people', { count: city.people })}
        {city.helpersWaiting > 0 && <span className="block text-xs">{t('next.helpers', { count: city.helpersWaiting })}</span>}
      </span>
    </li>)}
  </ol>;
}

function Actions() {
  const t = useTranslations('cities');
  return <div className="flex flex-wrap gap-3">
    <Link href={routes.waitlist()} className={buttonVariants({ size: 'lg' })}>{t('actions.waitlist')}</Link>
    <Link href={routes.becomeAHelper()} className={buttonVariants({ size: 'lg', variant: 'outline' })}>{t('actions.helper')}</Link>
  </div>;
}

function StateList({ states }: { states: DirectoryState[] }) {
  const t = useTranslations('cities');
  return <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
    {states.map((state) => <li key={state.code}>
      <Link href={routes.cities(state.slug)} className="flex min-h-11 items-baseline justify-between gap-3 rounded-md py-2 underline-offset-4 hover:underline">
        <span className="font-medium">{state.name}</span>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {state.openCities > 0 ? t('states.open', { count: state.openCities }) : state.peopleWaiting > 0 ? t('states.waiting', { count: state.peopleWaiting }) : t('states.none')}
        </span>
      </Link>
    </li>)}
  </ul>;
}

export function CitiesScreen({ data }: { data: CitiesPageData }) {
  const t = useTranslations('cities');
  return <div className="space-y-section">
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('intro')} />
      <Actions />
    </div>
    <Section title={t('open.title')}>
      <OpenCities cities={data.openCities} emptyText={t('open.empty')} />
    </Section>
    <Section title={t('next.title')} description={t('next.intro')}>
      <ComingNext cities={data.comingNext} emptyText={t('next.empty')} />
    </Section>
    <Section title={t('states.title')}>
      <StateList states={data.states} />
    </Section>
  </div>;
}

export function StateCitiesScreen({ data }: { data: StateCitiesPageData }) {
  const t = useTranslations('cities');
  const state = data.state.name;
  return <div className="space-y-section">
    <div className="space-y-4">
      <Link href={routes.cities()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />{t('state.back')}
      </Link>
      <PageHeader title={t('state.title', { state })} description={t('state.intro', { state })} />
      <Actions />
    </div>
    <Section title={t('open.title')}>
      <OpenCities cities={data.openCities} emptyText={t('open.empty')} />
    </Section>
    <Section title={t('next.title')}>
      <ComingNext cities={data.comingNext} emptyText={t('next.empty')} />
    </Section>
    {data.others.length > 0 && <Section title={t('state.others')}>
      <StateList states={data.others} />
    </Section>}
  </div>;
}
