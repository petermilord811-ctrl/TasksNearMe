'use client';

import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';
import { DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';

/*
 * The parts a page fills the route dialog with (src/ui/components/layout/route-dialog-frame.tsx; src/app/[locale]/@modal):
 * its header and its scrolling body. No copy of their own, so a screen that offers a dialog version costs its page
 * nothing extra.
 */

/** The dialog's title (the page's main heading, so it's an h1 as on the full page) and what it's about. */
export function RouteDialogHeader({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <DialogHeader className="shrink-0 gap-1.5 px-4 pt-3 pb-3 pr-14 text-left sm:px-7 sm:pt-7 sm:pr-16 sm:pb-4">
    <DialogTitle asChild><h1 className="break-words font-display text-xl/7 font-semibold tracking-[-0.02em] sm:text-2xl/8">{title}</h1></DialogTitle>
    {description && <DialogDescription className="break-words text-pretty">{description}</DialogDescription>}
    {children}
  </DialogHeader>;
}

/**
 * The dialog's scrolling part. A form's sticky bar (Send, Save) stays at its bottom edge; the space after the last
 * field comes after the bar, so nothing shows beneath it.
 */
export function RouteDialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-7">
    <div className={cn('space-y-6', className)}>{children}</div>
    <div aria-hidden="true" className="h-[max(1.25rem,env(safe-area-inset-bottom))] sm:h-7" />
  </div>;
}
