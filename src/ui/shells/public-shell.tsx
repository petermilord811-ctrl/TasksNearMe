import { Suspense, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { LanguageSwitchHandler, ShellViewer } from '@/contracts';
import { LandingPageMarker } from './landing-page-marker';
import { Logo } from './logo';
import { ScrollbarActivity } from '@/ui/motion/scrollbar-activity';
import { SkipLink } from './skip-link';
import { MobileMenu } from './mobile-menu';
import { LanguageSwitch } from './language-switch';
import { getPublicNav } from './nav';
import { NavLink } from './nav-link';
import { PublicAccountLinks } from './public-account-links';
import { PublicFooter } from './public-footer';
import { ThemeToggle } from './theme-toggle';
import { TopBar } from './top-bar';

export interface PublicShellProps {
  viewer: ShellViewer | Promise<ShellViewer>;
  children: ReactNode;
  currentPath?: string;
  /**
   * `default`: every public page, the landing included. `<main>` is at least a screen tall, so the footer starts
   * below the fold and content streaming in never pushes a footer already in view (plan 9.4, audit H2, H3 and H4).
   * The landing page marks itself (`LandingPageMarker`) and the same shell lays it out full width and shows the
   * footer's landing links, all from CSS `:has()`: one shell for the landing and the other public pages, so the top
   * bar, the logo and the bar's state stay put between them (plan 9.5, audit M4 and L2).
   * `landing`: the same as a page with the marker (previews).
   * `minimal`: sign-in and sign-up, with only the legal links and the language below the page.
   */
  variant?: 'default' | 'landing' | 'minimal';
  /** The language switch's Server Action; without it (previews) the switch loads /es and /en like links. */
  onSwitchLanguage?: LanguageSwitchHandler;
}

/** `<main>` for each variant; `default` turns into the landing's when the page holds the marker. */
const MAIN_CLASS = {
  landing: 'min-h-svh flex-1 overflow-x-clip outline-none',
  // Sign-in and sign-up: the form fills the first screen, so the footer never moves as the page streams in.
  minimal: 'mx-auto w-full max-w-content min-h-svh flex-1 px-gutter pt-28 pb-10 outline-none sm:pt-32',
  default: [
    'mx-auto w-full max-w-content min-h-svh flex-1 px-gutter pt-28 pb-10 outline-none sm:pt-32',
    'has-[[data-landing-page]]:mx-0 has-[[data-landing-page]]:max-w-none has-[[data-landing-page]]:p-0 has-[[data-landing-page]]:overflow-x-clip',
  ].join(' '),
};

export function PublicShell({ viewer, children, currentPath, variant = 'default', onSwitchLanguage }: PublicShellProps) {
  const t = useTranslations('shell');
  const links = (placement: 'bar' | 'menu') => (
    <nav aria-label={t('primaryNavigation')}>
      <ul className={placement === 'bar' ? 'flex items-center gap-0.5' : 'flex flex-col gap-1'}>
        {getPublicNav().map((item) => (
          <li key={item.id}>
            <NavLink
              item={item}
              currentPath={currentPath}
              className="flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              activeClassName="bg-foreground/[0.07] text-foreground"
            >
              {t(`nav.${item.id}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
  // One paper under every public page, the footer included (the landing page lays its own under its sections,
  // lined up with this one), so nothing starts or stops a background where the footer begins.
  return (
    <div className="paper group/site flex min-h-dvh flex-col">
      <SkipLink />
      <ScrollbarActivity />
      <TopBar
        logo={<><span className="min-[380px]:hidden"><Logo variant="mark" animated /></span><span className="hidden min-[380px]:inline-flex"><Logo animated /></span></>}
        nav={links('bar')}
        actions={<>
          <LanguageSwitch label={t('footer.language')} onSwitch={onSwitchLanguage} className="hidden md:block" />
          <ThemeToggle className="hidden sm:inline-flex" />
          <Suspense fallback={<PublicAccountLinks viewer={{ kind: 'public' }} placement="header" />}>
            <PublicAccountLinks viewer={viewer} placement="header" />
          </Suspense>
        </>}
        menu={
          <MobileMenu title={t('menuTitle')} description={t('menuDescription')}>
            {links('menu')}
            <div className="mt-4 flex items-center justify-between border-t pt-4"><span className="text-sm text-muted-foreground">{t('theme.label')}</span><ThemeToggle /></div>
            <div className="mt-2 flex items-center justify-between"><span className="text-sm text-muted-foreground">{t('footer.language')}</span><LanguageSwitch label={t('footer.language')} onSwitch={onSwitchLanguage} variant="inline" className="-mr-2" /></div>
            <div className="mt-4 border-t pt-4">
              <Suspense fallback={<PublicAccountLinks viewer={{ kind: 'public' }} placement="menu" />}>
                <PublicAccountLinks viewer={viewer} placement="menu" />
              </Suspense>
            </div>
          </MobileMenu>
        }
      />
      <main id="main" tabIndex={-1} className={MAIN_CLASS[variant]}>
        {variant === 'landing' && <LandingPageMarker />}
        {children}
      </main>
      <PublicFooter variant={variant} onSwitchLanguage={onSwitchLanguage} />
    </div>
  );
}
