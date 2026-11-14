import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminShellHandlers, Breadcrumb, StaffViewer } from '@/contracts';
import { routes } from '@/contracts/routes';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { AppBar } from './app-bar';
import { Logo } from './logo';
import { ScrollbarActivity } from '@/ui/motion/scrollbar-activity';
import { SkipLink } from './skip-link';
import { MobileMenu } from './mobile-menu';
import { AccountMenu } from './account-menu';
import { Navigation } from './navigation';
import { getAdminNav } from './nav';

export interface AdminShellProps { viewer: StaffViewer; handlers: AdminShellHandlers; breadcrumbs?: Breadcrumb[]; children: ReactNode; currentPath?: string }

/** The staff area: the app's paper, glass bar and gliding rail, with the staff badge, roles and search in the bar. */
export function AdminShell({ viewer, handlers, breadcrumbs = [], children, currentPath }: AdminShellProps) {
  const t = useTranslations('shell');
  const navigation = <Navigation items={getAdminNav(viewer.roles)} label={t('admin.navigation')} currentPath={currentPath} />;
  return <div data-app-surface="" className="paper flex min-h-dvh flex-col">
    <SkipLink />
    <ScrollbarActivity />
    <AppBar>
      <div className="mx-auto flex max-w-admin flex-wrap items-center gap-x-4 gap-y-2.5 px-gutter py-2.5">
        <Logo /><div className="ml-auto flex items-center gap-1.5 lg:order-last"><MobileMenu title={t('admin.menuTitle')} description={t('admin.menuDescription')}>{navigation}</MobileMenu><AccountMenu viewer={viewer} onSignOut={handlers.onSignOut} /></div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background"><ShieldCheck aria-hidden="true" className="size-4" />{t('staffArea')}</span>
          <ul aria-label={t('admin.roles')} className="flex flex-wrap gap-1.5">{viewer.roles.map((role) => <li key={role} className="rounded-full border border-foreground/10 bg-card/70 px-3 py-1 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">{t(`roles.${role}`)}</li>)}</ul>
        </div>
        <form role="search" aria-label={t('admin.search')} method="get" action={routes.admin.search('')} className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto lg:flex-1 lg:max-w-sm">
          <label htmlFor="staff-search" className="sr-only">{t('admin.search')}</label><Input progressive id="staff-search" name="q" type="search" placeholder={t('admin.search')} aria-describedby="staff-search-hint" className="min-w-0 rounded-full" /><span id="staff-search-hint" className="sr-only">{t('admin.searchHint')}</span>
          <Button progressive type="submit" variant="outline" size="icon" aria-label={t('admin.submitSearch')}><Search aria-hidden="true" className="size-5" /></Button>
        </form>
      </div>
    </AppBar>
    <div className="mx-auto w-full max-w-admin flex-1 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden py-6 pl-gutter lg:block">
        <div className="sticky top-[calc(var(--app-header-offset,4.25rem)+1.5rem)] rounded-[1.75rem] border border-foreground/[0.06] bg-card/55 p-2 shadow-[0_1px_2px_rgb(23_18_14/0.04),0_20px_40px_-32px_rgb(60_30_10/0.45)] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.025] dark:shadow-none">{navigation}</div>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 space-y-6 px-gutter pt-6 pb-10 outline-none lg:pt-8">
        {breadcrumbs.length > 0 && <nav aria-label={t('admin.breadcrumbs')}><ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">{breadcrumbs.map((crumb, index) => <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-2">{index > 0 && <ChevronRight aria-hidden="true" className="size-4 shrink-0 opacity-60" />}{crumb.href ? <Link href={crumb.href} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className="inline-flex min-h-11 items-center break-words rounded-full px-1 py-2 transition-colors hover:text-foreground hover:underline hover:underline-offset-4">{crumb.label}</Link> : <span className="break-words font-medium text-foreground" aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>}</li>)}</ol></nav>}
        {children}
      </main>
    </div>
  </div>;
}
