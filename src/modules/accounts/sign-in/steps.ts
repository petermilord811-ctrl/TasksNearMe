import type { PhoneReason, SignInInvite, SignInPageData, SocialProvider, SocialSignInError } from '@/contracts';
import { routes } from '@/contracts';
import type { PhoneCheck } from '../phone-check';

/**
 * The sign-in flow as pure functions (blueprint 02 §1: email code → phone verification when
 * needed). The page and the server actions both use these, so the UI never decides the step.
 */

export const EMAIL_CODE_LIFETIME_MINUTES = 10;
export const RESEND_AFTER_SECONDS = 30;

/** Accounts that may not sign in (blueprint 08: users.status). */
export const BLOCKED_STATUSES = new Set(['suspended', 'banned', 'deleted']);

// Where to go after signing in: shared with the UI's "Sign in again" link (bad connections pass, J-N2).
export { safeNextPath } from '@/shared/next-path';

/** Posting, making offers, and booking need a verified phone (blueprint 06 §1) where texts work (plan 9.2). */
export function phoneReasonFor(next: string): PhoneReason | null {
  const path = next.split(/[?#]/)[0] ?? '';
  if (path === routes.app.newTask()) return 'post';
  if (path.startsWith(`${routes.app.findWork()}/`)) return 'offer';
  if (/^\/app\/tasks\/[^/]+\/offers\/[^/]+\/confirm$/.test(path)) return 'book';
  if (/^\/app\/helpers\/[^/]+\/request$/.test(path)) return 'book';
  return null;
}

export interface SignInUserState {
  firstName: string;
  lastName: string;
  adultAttestedAt: Date | null;
  termsAcceptedAt: Date | null;
  phoneVerifiedAt: Date | null;
}

export interface SignInState {
  next: string;
  /** Signed in. */
  user?: SignInUserState;
  /** A code was emailed and the person hasn't signed in yet. */
  pendingEmail?: { email: string; resendAvailableAt?: Date };
  /** A code was texted and not yet confirmed. */
  pendingPhone?: { maskedPhone: string; resendAvailableAt?: Date };
  /** Google and Microsoft, when offered (shown on the email step). */
  socialProviders?: SocialProvider[];
  /** A Google or Microsoft sign-in that came back without signing in. */
  socialError?: { provider: SocialProvider; reason: SocialSignInError };
  /** Private beta: finishing sign-up waits for an invite in this market (src/modules/beta). */
  invite?: SignInInvite;
  /** Whether the phone step can come (plan 9.2): only `required` asks for it here. Default `required`. */
  phoneCheck?: PhoneCheck;
  now: Date;
}

export type SignInResolution = { kind: 'step'; data: SignInPageData } | { kind: 'done'; redirectTo: string };

export function profileComplete(user: SignInUserState): boolean {
  return (
    user.firstName.trim() !== '' &&
    user.lastName.trim() !== '' &&
    user.adultAttestedAt !== null &&
    user.termsAcceptedAt !== null
  );
}

function resendAt(at: Date | undefined, now: Date): string | undefined {
  return at && at > now ? at.toISOString() : undefined;
}

export function resolveSignInStep(state: SignInState): SignInResolution {
  const { next, user, now } = state;

  if (!user) {
    if (state.pendingEmail) {
      const resendAvailableAt = resendAt(state.pendingEmail.resendAvailableAt, now);
      return {
        kind: 'step',
        data: {
          step: 'email_code',
          next,
          email: state.pendingEmail.email,
          codeLifetimeMinutes: EMAIL_CODE_LIFETIME_MINUTES,
          ...(resendAvailableAt ? { resendAvailableAt } : {}),
        },
      };
    }
    const { socialProviders, socialError } = state;
    return {
      kind: 'step',
      data: {
        step: 'email',
        next,
        ...(socialProviders && socialProviders.length > 0 ? { socialProviders } : {}),
        ...(socialError ? { socialError } : {}),
      },
    };
  }

  if (!profileComplete(user) && state.invite) {
    return { kind: 'step', data: { step: 'invite_code', next, invite: state.invite } };
  }

  if (!profileComplete(user)) {
    const hasNames = user.firstName.trim() !== '' || user.lastName.trim() !== '';
    return {
      kind: 'step',
      data: {
        step: 'profile',
        next,
        ...(hasNames ? { profileDefaults: { firstName: user.firstName, lastName: user.lastName } } : {}),
      },
    };
  }

  const phoneReason = phoneReasonFor(next);
  // No texts here (`off`), or the grace (`asked`: the account page and setup ask instead): no phone step.
  if (phoneReason && !user.phoneVerifiedAt && (state.phoneCheck ?? 'required') === 'required') {
    if (state.pendingPhone) {
      const resendAvailableAt = resendAt(state.pendingPhone.resendAvailableAt, now);
      return {
        kind: 'step',
        data: {
          step: 'phone_code',
          next,
          phoneReason,
          maskedPhone: state.pendingPhone.maskedPhone,
          codeLifetimeMinutes: EMAIL_CODE_LIFETIME_MINUTES,
          ...(resendAvailableAt ? { resendAvailableAt } : {}),
        },
      };
    }
    return { kind: 'step', data: { step: 'phone', next, phoneReason } };
  }

  return { kind: 'done', redirectTo: next };
}

/** "Maya" + "Rivera" → "Maya R." (the only name other people see). */
export function displayNameOf(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}
