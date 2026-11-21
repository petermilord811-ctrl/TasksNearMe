import { ArrowRight, CircleDot, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type CitylessHomeData, type CityStatus, type WaitlistHandlers } from '@/contracts';
import { StepsSection } from '@/ui/landing/sections';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';
import { WaitlistScreen } from './waitlist-screen';

export interface CitylessHomeScreenProps {
  data: CitylessHomeData;
  handlers: WaitlistHandlers;
}

const STATUS_STYLE: Record<CityStatus['status'], string> = {
  live: 'bg-success/12 text-success',
  prelaunch: 'bg-brand-soft text-primary',
  paused: 'bg-foreground/[0.06] text-muted-foreground',
};

/**
 * The site's home while its city isn't open (the default city paused, or none open yet; launch rehearsal J-L1): the
 * same promise without a city's counts or map, every city with its status (open ones link to their pages; paused ones
 * don't, their pages answer 404), the waitlist sign-up, and how it works. It answers 200 and stays the site's home for
 * search engines; nothing on it is about one city.
 */
export function CitylessHomeScreen({ data, handlers }: CitylessHomeScreenProps) {
  const t = useTranslations('landing.cityless');
  const hero = useTranslations('landing.hero');
  return (
    <div className="paper">
      <section aria-labelledby="cityless-title" className="relative mx-auto w-full max-w-content px-gutter pt-32 pb-14 sm:pt-36 lg:pt-[clamp(6.5rem,15svh,10rem)] lg:pb-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem]"
          style={{ background: 'radial-gradient(52% 60% at 18% 18%, color-mix(in oklab, var(--iri-1) 12%, transparent), transparent 70%), radial-gradient(40% 50% at 82% 8%, color-mix(in oklab, var(--iri-3) 12%, transparent), transparent 72%)' }}
        />
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t('eyebrow')}</p>
        <h1 id="cityless-title" className="mt-3 max-w-4xl font-display text-5xl leading-[0.98] font-semibold tracking-[-0.04em] sm:text-6xl lg:text-7xl">
          {hero('line1')} {hero('line2')} <span className="font-accent font-normal tracking-[-0.01em] text-violet italic">{hero('line3Vivid')}</span>
          {hero('line3Rest')}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">{t('subtitle')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="#waitlist" className={buttonVariants({ size: 'lg', className: 'min-h-12 rounded-full px-6' })}>
            {t('joinCta')}
          </a>
          <Link href={routes.becomeAHelper()} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'min-h-12 rounded-full px-6' })}>
            {t('helperCta')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="cityless-cities" className="mx-auto w-full max-w-content px-gutter pb-14 lg:pb-20">
        <h2 id="cityless-cities" className="font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t('citiesTitle')}</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('citiesBody')}</p>
        {data.cities.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-foreground/[0.07] bg-card p-5 text-muted-foreground shadow-card dark:border-white/[0.06]">{t('noCities')}</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.cities.map((city) => {
              const name = t('cityName', { city: city.name, state: city.state });
              const open = city.status !== 'paused';
              return (
                <li key={city.slug} className="flex min-h-20 items-center gap-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card dark:border-white/[0.06]">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary">
                    <MapPin className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name}</p>
                    <p className={cn('mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLE[city.status])}>
                      <CircleDot aria-hidden="true" className="size-3" />
                      {t(`status.${city.status}`)}
                    </p>
                  </div>
                  {open && (
                    <Link href={routes.market(city.slug)} aria-label={t('cityLink', { city: name })} className="grid size-11 shrink-0 place-items-center rounded-full text-primary transition-colors hover:bg-foreground/[0.05]">
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The sign-up's own section is the region (named by its heading); this is only where "Join the waitlist" lands, on
          the page's grid with the form at a reading width. */}
      <div id="waitlist" className="mx-auto w-full max-w-content scroll-mt-24 px-gutter pb-16 lg:pb-24">
        <div className="max-w-reading">
          <WaitlistScreen data={data.waitlist} handlers={handlers} embedded={{ title: t('waitlistTitle'), description: t('waitlistBody') }} />
        </div>
      </div>

      <StepsSection />
    </div>
  );
}
