import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { ArrowUpRight, ChevronDown, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LanguageSwitchHandler } from '@/contracts';
import { CATEGORY_SLUGS } from '@/contracts/common';
import { LEGAL_DOCS, routes } from '@/contracts/routes';
import { LANDING_SECTIONS } from '@/ui/landing/sections/ids';
import { cn } from '@/ui/lib/utils';
import { Reveal } from '@/ui/motion/reveal';
import { LanguageSwitch } from './language-switch';
import { Logo } from './logo';

/**
 * The public pages' footer. It carries on from the page instead of starting a new band: the same paper runs
 * under it (no rule, no background of its own), and a soft horizon of the brand's light rises from where the
 * content ends into the footer, with no edge (radial gradients only; nothing is clipped). Its links answer the
 * page above it: on the landing page an "On this page" index jumps back to each section; everywhere, the
 * categories, the cities (the first city, then the waitlist and every state) and the help a visitor would look for.
 * On phones it stays short (audit M45, 2026-11-18): no slogan block, the link groups as rows that open in place, and
 * the legal links on one wrapped line. Sign-in and sign-up use `minimal`: the legal links and the language only.
 *
 * The landing page and the other public pages share one shell (plan 9.5), so the footer carries both sets of links and
 * CSS shows the right one: the shell is `group/site`, and the landing page holds the `data-landing-page` marker
 * (PublicShell's LandingPageMarker). Hidden ones are `display: none`, so screen readers skip them too.
 */
export function PublicFooter({ variant, onSwitchLanguage }: { variant: 'default' | 'landing' | 'minimal'; onSwitchLanguage?: LanguageSwitchHandler }) {
  const t = useTranslations('shell');
  // Sign-in and sign-up: the legal links and the language only (audit M45).
  if (variant === 'minimal') {
    return <footer className="mx-auto w-full max-w-content px-gutter pb-8">
      <div className="flex flex-col gap-3 border-t border-foreground/[0.07] pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t('footer.legal')}>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_DOCS.map((doc) => <li key={doc}><Link href={routes.legal(doc)} className="inline-flex min-h-8 items-center hover:text-foreground">{t(`legal.${doc}`)}</Link></li>)}
          </ul>
        </nav>
        <LanguageSwitch label={t('footer.language')} onSwitch={onSwitchLanguage} variant="inline" className="-ml-2 sm:ml-0" />
      </div>
    </footer>;
  }
  const linkClass = 'group/link inline-flex min-h-11 items-center gap-1 rounded-md py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-10';
  const heading = 'mb-2 font-sans text-xs font-semibold tracking-[0.14em] text-foreground/70 uppercase';
  // The link groups, once: columns from the tablet width up, rows that open in place on phones. On the landing page
  // "On this page" takes Explore's place and two of Explore's links join the resources (`only`, see above).
  const groups: FooterGroup[] = [
    { title: t('footer.onThisPage'), only: 'landing', links: LANDING_SECTIONS.map((section) => ({ href: `#${section}`, label: t(`footer.sections.${section}`), anchor: true })) },
    {
      title: t('footer.explore'),
      only: 'elsewhere',
      links: [
        { href: routes.taskBoard(), label: t('footer.openTasks') },
        { href: routes.howItWorks(), label: t('nav.howItWorks') },
        { href: routes.becomeAHelper(), label: t('footer.becomeHelper') },
        { href: routes.pricing(), label: t('nav.pricing') },
      ],
    },
    { title: t('footer.categories'), links: CATEGORY_SLUGS.map((category) => ({ href: routes.category(category), label: t(`categories.${category}`) })) },
    {
      title: t('footer.resources'),
      links: [
        { href: routes.taskBoard(), label: t('footer.openTasks'), only: 'landing' },
        { href: routes.becomeAHelper(), label: t('footer.becomeHelper'), only: 'landing' },
        { href: routes.trustAndSafety(), label: t('footer.trust') },
        { href: routes.help(), label: t('footer.help') },
      ],
    },
  ];

  return (
    <footer className="relative isolate">
      {/* The horizon: centered on the footer's top line, half above it (behind the page's last block) and half
          below; each glow fades to nothing, so there's no line where the page stops and the footer starts. While the
          page is still loading (a skeleton, role=status and aria-busy) it stays off: it reaches 14rem above the
          footer, into the first screen, and would be pushed away when the page arrives (plan 9.4, audit H2-H4). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-56 -z-10 h-[30rem] opacity-80 group-has-[[role=status][aria-busy=true]]/site:hidden dark:opacity-55"
        style={{
          background: [
            'radial-gradient(38% 44% at 50% 50%, color-mix(in oklab, var(--iri-2) 16%, transparent), transparent 72%)',
            'radial-gradient(30% 38% at 26% 56%, color-mix(in oklab, var(--iri-3) 14%, transparent), transparent 70%)',
            'radial-gradient(30% 38% at 76% 54%, color-mix(in oklab, var(--iri-1) 13%, transparent), transparent 70%)',
          ].join(', '),
        }}
      />
      <div className="relative mx-auto max-w-content px-gutter pt-12 pb-8 sm:pt-16">
        <Reveal className="hidden gap-5 sm:flex sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xl font-display text-4xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {t('footer.tagline')}
          </p>
          <p className="max-w-72 text-sm leading-relaxed text-muted-foreground">{t('footer.introduction')}</p>
        </Reveal>
        {/* A hairline that fades out at both ends, instead of a rule across the page. */}
        <div aria-hidden="true" className="mb-8 hidden h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_8%,transparent)_30%,color-mix(in_oklab,var(--foreground)_8%,transparent)_70%,transparent)] sm:my-11 sm:block" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 sm:gap-y-9 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
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
                <li><Link href={routes.cities()} className={linkClass}>{t('footer.allCities')}</Link></li>
              </ul>
            </div>
          </div>

          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title} className={SHOWN_AS_COLUMN[group.only ?? 'always']}>
              <h2 className={heading}>{group.title}</h2>
              <ul>{group.links.map((link) => <li key={link.href} className={SHOWN_AS_ITEM[link.only ?? 'always']}><FooterLink link={link} className={linkClass} /></li>)}</ul>
            </nav>
          ))}

          {/* Phones: the same groups as rows that open in place, not three long columns (audit M45). */}
          <div className="col-span-2 divide-y divide-foreground/[0.07] border-y border-foreground/[0.07] sm:hidden dark:divide-white/[0.07] dark:border-white/[0.07]">
            {groups.map((group) => (
              <details key={group.title} className={cn('group/details', SHOWN_AS_ROW[group.only ?? 'always'])}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  {group.title}
                  <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open/details:rotate-180 motion-reduce:transition-none" />
                </summary>
                <nav aria-label={group.title} className="pb-3">
                  <ul className="grid grid-cols-2 gap-x-4">{group.links.map((link) => <li key={link.href} className={SHOWN_AS_ITEM[link.only ?? 'always']}><FooterLink link={link} className={linkClass} /></li>)}</ul>
                </nav>
              </details>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 pt-2 text-xs text-muted-foreground sm:mt-10 sm:gap-4 sm:border-t sm:border-foreground/[0.07] sm:pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <nav aria-label={t('footer.legal')}>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {LEGAL_DOCS.map((doc) => <li key={doc}><Link href={routes.legal(doc)} className="inline-flex min-h-8 items-center hover:text-foreground">{t(`legal.${doc}`)}</Link></li>)}
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

/** Where a group or link shows: on every public page (unset), only on the landing page, or everywhere but there. */
type FooterOnly = 'landing' | 'elsewhere';

interface FooterLinkItem {
  href: string;
  label: string;
  /** A section of this page (`#id`): a plain anchor, not a page link. */
  anchor?: boolean;
  only?: FooterOnly;
}

interface FooterGroup {
  title: string;
  links: FooterLinkItem[];
  only?: FooterOnly;
}

/** The desktop columns (from sm), the phone rows and single links, by where they show. */
const SHOWN_AS_COLUMN: Record<FooterOnly | 'always', string> = {
  always: 'hidden sm:block',
  landing: 'hidden sm:group-has-[[data-landing-page]]/site:block',
  elsewhere: 'hidden sm:block sm:group-has-[[data-landing-page]]/site:hidden',
};
const SHOWN_AS_ROW: Record<FooterOnly | 'always', string> = {
  always: '',
  landing: 'hidden group-has-[[data-landing-page]]/site:block',
  elsewhere: 'group-has-[[data-landing-page]]/site:hidden',
};
const SHOWN_AS_ITEM: Record<FooterOnly | 'always', string | undefined> = {
  always: undefined,
  landing: 'hidden group-has-[[data-landing-page]]/site:list-item',
  elsewhere: 'group-has-[[data-landing-page]]/site:hidden',
};

function FooterLink({ link, className }: { link: FooterLinkItem; className: string }) {
  return link.anchor ? <a href={link.href} className={className}>{link.label}</a> : <Link href={link.href} className={className}>{link.label}</Link>;
}
