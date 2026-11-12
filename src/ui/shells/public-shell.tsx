import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_SLUGS, LEGAL_DOCS, routes, type ShellViewer } from '@/contracts';
import { Logo } from './logo';
import { SkipLink } from './skip-link';
import { MobileMenu } from './mobile-menu';
import { getPublicNav } from './nav';
import { NavLink } from './nav-link';
import { PublicAccountLinks } from './public-account-links';

export interface PublicShellProps { viewer: ShellViewer | Promise<ShellViewer>; children: ReactNode; currentPath?: string }

export function PublicShell({ viewer, children, currentPath }: PublicShellProps) {
  const t = useTranslations('shell');
  const nav = <nav aria-label={t('primaryNavigation')}><ul className="flex flex-col gap-1 lg:flex-row lg:gap-2">
    {getPublicNav().map((item) => <li key={item.id}><NavLink item={item} currentPath={currentPath} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent" activeClassName="bg-secondary text-secondary-foreground underline decoration-2 underline-offset-4">{t(`nav.${item.id}`)}</NavLink></li>)}
  </ul></nav>;
  return <div className="flex min-h-dvh flex-col bg-background">
    <SkipLink />
    <header className="border-b border-border/70 bg-background">
      <div className="mx-auto flex max-w-content items-center gap-2 px-gutter py-4 lg:gap-3 lg:py-5">
        <div className="sm:hidden"><Logo variant="mark" /></div><div className="hidden sm:block"><Logo /></div>
        <div className="ml-auto hidden lg:block">{nav}</div>
        <Suspense fallback={<PublicAccountLinks viewer={{ kind: 'public' }} placement="header" />}>
          <PublicAccountLinks viewer={viewer} placement="header" />
        </Suspense>
        <MobileMenu title={t('menuTitle')} description={t('menuDescription')}>
          {nav}<div className="mt-4 border-t pt-4">
            <Suspense fallback={<PublicAccountLinks viewer={{ kind: 'public' }} placement="menu" />}>
              <PublicAccountLinks viewer={viewer} placement="menu" />
            </Suspense>
          </div>
        </MobileMenu>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-gutter py-8 outline-none">{children}</main>
    <footer className="border-t bg-brand-paper">
      <div className="mx-auto max-w-content px-gutter pb-6 pt-12 sm:pt-16">
        <div className="mb-10 flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-md font-heading text-4xl leading-tight tracking-tight">{t('footer.tagline')}</p>
          <p className="max-w-56 text-sm leading-relaxed text-muted-foreground">{t('footer.introduction')}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4"><Logo /><p className="max-w-52 text-sm text-muted-foreground">{t('footer.localHelp')}</p><div><p className="text-sm text-muted-foreground">{t('footer.marketLabel')}</p><Link href={routes.market()} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"><MapPin aria-hidden="true" className="size-4" />{t('footer.austin')}</Link></div></div>
          <nav aria-label={t('footer.categories')}><h2 className="mb-3 font-sans text-sm font-semibold">{t('footer.categories')}</h2><ul>{CATEGORY_SLUGS.map((category) => <li key={category}><Link href={routes.category(category)} className="flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground hover:text-primary hover:underline">{t(`categories.${category}`)}</Link></li>)}</ul></nav>
          <nav aria-label={t('footer.resources')}><h2 className="mb-3 font-sans text-sm font-semibold">{t('footer.resources')}</h2><ul><li><Link href={routes.howItWorks()} className="flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground hover:text-primary hover:underline">{t('nav.howItWorks')}</Link></li><li><Link href={routes.pricing()} className="flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground hover:text-primary hover:underline">{t('nav.pricing')}</Link></li><li><Link href={routes.trustAndSafety()} className="flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground hover:text-primary hover:underline">{t('footer.trust')}</Link></li><li><Link href={routes.help()} className="flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground hover:text-primary hover:underline">{t('footer.help')}</Link></li></ul></nav>
          <nav aria-label={t('footer.legal')}><h2 className="mb-3 font-sans text-sm font-semibold">{t('footer.legal')}</h2><ul>{LEGAL_DOCS.map((doc) => <li key={doc}><Link href={routes.legal(doc)} className="flex min-h-11 items-center rounded-md py-2 text-sm text-muted-foreground hover:text-primary hover:underline">{t(`legal.${doc}`)}</Link></li>)}</ul></nav>
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-3 border-t pt-6 text-xs text-muted-foreground"><p>{t('footer.signature')}</p><p>{t('footer.payment')}</p></div>
      </div>
    </footer>
  </div>;
}
