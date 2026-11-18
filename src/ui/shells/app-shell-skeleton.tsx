import { SkeletonHeader, SkeletonPage, SkeletonRows } from '@/ui/components/feedback/skeleton-parts';
import { cn } from '@/ui/lib/utils';
import { Skeleton } from '@/ui/primitives/skeleton';
import { AppBar } from './app-bar';
import { Logo } from './logo';
import { MobileBottomNav } from './mobile-bottom-nav';

/** The rail's rows: the five everyday places, a divider, then the mode's three tools. */
const RAIL_ROWS = ['w-20', 'w-24', 'w-16', 'w-20', 'w-24', null, 'w-24', 'w-24', 'w-28'];

/**
 * The signed-in shell while the session loads (plan 9.4b): AppShell's bar, rail and phone dock in their places, with
 * the controls as shapes, and a plain page under them (`flow`: no dock, a reading column). When the session is in,
 * the real shell fills the same places and the page's own skeleton takes over the page, so the chrome never pops in
 * around content.
 */
export function AppShellSkeleton({ layout = 'tabs' }: { layout?: 'tabs' | 'flow' }) {
  return (
    <div data-app-shell={layout} data-app-surface="" className={cn('paper flex min-h-dvh flex-col [--app-bottom-offset:0px]', layout === 'tabs' && 'pb-[var(--app-bottom-offset)] max-lg:[--app-bottom-offset:var(--app-bottom-nav-height)]')}>
      <AppBar>
        <div className="mx-auto flex max-w-admin items-center gap-x-2 px-gutter py-2 sm:gap-x-3 sm:py-2.5">
          <Logo animated />
          <Skeleton aria-hidden="true" className="hidden h-11 w-56 rounded-full sm:ml-3 sm:block lg:ml-5" />
          <div aria-hidden="true" className="ml-auto flex items-center gap-1 sm:gap-1.5">
            {/* The quick action: a round button on phones, a pill from 640 px. */}
            <Skeleton className="size-10 rounded-full sm:w-28" />
            <Skeleton className="hidden size-10 rounded-full sm:block" />
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
          </div>
        </div>
      </AppBar>
      <div className="mx-auto w-full max-w-admin flex-1 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <aside aria-hidden="true" className="hidden py-6 pl-gutter lg:block">
          <div className="sticky top-[calc(var(--app-header-offset,4.25rem)+1.5rem)] space-y-0.5 rounded-[1.75rem] border border-foreground/[0.06] bg-card/55 p-2 shadow-[0_1px_2px_rgb(23_18_14/0.04),0_20px_40px_-32px_rgb(60_30_10/0.45)] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.025] dark:shadow-none">
            {RAIL_ROWS.map((width, index) => width === null
              ? <div key={index} className="mx-3 my-2 h-px bg-foreground/[0.07] dark:bg-white/[0.07]" />
              : <div key={index} className="flex min-h-11 items-center gap-3 px-3"><Skeleton className="size-5 rounded-md" /><Skeleton className={cn('h-4', width)} /></div>)}
          </div>
        </aside>
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-content space-y-6 px-gutter pt-6 pb-10 outline-none lg:pt-8">
          <SkeletonPage className={cn('space-y-6', layout === 'flow' && 'mx-auto max-w-reading')}>
            <SkeletonHeader titleWidth="w-56" />
            <SkeletonRows rows={layout === 'flow' ? 2 : 4} />
          </SkeletonPage>
        </main>
      </div>
      {layout === 'tabs' && (
        <MobileBottomNav>
          <div aria-hidden="true" className="grid grid-cols-5 gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex min-h-14 flex-col items-center justify-center gap-1.5"><Skeleton className="size-5 rounded-md" /><Skeleton className="h-2.5 w-10" /></div>
            ))}
          </div>
        </MobileBottomNav>
      )}
    </div>
  );
}
