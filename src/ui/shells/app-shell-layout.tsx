'use client';

import type { ReactNode } from 'react';
import { useSelectedLayoutSegment } from 'next/navigation';
import { cn } from '@/ui/lib/utils';

export type AppShellLayout = 'tabs' | 'flow';

/**
 * The signed-in shell's layout. A screen can fix it (previews, tests); otherwise the route group under the app's
 * layout decides: `(flow)` (posting, a booking, a task, an offer, a conversation) leaves the phone's tab dock out,
 * and `(main)`, or anything else, has it. One shell then serves both groups from `(app)/app/layout.tsx`, so a hop
 * between them keeps its bar, its rail and the page around the content mounted (the two group layouts each had a
 * shell of their own, swapped on every hop, with the loading shell between).
 */
export function useAppShellLayout(fixed?: AppShellLayout): AppShellLayout {
  const group = useSelectedLayoutSegment();
  return fixed ?? (group === '(flow)' ? 'flow' : 'tabs');
}

/** The shell's frame: `data-app-shell` with the layout, and with tabs, room under the page for the phone's dock. */
export function AppShellFrame({ layout, className, children }: { layout?: AppShellLayout; className?: string; children: ReactNode }) {
  const resolved = useAppShellLayout(layout);
  return (
    <div data-app-shell={resolved} data-app-surface="" className={cn(className, resolved === 'tabs' && 'pb-[var(--app-bottom-offset)] max-lg:[--app-bottom-offset:var(--app-bottom-nav-height)]')}>
      {children}
    </div>
  );
}

/** What only the tabs layout shows: the phone's dock. */
export function TabsOnly({ layout, children }: { layout?: AppShellLayout; children: ReactNode }) {
  return useAppShellLayout(layout) === 'tabs' ? children : null;
}
