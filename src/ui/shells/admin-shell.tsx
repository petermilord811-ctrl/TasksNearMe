import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AdminShellHandlers, type Breadcrumb, type StaffViewer } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Logo } from './logo';
import { SkipLink } from './skip-link';
import { MobileMenu } from './mobile-menu';
import { AccountMenu } from './account-menu';
import { Navigation } from './navigation';
import { getAdminNav } from './nav';

export interface AdminShellProps { viewer: StaffViewer; handlers: AdminShellHandlers; breadcrumbs?: Breadcrumb[]; children: ReactNode; currentPath?: string }

export function AdminShell({ viewer, handlers, breadcrumbs = [], children, currentPath }: AdminShellProps) {
  const t = useTranslations('shell');
  const navigation = <Navigation items={getAdminNav(viewer.roles)} label={t('admin.navigation')} currentPath={currentPath} />;
  return <div className="flex min-h-dvh flex-col bg-background">
    <SkipLink />
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-admin flex-wrap items-center gap-x-4 gap-y-3 px-gutter py-4">
        <Logo /><div className="ml-auto flex items-start gap-2 lg:order-last"><MobileMenu title={t('admin.menuTitle')} description={t('admin.menuDescription')}>{navigation}</MobileMenu><AccountMenu viewer={viewer} onSignOut={handlers.onSignOut} /></div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground"><ShieldCheck aria-hidden="true" className="size-4" />{t('staffArea')}</span>
          <ul aria-label={t('admin.roles')} className="flex flex-wrap gap-2">{viewer.roles.map((role) => <li key={role} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">{t(`roles.${role}`)}</li>)}</ul>
        </div>
        <form role="search" aria-label={t('admin.search')} method="get" action={routes.admin.search('')} className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto lg:flex-1 lg:max-w-sm">
          <label htmlFor="staff-search" className="sr-only">{t('admin.search')}</label><Input id="staff-search" name="q" type="search" placeholder={t('admin.search')} aria-describedby="staff-search-hint" className="min-w-0 bg-background" /><span id="staff-search-hint" className="sr-only">{t('admin.searchHint')}</span>
          <Button type="submit" variant="outline" size="icon" aria-label={t('admin.submitSearch')}><Search aria-hidden="true" className="size-5" /></Button>
        </form>
      </div>
    </header>
    <div className="mx-auto w-full max-w-admin flex-1 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card px-4 py-6 lg:block"><div className="sticky top-6">{navigation}</div></aside>
      <main id="main" tabIndex={-1} className="min-w-0 space-y-6 px-gutter py-8 outline-none">
        {breadcrumbs.length > 0 && <nav aria-label={t('admin.breadcrumbs')}><ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">{breadcrumbs.map((crumb, index) => <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-2">{index > 0 && <ChevronRight aria-hidden="true" className="size-4 shrink-0" />}{crumb.href ? <Link href={crumb.href} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className="inline-flex min-h-11 items-center break-words rounded-md py-2 hover:text-primary hover:underline">{crumb.label}</Link> : <span className="break-words text-foreground" aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>}</li>)}</ol></nav>}
        {children}
      </main>
    </div>
  </div>;
}
