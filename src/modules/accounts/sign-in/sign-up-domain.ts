import { routes, type Mode, type SignUpIntent } from '@/contracts';

/**
 * `/sign-up`'s choices as pure rules (completion plan 9.6; src/contracts/auth.ts `SIGN_UP_INTENTS`).
 */

/**
 * Where a new account goes once the steps are done: helper setup for someone here to help out, the app for someone
 * here to get help. A destination they were already headed to (posting a task, an offer) wins.
 */
export function destinationAfterSignUp(intent: SignUpIntent, next: string): string {
  if (next !== routes.app.home()) return next;
  return intent === 'help_out' ? routes.app.helperOnboarding() : next;
}

/** The side of the app a new account opens on. Either side is one switch away later. */
export function modeForIntent(intent: SignUpIntent): Mode {
  return intent === 'help_out' ? 'helper' : 'poster';
}
