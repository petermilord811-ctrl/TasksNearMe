/**
 * The booking and money screens' building blocks, in the app's refined language: the Card primitive's surface,
 * the display face, soft notes, and a glass tray for a form's main action. Class names only: each screen keeps
 * its own markup, roles and names.
 */

/** A section's card: rounded, a hairline border, the app's layered card shadow. */
export const surface = 'rounded-[1.375rem] border border-foreground/[0.07] bg-card text-card-foreground shadow-card dark:border-white/[0.06]';

/** A surface's usual inside space. */
export const surfacePad = 'p-5 sm:p-6';

/** A page title, when a screen lays out its own header (as PageHeader's h1). */
export const pageTitle = 'font-display text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance lg:text-[2.375rem] lg:leading-[1.06]';

/** A section heading. */
export const sectionTitle = 'font-heading text-xl/7 font-semibold tracking-[-0.015em] md:text-[1.375rem]/7.5';

/** A heading inside a card. */
export const cardTitle = 'font-heading text-[1.0625rem]/6 font-semibold tracking-[-0.01em]';

/** A quiet note in the page: a hint, a policy line, what happens next. */
export const note = 'rounded-2xl bg-secondary/70 px-4 py-3.5 text-sm text-secondary-foreground';

/** Something to act on before a deadline, or that couldn't go ahead. */
export const warningPanel = 'rounded-[1.375rem] border border-warning/35 bg-badge-warning text-badge-warning-foreground';

/** "Back to …" at the top of a flow page; its arrow nudges back on hover. */
export const backLink = 'group/back inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const backArrow = 'size-4 shrink-0 transition-transform duration-200 ease-[var(--ease-out)] group-hover/back:-translate-x-0.5 motion-reduce:transition-none';

/**
 * How far a floating tray stays above what it rests on: 0.5rem above the phone's tab dock or, with no dock, above
 * the home indicator (the safe area the dock isn't covering, never less than 0.5rem).
 */
export const trayGap = '[--action-tray-gap:max(0.5rem,calc(env(safe-area-inset-bottom,0px)_-_var(--app-bottom-offset,0px)))]';

/** A floating tray's glass, hairline edge and soft shadow. */
export const trayGlass = 'rounded-[1.375rem] border border-foreground/[0.07] app-glass p-3 shadow-[0_18px_40px_-24px_rgb(40_20_5/0.45)] dark:border-white/[0.08] dark:shadow-[0_18px_40px_-20px_rgb(0_0_0/0.75)]';

/**
 * The bar at the foot of a form (Pay, Send, Submit): a glass tray that sticks above the phone's tab dock with
 * `bottom-app-navigation` (`--app-bottom-offset`), so the main action is always in reach. A sticky box's margins
 * don't move it, so it floats by a small lift instead (`--action-tray-gap`).
 */
export const actionTray = `sticky bottom-app-navigation z-10 -translate-y-(--action-tray-gap) ${trayGap} ${trayGlass}`;
