import type { ReactNode } from 'react';
import Link from 'next/link';
import { Bell, CirclePause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AppShellHandlers, ShellNotice, SignedInViewer } from '@/contracts';
import { routes } from '@/contracts/routes';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';
import { AppBar } from './app-bar';
import { Logo } from './logo';
import { ScrollbarActivity } from '@/ui/motion/scrollbar-activity';
import { SkipLink } from './skip-link';
import { ModeSwitch } from './mode-switch';
import { AccountMenu } from './account-menu';
import { LanguageSwitch } from './language-switch';
import { AppTopRow } from './app-top-row';
import { QuickAction } from './quick-action';
import { ThemeToggle } from './theme-toggle';
import { Navigation } from './navigation';
import { AppShellFrame, TabsOnly, type AppShellLayout } from './app-shell-layout';
import { MobileBottomNav } from './mobile-bottom-nav';
import { getAppNav } from './nav';
import { PushDeviceGuard } from '@/ui/components/push/push-device-guard';

export interface AppShellProps {
  viewer: SignedInViewer;
  handlers: AppShellHandlers;
  children: ReactNode;
  currentPath?: string;
  /** Fixed by previews and tests; otherwise the route group decides (`useAppShellLayout`). */
  layout?: AppShellLayout;
  notices?: readonly ShellNotice[];
  /**
   * Messages (2026-11-22): the chat button at the bottom right and, on wide screens, the chat window. Inside the shell's
   * frame, so it stays mounted from page to page and reads the frame's bottom offset (the phone's dock).
   */
  chat?: ReactNode;
}

/**
 * The signed-in app, in the landing page's language: the paper under everything, a pinned glass bar (the logo, how
 * you're using TasksNearMe, the next step for that mode, the language and theme switches, notifications and your
 * account, whose menu also carries the theme and the language on phones), on wide screens a floating rail of links
 * whose current pill glides between pages, and on phones a glass dock of four tabs; Messages is the chat button (`chat`). `flow` pages (posting a task, a
 * booking, a conversation: the `(flow)` route group) keep the dock away; one shell serves both groups. `notices` (the outage switch) sit above every page's content, before the helper setup link.
 */
export function AppShell({ viewer, handlers, children, currentPath, layout, notices = [], chat }: AppShellProps) {
  const t = useTranslations('shell');
  const nav = getAppNav(viewer.mode);
  // 10% wider than the public pages (2026-11-22, owner: "make a little full-wide (10% more)"): the bar, the rail and
  // every page's `max-w-content` read these (globals.css). AppShellSkeleton matches them.
  return <AppShellFrame layout={layout} className="paper flex min-h-dvh flex-col [--app-bottom-offset:0px] [--container-admin:99rem] [--container-content:77rem]">
    <SkipLink />
    <ScrollbarActivity />
    {handlers.onCheckPushDevice && <PushDeviceGuard viewerId={viewer.id} onCheck={handlers.onCheckPushDevice} />}
    <AppBar>
      <div className="mx-auto flex max-w-admin flex-wrap items-center gap-x-2 gap-y-2 px-gutter py-2 sm:flex-nowrap sm:gap-x-3 sm:py-2.5">
        <Logo animated />
        {/* On phones the avatar menu switches the mode instead, so the bar stays one row (audit M38). */}
        <div className="hidden sm:ml-3 sm:block lg:ml-5"><ModeSwitch mode={viewer.mode} onModeChange={handlers.onModeChange} /></div>
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          {/* The next thing to do in this mode, one tap away. */}
          <QuickAction mode={viewer.mode} />
          <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-foreground/10 sm:block" />
          <LanguageSwitch label={t('footer.language')} onSwitch={handlers.onSwitchLanguage} className="hidden lg:block" />
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link href={routes.app.recentNotifications()} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative rounded-full text-foreground/80' })} aria-label={viewer.unreadNotifications > 0 ? t('unreadNotifications', { count: viewer.unreadNotifications }) : t('notifications')}>
            <Bell aria-hidden="true" className="size-5" />
            {viewer.unreadNotifications > 0 && <span aria-hidden="true" className="absolute top-1 right-0.5 min-w-5 rounded-full bg-primary px-1.5 text-center text-[0.6875rem] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background">{viewer.unreadNotifications}</span>}
          </Link>
          <AccountMenu viewer={viewer} onSignOut={handlers.onSignOut} onSwitchLanguage={handlers.onSwitchLanguage} onModeChange={handlers.onModeChange} {...(handlers.onForgetPushDevice ? { onForgetPushDevice: handlers.onForgetPushDevice } : {})} />
        </div>
      </div>
    </AppBar>
    <div className="mx-auto w-full max-w-admin flex-1 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden py-6 pl-gutter lg:block">
        <div className="sticky top-[calc(var(--app-header-offset,4.25rem)+1.5rem)] rounded-[1.75rem] border border-foreground/[0.06] bg-card/55 p-2 shadow-[0_1px_2px_rgb(23_18_14/0.04),0_20px_40px_-32px_rgb(60_30_10/0.45)] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.025] dark:shadow-none">
          <Navigation items={nav.primary} label={t('primaryNavigation')} currentPath={currentPath} {...(viewer.neighborsNews ? { neighborsNews: viewer.neighborsNews } : {})} />
          <div aria-hidden="true" className="mx-3 my-2 h-px bg-foreground/[0.07] dark:bg-white/[0.07]" />
          <Navigation items={nav.secondary} label={t('secondaryNavigation')} currentPath={currentPath} />
        </div>
      </aside>
      {/* On phones the chat button floats above the dock: room under the last row so it can scroll clear of it. */}
      <main id="main" tabIndex={-1} className={cn('mx-auto w-full min-w-0 max-w-content space-y-6 px-gutter pt-6 pb-10 outline-none lg:pt-8', chat && 'max-lg:in-data-[app-shell=tabs]:pb-28')}>
        {notices.includes('bookings_paused') && <section aria-labelledby="notice-bookings-paused" className="flex gap-3 rounded-2xl border border-warning/40 bg-card/90 p-4 text-sm shadow-card dark:border-warning/40">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-warning"><CirclePause className="size-5" /></span>
          <div className="min-w-0 space-y-1"><p id="notice-bookings-paused" className="font-semibold text-foreground">{t('notices.bookingsPaused.title')}</p><p className="text-muted-foreground">{t('notices.bookingsPaused.body')}</p></div>
        </section>}
        {/* The search bar, and beside it a helper's verified-helper reminder (owner, 2026-11-23: where the full-width
            setup bar was). The tabs layout only: flow pages (posting, a booking, a conversation) stay focused. */}
        <TabsOnly layout={layout}><AppTopRow mode={viewer.mode} {...(viewer.helperSetup ? { reminder: viewer.helperSetup } : {})} {...(handlers.onAskSearch ? { onAsk: handlers.onAskSearch } : {})} {...(currentPath ? { currentPath } : {})} /></TabsOnly>
        {children}
      </main>
    </div>
    <TabsOnly layout={layout}>
      <MobileBottomNav>
        <Navigation items={nav.primary} label={t('mobileNavigation')} currentPath={currentPath} variant="bottom" {...(viewer.neighborsNews ? { neighborsNews: viewer.neighborsNews } : {})} />
      </MobileBottomNav>
    </TabsOnly>
    {chat}
  </AppShellFrame>;
}
