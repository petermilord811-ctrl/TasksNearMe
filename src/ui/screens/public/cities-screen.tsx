import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowLeft, ChevronRight, MapPin } from 'lucide-react';
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

/**
 * A state's status, in the one vocabulary every page uses (audit H8): Open (a live city), Opening soon (pre-launch),
 * people waiting, or Not yet. The first two stand out as badges.
 */
function StateStatus({ state }: { state: DirectoryState }) {
  const t = useTranslations('cities');
  const badge = 'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold';
  if (state.liveCities > 0) return <span className={`${badge} bg-success/12 text-success`}>{t('states.open', { count: state.liveCities })}</span>;
  if (state.openCities > 0) return <span className={`${badge} bg-primary/10 text-primary`}>{t('states.opening', { count: state.openCities })}</span>;
  if (state.peopleWaiting > 0) return <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{t('states.waiting', { count: state.peopleWaiting })}</span>;
  return <span className="shrink-0 text-sm text-muted-foreground">{t('states.none')}</span>;
}

/** States as rows: the name, its status right after it (not at the far edge of a column, audit L22), and a chevron. */
function StateList({ states }: { states: DirectoryState[] }) {
  return <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
    {states.map((state) => <li key={state.code}>
      <Link href={routes.cities(state.slug)} className="group flex min-h-11 items-center gap-2.5 rounded-md py-2">
        <span className="font-medium underline-offset-4 group-hover:underline">{state.name}</span>
        <StateStatus state={state} />
        <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>)}
  </ul>;
}

/** The states with nothing yet, as names only, folded away so the page isn't 49 rows of "Not yet" (audit M49). */
function OtherStates({ states }: { states: DirectoryState[] }) {
  const t = useTranslations('cities');
  return <details className="group rounded-[1.375rem] border border-foreground/[0.07] dark:border-white/[0.06]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[1.375rem] px-card font-medium [&::-webkit-details-marker]:hidden">
      {t('states.browse', { count: states.length })}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
    </summary>
    <ul className="grid grid-cols-2 gap-x-4 px-card pb-3 sm:grid-cols-3 lg:grid-cols-4">
      {states.map((state) => <li key={state.code}>
        <Link href={routes.cities(state.slug)} className="flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline">{state.name}</Link>
      </li>)}
    </ul>
  </details>;
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
      {/* States with a city or people waiting first; the rest folded away. */}
      <div className="space-y-4">
        <StateList states={data.states.filter((state) => state.openCities > 0 || state.peopleWaiting > 0)} />
        <OtherStates states={data.states.filter((state) => state.openCities === 0 && state.peopleWaiting === 0)} />
      </div>
    </Section>
  </div>;
}

export function StateCitiesScreen({ data }: { data: StateCitiesPageData }) {
  const t = useTranslations('cities');
  const state = data.state.name;
  // Worded by what the state has: never "where we're open" for a state where nothing is open (audit L26).
  const intro = data.state.liveCities > 0 ? 'state.introLive' : data.state.openCities > 0 ? 'state.introOpening' : 'state.introNone';
  return <div className="space-y-section">
    <div className="space-y-4">
      <Link href={routes.cities()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />{t('state.back')}
      </Link>
      <PageHeader title={t('state.title', { state })} description={t(intro, { state })} />
      <Actions />
    </div>
    <Section title={t('open.title')}>
      <OpenCities cities={data.openCities} emptyText={t('state.noneYet', { state })} />
    </Section>
    <Section title={t('next.title')}>
      <ComingNext cities={data.comingNext} emptyText={t('next.empty')} />
    </Section>
    {data.others.length > 0 && <Section title={t('state.others')}>
      <StateList states={data.others} />
    </Section>}
  </div>;
}
