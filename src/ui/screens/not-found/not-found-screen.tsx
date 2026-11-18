import { ArrowRight, CalendarCheck, CircleHelp, House, LayoutDashboard, LifeBuoy, MailPlus, MapPinned, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';

type Place = 'public' | 'app';
type Destination = 'home' | 'cities' | 'waitlist' | 'help' | 'dashboard' | 'bookings' | 'support';

/** Where to go instead: the public site's main doors, or the signed-in app's. */
const WAYS_ON: Record<Place, { key: Destination; href: string; icon: LucideIcon }[]> = {
  public: [
    { key: 'home', href: routes.home(), icon: House },
    { key: 'cities', href: routes.cities(), icon: MapPinned },
    { key: 'waitlist', href: routes.waitlist(), icon: MailPlus },
    { key: 'help', href: routes.help(), icon: CircleHelp },
  ],
  app: [
    { key: 'dashboard', href: routes.app.home(), icon: LayoutDashboard },
    { key: 'bookings', href: routes.app.bookings(), icon: CalendarCheck },
    { key: 'support', href: routes.app.support(), icon: LifeBuoy },
    { key: 'help', href: routes.help(), icon: CircleHelp },
  ],
};

/**
 * A page that isn't there (sweep 2026-11-18; it was Next's bare default): says so plainly and offers the ways on,
 * the public site's or the signed-in app's. On the public site, a line for anyone who followed an old link to a city
 * we haven't opened. Server-rendered plain links only: Next sends a not-found file with every route under its segment.
 */
export function NotFoundScreen({ place = 'public' }: { place?: Place }) {
  const t = useTranslations('notFound');
  return (
    <section aria-labelledby="not-found-title" className="mx-auto w-full max-w-reading py-8 text-center sm:py-14">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">{t('eyebrow')}</p>
      <h1 id="not-found-title" className="mt-3 font-display text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance lg:text-[2.375rem] lg:leading-[1.06]">
        {t('title')}
      </h1>
      <p className="mt-3 text-pretty text-muted-foreground">{t(place === 'app' ? 'appBody' : 'body')}</p>
      {place === 'public' && (
        <p className="mt-2 text-pretty text-muted-foreground">
          {t.rich('cities', { link: (chunks) => <Link href={routes.cities()} className="font-semibold text-primary underline underline-offset-4">{chunks}</Link> })}
        </p>
      )}
      <nav aria-label={t('linksLabel')} className="mt-8">
        <ul className="grid gap-3 text-left sm:grid-cols-2">
          {WAYS_ON[place].map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="group flex min-h-16 items-center gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card transition-colors hover:border-primary/40 dark:border-white/[0.06]"
              >
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><Icon className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold underline-offset-4 group-hover:underline">{t(`links.${key}.label`)}</span>
                  <span className="block text-sm text-muted-foreground">{t(`links.${key}.hint`)}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
