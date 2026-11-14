import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, CirclePause, CircleUserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AppShellHandlers, type ShellNotice, type SignedInViewer } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';
import { AppBar } from './app-bar';
import { Logo } from './logo';
import { ScrollbarActivity } from '@/ui/motion';
import { SkipLink } from './skip-link';
import { ModeSwitch } from './mode-switch';
import { AccountMenu } from './account-menu';
import { Navigation } from './navigation';
import { MobileBottomNav } from './mobile-bottom-nav';
import { getAppNav } from './nav';

export interface AppShellProps { viewer: SignedInViewer; handlers: AppShellHandlers; children: ReactNode; currentPath?: string; layout?: 'tabs' | 'flow'; notices?: readonly ShellNotice[] }

/**
 * The signed-in app, in the landing page's language: the paper under everything, a pinned glass bar (the logo, how
 * you're using TasksNearMe, notifications and your account), on wide screens a floating rail of links whose current
 * pill glides between pages, and on phones a glass dock of five tabs. `flow` pages (posting a task) keep the dock
 * away. `notices` (the outage switch) sit above every page's content, before the helper setup link.
 */
export function AppShell({ viewer, handlers, children, currentPath, layout = 'tabs', notices = [] }: AppShellProps) {
  const t = useTranslations('shell');
  const nav = getAppNav(viewer.mode);
  return <div data-app-shell={layout} data-app-surface="" className={cn('paper flex min-h-dvh flex-col [--app-bottom-offset:0px]', layout === 'tabs' && 'pb-[var(--app-bottom-offset)] max-lg:[--app-bottom-offset:var(--app-bottom-nav-height)]')}>
    <SkipLink />
    <ScrollbarActivity />
    <AppBar>
      <div className="mx-auto flex max-w-admin flex-wrap items-center gap-x-2 gap-y-2 px-gutter py-2 sm:flex-nowrap sm:gap-x-4 sm:py-2.5">
        <Logo />
        <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto"><ModeSwitch mode={viewer.mode} onModeChange={handlers.onModeChange} /></div>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <span aria-hidden="true" className="mr-1 hidden h-7 w-px bg-foreground/10 sm:block" />
          <Link href={routes.app.notifications()} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative rounded-full text-foreground/80' })} aria-label={viewer.unreadNotifications > 0 ? t('unreadNotifications', { count: viewer.unreadNotifications }) : t('notifications')}>
            <Bell aria-hidden="true" className="size-5" />
            {viewer.unreadNotifications > 0 && <span aria-hidden="true" className="absolute top-1 right-0.5 min-w-5 rounded-full bg-primary px-1.5 text-center text-[0.6875rem] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background">{viewer.unreadNotifications}</span>}
          </Link>
          <AccountMenu viewer={viewer} onSignOut={handlers.onSignOut} />
        </div>
      </div>
    </AppBar>
    <div className="mx-auto w-full max-w-admin flex-1 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden py-6 pl-gutter lg:block">
        <div className="sticky top-[calc(var(--app-header-offset,4.25rem)+1.5rem)] rounded-[1.75rem] border border-foreground/[0.06] bg-card/55 p-2 shadow-[0_1px_2px_rgb(23_18_14/0.04),0_20px_40px_-32px_rgb(60_30_10/0.45)] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.025] dark:shadow-none">
          <Navigation items={nav.primary} label={t('primaryNavigation')} currentPath={currentPath} unreadMessages={viewer.unreadMessages} />
          <div aria-hidden="true" className="mx-3 my-2 h-px bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <Navigation items={nav.secondary} label={t('secondaryNavigation')} currentPath={currentPath} />
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-content space-y-6 px-gutter pt-6 pb-10 outline-none lg:pt-8">
        {notices.includes('bookings_paused') && <section aria-labelledby="notice-bookings-paused" className="flex gap-3 rounded-2xl border border-warning/40 bg-card/90 p-4 text-sm shadow-card dark:border-warning/40">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning"><CirclePause className="size-5" /></span>
          <div className="min-w-0 space-y-1"><p id="notice-bookings-paused" className="font-semibold text-foreground">{t('notices.bookingsPaused.title')}</p><p className="text-muted-foreground">{t('notices.bookingsPaused.body')}</p></div>
        </section>}
        {viewer.mode === 'helper' && !viewer.helperReady && <Link href={routes.app.helperOnboarding()} className="group flex min-h-11 items-center gap-3 rounded-2xl border border-primary/25 bg-secondary/80 p-4 text-sm font-medium text-secondary-foreground shadow-card transition-[translate,box-shadow,background-color] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:bg-secondary"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-card/80 text-primary"><CircleUserRound className="size-5" /></span><span>{t('helperSetup')}</span><ArrowRight aria-hidden="true" className="ml-auto size-5 shrink-0 transition-transform duration-300 ease-[var(--ease-out)] group-hover:translate-x-1" /></Link>}
        {children}
      </main>
    </div>
    {layout === 'tabs' && <MobileBottomNav>
      <Navigation items={nav.primary} label={t('mobileNavigation')} currentPath={currentPath} unreadMessages={viewer.unreadMessages} variant="bottom" />
    </MobileBottomNav>}
  </div>;
}
