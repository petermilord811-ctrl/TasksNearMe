import type { ActionResult, SignInHandlers, SignInPageData } from '@/contracts';
import { routes } from '@/contracts';
import { fakeHandler } from './actions';

/** Every step of `/sign-in`, as the app would hand it to SignInScreen. Maya is posting a task. */

const next = routes.app.newTask();

export const signInEmailStep: SignInPageData = { step: 'email', next };

/** Google and Microsoft are offered (production with keys; development and tests use the stand-in). */
export const signInEmailStepWithProviders: SignInPageData = { step: 'email', next, socialProviders: ['google', 'microsoft'] };

/** Back from Google or Microsoft without signing in, one per reason. */
export const signInSocialErrors = {
  cancelled: { ...signInEmailStepWithProviders, socialError: { provider: 'google', reason: 'cancelled' } },
  emailUnconfirmed: { ...signInEmailStepWithProviders, socialError: { provider: 'microsoft', reason: 'email_unconfirmed' } },
  useEmailCode: { ...signInEmailStepWithProviders, socialError: { provider: 'google', reason: 'use_email_code' } },
  notAllowed: { ...signInEmailStepWithProviders, socialError: { provider: 'google', reason: 'not_allowed' } },
  failed: { ...signInEmailStepWithProviders, socialError: { provider: 'microsoft', reason: 'failed' } },
} satisfies Record<string, SignInPageData>;

export const signInEmailCodeStep: SignInPageData = {
  step: 'email_code',
  next,
  email: 'maya@example.test',
  codeLifetimeMinutes: 10,
};

/** A new account: no names yet. */
export const signInProfileStep: SignInPageData = { step: 'profile', next };

/** Came back to finish: names already saved. */
export const signInProfileStepPrefilled: SignInPageData = {
  step: 'profile',
  next,
  profileDefaults: { firstName: 'Maya', lastName: 'Rivera' },
};

/** Posting needs a verified phone. */
export const signInPhoneStep: SignInPageData = { step: 'phone', next, phoneReason: 'post' };

/** A helper making an offer. */
export const signInPhoneStepOffer: SignInPageData = {
  step: 'phone',
  next: routes.app.findWork(),
  phoneReason: 'offer',
};

export const signInPhoneCodeStep: SignInPageData = {
  step: 'phone_code',
  next,
  phoneReason: 'post',
  maskedPhone: '(512) •••-••67',
  codeLifetimeMinutes: 10,
};

/** Results the sign-in handlers can return. */
export const signInResults = {
  codeSent: { ok: true, code: 'sent' },
  /** Done: the app sends the person on. */
  done: { ok: true, code: 'updated', redirectTo: next },
  emailInvalid: { ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } },
  codeIncorrect: { ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } },
  codeExpired: { ok: false, code: 'expired', fieldErrors: { code: ['expired'] } },
  /** Locked after three wrong codes, until 9:10 am Central on Nov 17. */
  tooManyTries: { ok: false, code: 'rate_limited', retryAt: '2026-11-17T15:10:00.000Z' },
  phoneNotSupported: { ok: false, code: 'validation_failed', fieldErrors: { phone: ['not_supported'] } },
  phoneInUse: { ok: false, code: 'validation_failed', fieldErrors: { phone: ['in_use'] } },
  profileIncomplete: {
    ok: false,
    code: 'validation_failed',
    fieldErrors: { lastName: ['required'], adultAttested: ['must_accept'] },
  },
  accountNotAllowed: { ok: false, code: 'not_allowed' },
} satisfies Record<string, ActionResult>;

/** Handlers for previews: every call succeeds after a short delay. */
export const fakeSignInHandlers: SignInHandlers = {
  onRequestEmailCode: fakeHandler(signInResults.codeSent),
  // The real one returns the provider's page; previews stay put (only the hash changes).
  onContinueWith: fakeHandler({ ok: true, code: 'sent', redirectTo: '#continue-with-provider' }),
  onVerifyEmailCode: fakeHandler(signInResults.done),
  onResendEmailCode: fakeHandler(signInResults.codeSent),
  onChangeEmail: fakeHandler({ ok: true, code: 'updated' }),
  onSaveProfile: fakeHandler({ ok: true, code: 'saved' }),
  onSendPhoneCode: fakeHandler(signInResults.codeSent),
  onVerifyPhoneCode: fakeHandler(signInResults.done),
  onResendPhoneCode: fakeHandler(signInResults.codeSent),
  onChangePhone: fakeHandler({ ok: true, code: 'updated' }),
};
