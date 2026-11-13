import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_SLUGS, LEGAL_DOCS, routes, type ShellViewer } from '@/contracts';
import { Logo } from './logo';
import { ScrollbarActivity } from '@/ui/motion';
import { SkipLink } from './skip-link';
import { MobileMenu } from './mobile-menu';
import { getPublicNav } from './nav';
import { NavLink } from './nav-link';
import { PublicAccountLinks } from './public-account-links';
import { ThemeToggle } from './theme-toggle';
import { TopBar } from './top-bar';

export interface PublicShellProps {
  viewer: ShellViewer | Promise<ShellViewer>;
  children: ReactNode;
  currentPath?: string;
  /** `landing`: the home page lays out its own full-width sections under the floating top bar. */
  variant?: 'default' | 'landing';
}

export function PublicShell({ viewer, children, currentPath, variant = 'default' }: PublicShellProps) {
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
  const linkClass = 'flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground';

  // The landing page lays its own paper under its sections; every other public page sits on the same paper.
  return (
    <div className={variant === 'landing' ? 'flex min-h-dvh flex-col bg-background' : 'paper flex min-h-dvh flex-col'}>
      <SkipLink />
      <ScrollbarActivity />
      <TopBar
        logo={<><span className="min-[380px]:hidden"><Logo variant="mark" animated /></span><span className="hidden min-[380px]:inline-flex"><Logo animated /></span></>}
        nav={links('bar')}
        actions={<>
          <ThemeToggle className="hidden sm:inline-flex" />
          <Suspense fallback={<PublicAccountLinks viewer={{ kind: 'public' }} placement="header" />}>
            <PublicAccountLinks viewer={viewer} placement="header" />
          </Suspense>
        </>}
        menu={
          <MobileMenu title={t('menuTitle')} description={t('menuDescription')}>
            {links('menu')}
            <div className="mt-4 flex items-center justify-between border-t pt-4"><span className="text-sm text-muted-foreground">{t('theme.label')}</span><ThemeToggle /></div>
            <div className="mt-4 border-t pt-4">
              <Suspense fallback={<PublicAccountLinks viewer={{ kind: 'public' }} placement="menu" />}>
                <PublicAccountLinks viewer={viewer} placement="menu" />
              </Suspense>
            </div>
          </MobileMenu>
        }
      />
      <main id="main" tabIndex={-1} className={variant === 'landing' ? 'flex-1 overflow-x-clip outline-none' : 'mx-auto w-full max-w-content flex-1 px-gutter pt-28 pb-10 outline-none sm:pt-32'}>
        {children}
      </main>
      <footer className="relative overflow-hidden border-t border-border/70 bg-brand-paper">
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl" style={{ background: 'var(--iridescent)' }} />
        <div className="relative mx-auto max-w-content px-gutter pt-14 pb-8 sm:pt-20">
          <div className="mb-12 flex flex-col gap-6 border-b border-border pb-10 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-lg font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">{t('footer.tagline')}</p>
            <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">{t('footer.introduction')}</p>
          </div>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <Logo />
              <p className="max-w-56 text-sm text-muted-foreground">{t('footer.localHelp')}</p>
              <div>
                <p className="text-sm text-muted-foreground">{t('footer.marketLabel')}</p>
                <Link href={routes.market()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><MapPin aria-hidden="true" className="size-4" />{t('footer.austin')}</Link>
              </div>
            </div>
            <nav aria-label={t('footer.categories')}>
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{t('footer.categories')}</h2>
              <ul>{CATEGORY_SLUGS.map((category) => <li key={category}><Link href={routes.category(category)} className={linkClass}>{t(`categories.${category}`)}</Link></li>)}</ul>
            </nav>
            <nav aria-label={t('footer.resources')}>
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{t('footer.resources')}</h2>
              <ul>
                <li><Link href={routes.howItWorks()} className={linkClass}>{t('nav.howItWorks')}</Link></li>
                <li><Link href={routes.pricing()} className={linkClass}>{t('nav.pricing')}</Link></li>
                <li><Link href={routes.trustAndSafety()} className={linkClass}>{t('footer.trust')}</Link></li>
                <li><Link href={routes.help()} className={linkClass}>{t('footer.help')}</Link></li>
              </ul>
            </nav>
            <nav aria-label={t('footer.legal')}>
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{t('footer.legal')}</h2>
              <ul>{LEGAL_DOCS.map((doc) => <li key={doc}><Link href={routes.legal(doc)} className={linkClass}>{t(`legal.${doc}`)}</Link></li>)}</ul>
            </nav>
          </div>
          <div className="mt-12 flex flex-wrap justify-between gap-3 border-t pt-6 text-xs text-muted-foreground"><p>{t('footer.signature')}</p><p>{t('footer.payment')}</p></div>
        </div>
      </footer>
    </div>
  );
}
