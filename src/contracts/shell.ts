import type { Mode, StaffRole } from './common';
import type { ActionHandler } from './actions';

/** Who is using the app, as far as the page shells need to know. */
export type ShellViewer =
  | { kind: 'public' }
  | {
      kind: 'user';
      id: string;
      displayName: string;
      initials: string;
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
      roles: StaffRole[];
      /** Staff must pass the two-step check before admin pages render (see /admin/verify). */
      twoStepVerified: boolean;
    };

export type SignedInViewer = Extract<ShellViewer, { kind: 'user' }>;
export type StaffViewer = Extract<ShellViewer, { kind: 'staff' }>;

export interface AppShellHandlers {
  /** Switch between "I need help" and "I can help". May resolve with redirectTo (helper onboarding). */
  onModeChange: ActionHandler<{ mode: Mode }>;
  onSignOut: ActionHandler;
}

export interface AdminShellHandlers {
  onSignOut: ActionHandler;
}

/** Breadcrumb labels are content (names, ids), so the app provides them as plain strings. */
export interface Breadcrumb {
  label: string;
  href?: string;
}
