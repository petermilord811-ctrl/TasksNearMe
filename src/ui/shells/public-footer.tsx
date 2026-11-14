import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_SLUGS, LEGAL_DOCS, routes, type LanguageSwitchHandler } from '@/contracts';
import { LANDING_SECTIONS } from '@/ui/landing/sections/ids';
import { Reveal } from '@/ui/motion';
import { LanguageSwitch } from './language-switch';
import { Logo } from './logo';

/**
 * The public pages' footer. It carries on from the page instead of starting a new band: the same paper runs
 * under it (no rule, no background of its own), and a soft horizon of the brand's light rises from where the
 * content ends into the footer, with no edge (radial gradients only; nothing is clipped). Its links answer the
 * page above it: on the landing page an "On this page" index jumps back to each section; everywhere, the
 * categories, the cities (Austin first; other cities join the list) and the help a visitor would look for.
 * On phones the link groups sit two by two instead of one long column.
 */
export function PublicFooter({ variant, onSwitchLanguage }: { variant: 'default' | 'landing'; onSwitchLanguage?: LanguageSwitchHandler }) {
  const t = useTranslations('shell');
  const linkClass = 'group/link inline-flex min-h-11 items-center gap-1 rounded-md py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-10';
  const heading = 'mb-2 font-sans text-xs font-semibold tracking-[0.14em] text-foreground/70 uppercase';

  return (
    <footer className="relative isolate">
      {/* The horizon: centered on the footer's top line, half above it (behind the page's last block) and half
          below; each glow fades to nothing, so there's no line where the page stops and the footer starts. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-56 -z-10 h-[30rem] opacity-80 dark:opacity-55"
        style={{
          background: [
            'radial-gradient(38% 44% at 50% 50%, color-mix(in oklab, var(--iri-2) 16%, transparent), transparent 72%)',
            'radial-gradient(30% 38% at 26% 56%, color-mix(in oklab, var(--iri-3) 14%, transparent), transparent 70%)',
            'radial-gradient(30% 38% at 76% 54%, color-mix(in oklab, var(--iri-1) 13%, transparent), transparent 70%)',
          ].join(', '),
        }}
      />
      <div className="relative mx-auto max-w-content px-gutter pt-12 pb-8 sm:pt-16">
        <Reveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xl font-display text-4xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {t('footer.tagline')}
          </p>
          <p className="max-w-72 text-sm leading-relaxed text-muted-foreground">{t('footer.introduction')}</p>
        </Reveal>
        {/* A hairline that fades out at both ends, instead of a rule across the page. */}
        <div aria-hidden="true" className="my-9 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_8%,transparent)_30%,color-mix(in_oklab,var(--foreground)_8%,transparent)_70%,transparent)] sm:my-11" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
          <div className="col-span-2 space-y-4 sm:col-span-3 lg:col-span-1">
            <Logo />
            <p className="max-w-64 text-sm text-muted-foreground">{t('footer.localHelp')}</p>
            <div>
              <p className={heading}>{t('footer.cities')}</p>
              <ul className="space-y-0.5">
                <li>
                  <Link href={routes.market()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-foreground hover:text-primary sm:min-h-10">
                    <MapPin aria-hidden="true" className="size-4 text-primary" />
                    {t('footer.austin')}
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-primary">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                      {t('footer.firstCity')}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link href={routes.waitlist()} className={linkClass}>
                    {t('footer.cityNext')}
                    <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {variant === 'landing' ? (
            <nav aria-label={t('footer.onThisPage')}>
              <h2 className={heading}>{t('footer.onThisPage')}</h2>
              <ul>
                {LANDING_SECTIONS.map((section) => (
                  <li key={section}>
                    <a href={`#${section}`} className={linkClass}>{t(`footer.sections.${section}`)}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <nav aria-label={t('footer.explore')}>
              <h2 className={heading}>{t('footer.explore')}</h2>
              <ul>
                <li><Link href={routes.taskBoard()} className={linkClass}>{t('footer.openTasks')}</Link></li>
                <li><Link href={routes.howItWorks()} className={linkClass}>{t('nav.howItWorks')}</Link></li>
                <li><Link href={routes.becomeAHelper()} className={linkClass}>{t('footer.becomeHelper')}</Link></li>
                <li><Link href={routes.pricing()} className={linkClass}>{t('nav.pricing')}</Link></li>
              </ul>
            </nav>
          )}

          <nav aria-label={t('footer.categories')}>
            <h2 className={heading}>{t('footer.categories')}</h2>
            <ul>{CATEGORY_SLUGS.map((category) => <li key={category}><Link href={routes.category(category)} className={linkClass}>{t(`categories.${category}`)}</Link></li>)}</ul>
          </nav>

          <nav aria-label={t('footer.resources')}>
            <h2 className={heading}>{t('footer.resources')}</h2>
            <ul>
              {variant === 'landing' && <li><Link href={routes.taskBoard()} className={linkClass}>{t('footer.openTasks')}</Link></li>}
              {variant === 'landing' && <li><Link href={routes.becomeAHelper()} className={linkClass}>{t('footer.becomeHelper')}</Link></li>}
              <li><Link href={routes.trustAndSafety()} className={linkClass}>{t('footer.trust')}</Link></li>
              <li><Link href={routes.help()} className={linkClass}>{t('footer.help')}</Link></li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-foreground/[0.07] pt-6 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <nav aria-label={t('footer.legal')}>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {LEGAL_DOCS.map((doc) => <li key={doc}><Link href={routes.legal(doc)} className="inline-flex min-h-11 items-center hover:text-foreground sm:min-h-8">{t(`legal.${doc}`)}</Link></li>)}
            </ul>
          </nav>
          <LanguageSwitch label={t('footer.language')} onSwitch={onSwitchLanguage} variant="inline" className="-ml-2 sm:ml-0" />
        </div>
        <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>{t('footer.signature')}</p>
          <p>{t('footer.payment')}</p>
        </div>
      </div>
    </footer>
  );
}
