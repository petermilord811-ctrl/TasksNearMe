import type { ISODateTime, Mode, Photo, StaffRole } from './common';
import type { ActionHandler, QueryHandler } from './actions';
import type { AiSearchInput, AiSearchResult } from './home';
import type { AppLocale } from './locale';
import type { OnboardingStep } from './routes';
import type { OnboardingStepState } from './onboarding';
import type { SparksSummary } from './sparks';

/**
 * A helper who isn't a verified helper yet (owner, 2026-11-23: "show 'Finish setting up to start helping' as 'to be
 * verified helper' and show it as reminder type, not full-width bar"): the reminder beside the search bar.
 * - `canHelp`: their home address is verified, so they already send offers; the rest earns the badge.
 * - `checks`: the verified-helper checks that apply (home address, phone where texts work, ID, payouts, background
 *   check for in-home services), each with its state, in any order; `done` of `total`.
 * - `next`: the step to open first (the home address while helping isn't open).
 */
export interface HelperSetupReminder {
  canHelp: boolean;
  checks: { step: OnboardingStep; state: OnboardingStepState }[];
  done: number;
  total: number;
  next: OnboardingStep;
}

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
      /** A helper (with a profile) who isn't a verified helper yet: the reminder's checks. */
      helperSetup?: HelperSetupReminder;
      unreadMessages: number;
      unreadNotifications: number;
      /** Their @username and Sparks, in the account menu (2026-11-22). */
      username?: string;
      sparks?: SparksSummary;
      /**
       * The newest post on Neighbors in their market by someone else (plan 10.19), for the dot on the Neighbors item:
       * newer than this device's last look at Neighbors (`visitKey`, src/ui/lib/last-visit.ts) means something new.
       */
      neighborsNews?: { latestAt: ISODateTime; visitKey: string };
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
      /** Live chats waiting for someone from support (2026-11-22): the count beside Live chat in the staff menu. */
      liveWaiting?: number;
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
  /** Switch between "I need help" and "I can help". The page stays (since 2026-11-23 setup is a reminder, not a detour). */
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
  /**
   * Ask AI in the search bar at the top of the app's pages (owner, 2026-11-23): the dashboard's AI search
   * (`DashboardHandlers.onAiSearch`, counted by the plan), run only when the person asks. Without it the bar still
   * suggests the next step from the words (post them as a task, find helpers or tasks, search Neighbors, a page).
   */
  onAskSearch?: QueryHandler<AiSearchInput, AiSearchResult>;
}

export interface AdminShellHandlers {
  onSignOut: ActionHandler;
}

/** Breadcrumb labels are content (names, ids), so the app provides them as plain strings. */
export interface Breadcrumb {
  label: string;
  href?: string;
}
