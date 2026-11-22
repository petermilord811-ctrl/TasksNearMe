import { routes, type Mode, type SignUpIntent, type SocialProvider } from '@/contracts';

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

/** Where someone headed is here to get help: posting or their tasks, browsing, requesting or saving helpers. */
const GETTING_HELP = [routes.postTask(), '/app/tasks', '/app/helpers', routes.app.saved()];

/**
 * What someone signing up is likely here for, from where they were headed: posting a task or booking a helper means
 * getting help (visitor-to-first-post walk, J-V). Anything else, an offer or helper setup among them, starts on helping
 * out (owner, 2026-11-22: "Make I can help as default"). The form starts on it and they can change it.
 */
export function intentForNext(next: string): SignUpIntent {
  const path = next.split(/[?#]/)[0] ?? '';
  return GETTING_HELP.some((start) => path === start || path.startsWith(`${start}/`)) ? 'get_help' : 'help_out';
}

/** The side of the app a new account opens on. Either side is one switch away later. */
export function modeForIntent(intent: SignUpIntent): Mode {
  return intent === 'help_out' ? 'helper' : 'poster';
}

/** What ties a choice made on `/sign-up` to the account its flow reaches (sign-up-pending.ts). */
export interface SignUpBinding {
  /** From the form: its email, which the code proves. */
  details?: { email: string };
  /** From Google or Microsoft: which one, and when its button was pressed (epoch ms). */
  via?: { provider: SocialProvider; at: number };
}

/** An account's provider links, each with when it was made (epoch ms; Better Auth's `accounts.created_at`). */
export interface SignUpAccount {
  email: string;
  links: readonly { provider: string; linkedAt: number }[];
}

/**
 * How long before the button's press a link still counts. Both times come from the server's clock (Better Auth stamps
 * the link), so this only absorbs drift between servers.
 */
export const LINK_LEEWAY_MS = 60_000;

/**
 * Whether the side of the app chosen on `/sign-up` goes on this account (aa's sweep S8, 2026-11-18). The choice waits
 * in the browser for up to 30 minutes and someone else may sign in there meanwhile, so it counts only for the account
 * its own flow reached: from the form, the account with the form's email; from Google or Microsoft, an account that
 * linked that provider once the button was pressed. A choice tied to neither (a cookie from before) counts for no one.
 */
export function signUpIntentApplies(binding: SignUpBinding, account: SignUpAccount): boolean {
  if (binding.details) return binding.details.email === account.email;
  const via = binding.via;
  if (!via) return false;
  return account.links.some((link) => link.provider === via.provider && link.linkedAt >= via.at - LINK_LEEWAY_MS);
}
