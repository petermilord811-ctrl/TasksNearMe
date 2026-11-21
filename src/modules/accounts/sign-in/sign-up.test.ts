import { describe, expect, it } from 'vitest';
import { routes, signUpInputSchema, signUpSocialInputSchema } from '@/contracts';
import { destinationAfterSignUp, intentForNext, LINK_LEEWAY_MS, modeForIntent, signUpIntentApplies } from './sign-up-domain';
import { decodePendingSignUp, encodePendingSignUp, type PendingSignUp } from './sign-up-pending';
import { safeNextPath } from './steps';

/** `/sign-up`'s rules and the cookie that carries its answers to the code step (completion plan 9.6). */

describe('where a new account starts', () => {
  it('opens helper setup for someone here to help, and the app for someone here for help', () => {
    expect(destinationAfterSignUp('help_out', routes.app.home())).toBe(routes.app.helperOnboarding());
    expect(destinationAfterSignUp('get_help', routes.app.home())).toBe(routes.app.home());
    expect(modeForIntent('help_out')).toBe('helper');
    expect(modeForIntent('get_help')).toBe('poster');
  });

  it('keeps a destination the person was already headed to', () => {
    expect(destinationAfterSignUp('help_out', routes.app.newTask())).toBe(routes.app.newTask());
    expect(destinationAfterSignUp('get_help', '/app/find-work/tsk_desk')).toBe('/app/find-work/tsk_desk');
  });

  it('starts the form on helping out for someone headed to an offer or helper setup, and on getting help otherwise (J-V)', () => {
    expect(intentForNext(routes.app.findWorkTask('tsk_desk'))).toBe('help_out');
    expect(intentForNext(routes.app.findWork())).toBe('help_out');
    expect(intentForNext(routes.app.helperOnboarding())).toBe('help_out');
    expect(intentForNext(routes.app.newTask({ category: 'furniture-assembly' }))).toBe('get_help');
    expect(intentForNext(routes.app.home())).toBe('get_help');
    // Words that merely start the same don't count.
    expect(intentForNext('/app/helpers/priya-s/request')).toBe('get_help');
  });

  it('never sends the flow back to sign-in or sign-up', () => {
    expect(safeNextPath('/sign-up')).toBe(routes.app.home());
    expect(safeNextPath('/sign-up?next=%2Fapp')).toBe(routes.app.home());
  });
});

describe('the sign-up form', () => {
  const filled = { firstName: 'Bea', lastName: 'Tester', email: ' Bea@Example.test ', intent: 'help_out', adultAttested: true, termsAccepted: true } as const;

  it('needs the names, a valid email, a choice, 18+ and the terms', () => {
    expect(signUpInputSchema.safeParse(filled).success).toBe(true);
    for (const missing of ['firstName', 'lastName', 'email', 'intent'] as const) {
      expect(signUpInputSchema.safeParse({ ...filled, [missing]: '' }).success, missing).toBe(false);
    }
    expect(signUpInputSchema.safeParse({ ...filled, adultAttested: false }).success).toBe(false);
    expect(signUpInputSchema.safeParse({ ...filled, termsAccepted: false }).success).toBe(false);
    expect(signUpInputSchema.safeParse({ ...filled, intent: 'admin' }).success).toBe(false);
  });

  it('carries the choice to Google and Microsoft', () => {
    expect(signUpSocialInputSchema.safeParse({ provider: 'google', intent: 'get_help' }).success).toBe(true);
    expect(signUpSocialInputSchema.safeParse({ provider: 'google' }).success).toBe(false);
  });
});

describe('the pending sign-up cookie', () => {
  const secret = 'test-secret-0123456789';
  const fromForm: PendingSignUp = { intent: 'help_out', details: { email: 'bea@example.test', firstName: 'Bea', lastName: 'Tester', agreedAt: Date.UTC(2026, 10, 18, 12) } };

  it('reads back what it wrote, with or without the form’s details', () => {
    expect(decodePendingSignUp(encodePendingSignUp(fromForm, secret), secret)).toEqual(fromForm);
    const viaMicrosoft: PendingSignUp = { intent: 'get_help', via: { provider: 'microsoft', at: Date.UTC(2026, 10, 18, 12) } };
    expect(decodePendingSignUp(encodePendingSignUp(viaMicrosoft, secret), secret)).toEqual(viaMicrosoft);
    expect(decodePendingSignUp(encodePendingSignUp({ intent: 'get_help' }, secret), secret)).toEqual({ intent: 'get_help' });
  });

  it('refuses anything this server didn’t sign, or in another shape', () => {
    const raw = encodePendingSignUp(fromForm, secret);
    const [payload, signature] = raw.split('.') as [string, string];
    expect(decodePendingSignUp(raw, 'another-secret')).toBeNull();
    expect(decodePendingSignUp(`${payload}x.${signature}`, secret)).toBeNull();
    expect(decodePendingSignUp(undefined, secret)).toBeNull();
    expect(decodePendingSignUp('not-a-cookie', secret)).toBeNull();
    expect(decodePendingSignUp(encodePendingSignUp({ intent: 'admin' } as unknown as PendingSignUp, secret), secret)).toBeNull();
    expect(decodePendingSignUp(encodePendingSignUp({ intent: 'get_help', details: { email: 'x@example.test' } } as unknown as PendingSignUp, secret), secret)).toBeNull();
    for (const via of [null, { provider: 'facebook', at: 1 }, { provider: 'google', at: '1' }, { provider: 'google' }]) {
      expect(decodePendingSignUp(encodePendingSignUp({ intent: 'get_help', via } as unknown as PendingSignUp, secret), secret), JSON.stringify(via)).toBeNull();
    }
  });
});

describe('whose account the choice goes on (aa’s sweep S8)', () => {
  const pressedAt = Date.UTC(2026, 10, 18, 12);
  const viaGoogle = { via: { provider: 'google', at: pressedAt } } as const;
  const account = (links: { provider: string; linkedAt: number }[], email = 'robin@example.test') => ({ email, links });

  it('from the form, the account with the form’s email', () => {
    const fromForm = { details: { email: 'bea@example.test' } };
    expect(signUpIntentApplies(fromForm, account([], 'bea@example.test'))).toBe(true);
    expect(signUpIntentApplies(fromForm, account([{ provider: 'google', linkedAt: pressedAt }], 'someone@example.test'))).toBe(false);
  });

  it('from Google or Microsoft, an account that linked that provider once the button was pressed', () => {
    expect(signUpIntentApplies(viaGoogle, account([{ provider: 'google', linkedAt: pressedAt + 20_000 }]))).toBe(true);
    // Drift between the servers' clocks.
    expect(signUpIntentApplies(viaGoogle, account([{ provider: 'google', linkedAt: pressedAt - LINK_LEEWAY_MS }]))).toBe(true);
  });

  it('never someone else who signs in on the same browser meanwhile', () => {
    // With an email code: no link.
    expect(signUpIntentApplies(viaGoogle, account([]))).toBe(false);
    // An account that had Google long before, or that linked the other provider.
    expect(signUpIntentApplies(viaGoogle, account([{ provider: 'google', linkedAt: pressedAt - LINK_LEEWAY_MS - 1 }]))).toBe(false);
    expect(signUpIntentApplies(viaGoogle, account([{ provider: 'microsoft', linkedAt: pressedAt + 20_000 }]))).toBe(false);
    // A choice tied to neither (a cookie written before the rule).
    expect(signUpIntentApplies({}, account([{ provider: 'google', linkedAt: pressedAt }]))).toBe(false);
  });
});
