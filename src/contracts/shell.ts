import type { Mode, Photo, StaffRole } from './common';
import type { ActionHandler } from './actions';
import type { AppLocale } from './locale';

/** Who is using the app, as far as the page shells need to know. */
export type ShellViewer =
  | { kind: 'public' }
  | {
      kind: 'user';
      id: string;
      displayName: string;
      initials: string;
      /** The profile photo, when they added one (shown in the account menu). */
      photo?: Photo;
      mode: Mode;
      /** Helper onboarding is complete enough to use helper mode. */
      helperReady: boolean;
      unreadMessages: number;
      unreadNotifications: number;
    }
  | {
      kind: 'staff';
      id: string;
      displayName: string;
      initials: string;
      photo?: Photo;
      roles: StaffRole[];
      /** Staff must pass the two-step check before admin pages render (see /admin/verify). */
      twoStepVerified: boolean;
    };

export type SignedInViewer = Extract<ShellViewer, { kind: 'user' }>;

/**
 * What everyone in the market should know, at the top of every signed-in page. `bookings_paused`: the outage
 * switch is on (completion plan 5.15), so new bookings, tips and paid changes wait; bookings people already have
 * go ahead, and posting, offers and messages work as usual.
 */
export const SHELL_NOTICES = ['bookings_paused'] as const;
export type ShellNotice = (typeof SHELL_NOTICES)[number];
export type StaffViewer = Extract<ShellViewer, { kind: 'staff' }>;

/**
 * The shells' language switch: this device's language (and a signed-in account's, which emails and texts use).
 * The page then re-renders in place in the new language, with no reload. Without it (previews) the switch falls
 * back to plain /es and /en links.
 */
export type LanguageSwitchHandler = ActionHandler<{ locale: AppLocale }>;

export interface AppShellHandlers {
  /** Switch between "I need help" and "I can help". May resolve with redirectTo (helper onboarding). */
  onModeChange: ActionHandler<{ mode: Mode }>;
  onSignOut: ActionHandler;
  onSwitchLanguage?: LanguageSwitchHandler;
  /**
   * This browser's notifications belong to whoever is signed in (sweep MN5). The shell checks its push subscription once
   * a page load: ok `updated` when it's this person's; `not_found` when it isn't (another account's, which stops getting
   * them here, or nobody's), and the browser lets go of it, so the device's switch reads off.
   */
  onCheckPushDevice?: ActionHandler<{ endpoint: string }>;
  /** Signing out takes this browser's subscription off the account first (`onRemovePushSubscription`). */
  onForgetPushDevice?: ActionHandler<{ endpoint: string }>;
}

export interface AdminShellHandlers {
  onSignOut: ActionHandler;
}

/** Breadcrumb labels are content (names, ids), so the app provides them as plain strings. */
export interface Breadcrumb {
  label: string;
  href?: string;
}
