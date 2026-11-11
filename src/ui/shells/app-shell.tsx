import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, CircleUserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AppShellHandlers, type SignedInViewer } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';
import { Logo } from './logo';
import { SkipLink } from './skip-link';
import { ModeSwitch } from './mode-switch';
import { AccountMenu } from './account-menu';
import { Navigation } from './navigation';
import { getAppNav } from './nav';

export interface AppShellProps { viewer: SignedInViewer; handlers: AppShellHandlers; children: ReactNode; currentPath?: string }

export function AppShell({ viewer, handlers, children, currentPath }: AppShellProps) {
  const t = useTranslations('shell');
  const nav = getAppNav(viewer.mode);
  return <div className="flex min-h-dvh flex-col bg-background pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
    <SkipLink />
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-admin flex-wrap items-center gap-3 px-gutter py-4 sm:flex-nowrap sm:gap-6">
        <Logo />
        <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto"><ModeSwitch mode={viewer.mode} onModeChange={handlers.onModeChange} /></div>
        <div className="ml-auto flex items-start gap-2 sm:ml-0">
          <Link href={routes.app.notifications()} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative' })} aria-label={viewer.unreadNotifications > 0 ? t('unreadNotifications', { count: viewer.unreadNotifications }) : t('notifications')}>
            <Bell aria-hidden="true" className="size-5" />
            {viewer.unreadNotifications > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground tabular-nums">{viewer.unreadNotifications}</span>}
          </Link>
          <AccountMenu viewer={viewer} onSignOut={handlers.onSignOut} />
        </div>
      </div>
    </header>
    <div className="mx-auto w-full max-w-admin flex-1 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card px-4 py-6 lg:block">
        <div className="sticky top-6 space-y-6">
          <Navigation items={nav.primary} label={t('primaryNavigation')} currentPath={currentPath} unreadMessages={viewer.unreadMessages} />
          <div className="border-t pt-5"><Navigation items={nav.secondary} label={t('secondaryNavigation')} currentPath={currentPath} /></div>
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-content space-y-6 px-gutter py-8 outline-none">
        {viewer.mode === 'helper' && !viewer.helperReady && <Link href={routes.app.helperOnboarding()} className="flex min-h-11 items-center gap-3 rounded-xl border border-primary bg-secondary p-4 text-sm font-medium text-secondary-foreground hover:underline"><CircleUserRound aria-hidden="true" className="size-5 shrink-0" /><span>{t('helperSetup')}</span><ArrowRight aria-hidden="true" className="ml-auto size-5 shrink-0" /></Link>}
        {children}
      </main>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-2 pt-1 pb-[max(.5rem,env(safe-area-inset-bottom))] lg:hidden">
      <Navigation items={nav.primary} label={t('mobileNavigation')} currentPath={currentPath} unreadMessages={viewer.unreadMessages} variant="bottom" />
    </div>
  </div>;
}
