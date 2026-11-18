import type { ReactNode } from 'react';

/**
 * A page title's type, for the pages that build their own header around it (the board, the waitlist): one size for every
 * page's h1, where those two had stopped at 28 to 30 px against 38 elsewhere (f7's visual pass, 2026-11-18).
 */
export const PAGE_TITLE_CLASS = 'font-display text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance lg:text-[2.375rem] lg:leading-[1.06]';

/** A page's title (in the display face, like the landing page's headings), its line of context, and its actions. */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h1 className={PAGE_TITLE_CLASS}>{title}</h1>{description && <p className="mt-2 max-w-2xl text-base leading-6 text-pretty text-muted-foreground">{description}</p>}</div>{children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}</header>;
}
