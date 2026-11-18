import { describe, expect, it } from 'vitest';
import { displayNameOf, phoneReasonFor, resolveSignInStep, safeNextPath, type SignInUserState } from './steps';

const now = new Date('2026-11-17T15:00:00.000Z');
const complete: SignInUserState = {
  firstName: 'Maya',
  lastName: 'Rivera',
  adultAttestedAt: now,
  termsAcceptedAt: now,
  phoneVerifiedAt: null,
};

describe('safeNextPath', () => {
  it.each([
    ['/app/tasks/new', '/app/tasks/new'],
    ['/app/find-work/tsk_1?from=board#offer', '/app/find-work/tsk_1?from=board#offer'],
    [' /pricing ', '/pricing'],
  ])('keeps same-site path %j', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    '',
    'https://evil.example/app',
    '//evil.example/app',
    // Dot segments the parser resolves into a protocol-relative "//evil.example" (sweep 2026-11-18).
    '/.//evil.example/x',
    '/%2e//evil.example',
    '/app/..//evil.example',
    '/app/%2e%2e/%2e%2e//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/sign-in?next=/app',
    '/api/auth/sign-out',
    '/app\nSet-Cookie: x',
  ])('falls back to /app for %j', (input) => {
    expect(safeNextPath(input)).toBe('/app');
  });
});

describe('phoneReasonFor', () => {
  it('asks for a phone before posting, offering, and booking', () => {
    expect(phoneReasonFor('/app/tasks/new')).toBe('post');
    expect(phoneReasonFor('/app/tasks/new?category=moving-help')).toBe('post');
    expect(phoneReasonFor('/app/find-work/tsk_desk')).toBe('offer');
    expect(phoneReasonFor('/app/tasks/tsk_1/offers/off_2/confirm')).toBe('book');
    expect(phoneReasonFor('/app/helpers/sam-k/request?slot=sl_1')).toBe('book');
  });

  it('does not ask for browsing', () => {
    for (const path of ['/app', '/app/find-work', '/app/tasks', '/app/tasks/tsk_1', '/pricing']) {
      expect(phoneReasonFor(path)).toBeNull();
    }
  });
});

describe('resolveSignInStep', () => {
  it('starts with the email step', () => {
    expect(resolveSignInStep({ next: '/app', now })).toEqual({ kind: 'step', data: { step: 'email', next: '/app' } });
  });

  it('offers Google and Microsoft on the email step, with what went wrong when one came back', () => {
    const socialError = { provider: 'microsoft', reason: 'email_unconfirmed' } as const;
    expect(resolveSignInStep({ next: '/app', now, socialProviders: ['google', 'microsoft'], socialError })).toEqual({
      kind: 'step',
      data: { step: 'email', next: '/app', socialProviders: ['google', 'microsoft'], socialError },
    });
    // None offered (production without keys): just the email code.
    expect(resolveSignInStep({ next: '/app', now, socialProviders: [] })).toEqual({ kind: 'step', data: { step: 'email', next: '/app' } });
    // Only the email step shows them.
    expect(resolveSignInStep({ next: '/app', now, socialProviders: ['google'], pendingEmail: { email: 'maya@example.test' } })).toMatchObject({ data: { step: 'email_code' } });
    expect(resolveSignInStep({ next: '/app', now, socialProviders: ['google'], user: complete })).toEqual({ kind: 'done', redirectTo: '/app' });
  });

  it('asks for the emailed code, with the resend time while it is in the future', () => {
    const resolution = resolveSignInStep({
      next: '/app',
      now,
      pendingEmail: { email: 'maya@example.test', resendAvailableAt: new Date('2026-11-17T15:00:30.000Z') },
    });
    expect(resolution).toEqual({
      kind: 'step',
      data: {
        step: 'email_code',
        next: '/app',
        email: 'maya@example.test',
        codeLifetimeMinutes: 10,
        resendAvailableAt: '2026-11-17T15:00:30.000Z',
      },
    });
    const later = resolveSignInStep({
      next: '/app',
      now,
      pendingEmail: { email: 'maya@example.test', resendAvailableAt: new Date('2026-11-17T14:59:00.000Z') },
    });
    expect(later.kind === 'step' ? later.data.resendAvailableAt : 'done').toBeUndefined();
  });

  it('asks new accounts for their name, age, and terms', () => {
    const fresh = { ...complete, firstName: '', lastName: '', adultAttestedAt: null, termsAcceptedAt: null };
    expect(resolveSignInStep({ next: '/app', now, user: fresh })).toEqual({
      kind: 'step',
      data: { step: 'profile', next: '/app' },
    });
    const halfway = { ...complete, termsAcceptedAt: null };
    const resolution = resolveSignInStep({ next: '/app', now, user: halfway });
    expect(resolution.kind === 'step' && resolution.data.profileDefaults).toEqual({ firstName: 'Maya', lastName: 'Rivera' });
  });

  it('asks a new account for an invite first while sign-up is invite-only (private beta)', () => {
    const fresh: SignInUserState = { firstName: '', lastName: '', adultAttestedAt: null, termsAcceptedAt: null, phoneVerifiedAt: null };
    const invite = { marketName: 'Austin', code: 'K7QPM4XD' };
    expect(resolveSignInStep({ next: '/app', now, user: fresh, invite })).toEqual({ kind: 'step', data: { step: 'invite_code', next: '/app', invite } });
    // No invite needed (switch off, or already in): the name and age as usual.
    expect(resolveSignInStep({ next: '/app', now, user: fresh })).toMatchObject({ kind: 'step', data: { step: 'profile' } });
    // An account that finished signing up is never held back.
    expect(resolveSignInStep({ next: '/app', now, user: complete, invite })).toEqual({ kind: 'done', redirectTo: '/app' });
  });

  it('asks for a phone only when the destination needs one', () => {
    expect(resolveSignInStep({ next: '/app', now, user: complete })).toEqual({ kind: 'done', redirectTo: '/app' });
    expect(resolveSignInStep({ next: '/app/tasks/new', now, user: complete })).toEqual({
      kind: 'step',
      data: { step: 'phone', next: '/app/tasks/new', phoneReason: 'post' },
    });
    expect(
      resolveSignInStep({ next: '/app/tasks/new', now, user: complete, pendingPhone: { maskedPhone: '(512) •••-••67' } }),
    ).toEqual({
      kind: 'step',
      data: {
        step: 'phone_code',
        next: '/app/tasks/new',
        phoneReason: 'post',
        maskedPhone: '(512) •••-••67',
        codeLifetimeMinutes: 10,
      },
    });
    expect(resolveSignInStep({ next: '/app/tasks/new', now, user: { ...complete, phoneVerifiedAt: now } })).toEqual({
      kind: 'done',
      redirectTo: '/app/tasks/new',
    });
  });
});

describe('the phone step only where texts work (plan 9.2)', () => {
  it.each(['/app/tasks/new', '/app/find-work/tsk_desk', '/app/tasks/tsk_1/offers/off_2/confirm'])('goes straight on to %s without an SMS provider or in the grace', (next) => {
    for (const phoneCheck of ['off', 'asked'] as const) {
      expect(resolveSignInStep({ next, now, user: complete, phoneCheck })).toEqual({ kind: 'done', redirectTo: next });
      // A code sent before texts stopped working doesn't bring the step back either.
      expect(resolveSignInStep({ next, now, user: complete, phoneCheck, pendingPhone: { maskedPhone: '(512) •••-••67' } })).toEqual({ kind: 'done', redirectTo: next });
    }
  });

  it('asks for it where texts work, as before', () => {
    expect(resolveSignInStep({ next: '/app/tasks/new', now, user: complete, phoneCheck: 'required' })).toEqual({
      kind: 'step',
      data: { step: 'phone', next: '/app/tasks/new', phoneReason: 'post' },
    });
  });
});

describe('displayNameOf', () => {
  it('uses the first name and last initial', () => {
    expect(displayNameOf('Maya', 'rivera')).toBe('Maya R.');
    expect(displayNameOf(' Jordan ', '')).toBe('Jordan');
  });
});
