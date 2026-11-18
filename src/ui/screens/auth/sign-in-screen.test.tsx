/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type SignInHandlers } from '@/contracts';
import {
  fakeSignInHandlers,
  signInEmailCodeStep,
  signInEmailStep,
  signInEmailStepWithProviders,
  signInSocialErrors,
  signInPhoneCodeStep,
  signInPhoneStep,
  signInProfileStep,
  signInProfileStepPrefilled,
  signInResults,
  signInSignUpStep,
  signInSignUpStepWithProviders,
} from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import forms from '../../../../messages/en/ui/forms.json';
import signIn from '../../../../messages/en/ui/signIn.json';
import feedback from '../../../../messages/en/ui/feedback.json';
import { EmailStep } from './email-step';
import { EmailCodeStep } from './email-code-step';
import { PhoneStep } from './phone-step';
import { PhoneCodeStep } from './phone-code-step';
import { ProfileStep } from './profile-step';
import { SignInScreen } from './sign-in-screen';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function handlers(overrides: Partial<SignInHandlers> = {}): SignInHandlers {
  return { ...fakeSignInHandlers, ...overrides };
}

function show(children: ReactElement) {
  return render(children, {
    wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={{ ...uiMessages, forms, signIn }}><TimeZoneProvider timeZone="America/Chicago">{children}</TimeZoneProvider></NextIntlClientProvider>,
  });
}

describe('sign-in forms', () => {
  it('focuses the required email field without sending an empty request', async () => {
    const onRequestEmailCode = vi.fn();
    show(<EmailStep data={signInEmailStep} handlers={handlers({ onRequestEmailCode })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(forms.fieldErrors.required)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(expect.stringContaining(forms.fieldErrors.required));
    expect(onRequestEmailCode).not.toHaveBeenCalled();
  });

  it('sends the normalized output from the email contract schema', async () => {
    const onRequestEmailCode = vi.fn(async (): Promise<ActionResult> => signInResults.codeSent);
    show(<EmailStep data={signInEmailStep} handlers={handlers({ onRequestEmailCode })} />);
    await userEvent.type(screen.getByLabelText('Email'), ' Maya@Example.TEST ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onRequestEmailCode).toHaveBeenCalledExactlyOnceWith({ email: 'maya@example.test' });
  });

  it('applies the first server field error and focuses the incorrect code', async () => {
    const onVerifyEmailCode = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { code: ['incorrect', 'invalid'] },
    }));
    show(<EmailCodeStep data={signInEmailCodeStep} handlers={handlers({ onVerifyEmailCode })} />);
    const code = screen.getByLabelText('6-digit code');
    // The sixth digit sends the code.
    await userEvent.type(code, '123456');
    expect(onVerifyEmailCode).toHaveBeenCalledExactlyOnceWith({ code: '123456' });
    expect(await screen.findByText(forms.fieldErrors.incorrect)).toBeVisible();
    await waitFor(() => expect(code).toHaveFocus());
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(code).toHaveAccessibleDescription(expect.stringContaining(forms.fieldErrors.incorrect));
    expect(screen.queryByText(forms.fields.code.invalid)).not.toBeInTheDocument();
  });

  it('renders initial incorrect-code feedback without interaction', async () => {
    show(<EmailCodeStep data={signInEmailCodeStep} handlers={handlers()} initialResult={signInResults.codeIncorrect} />);
    expect(await screen.findByText(forms.fieldErrors.incorrect)).toBeVisible();
  });

  it('formats a retry time in Central time and announces the inline error', () => {
    const { container } = show(<EmailCodeStep data={signInEmailCodeStep} handlers={handlers()} initialResult={signInResults.tooManyTries} />);
    expect(screen.getByText(/9:10 am/)).toBeVisible();
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('9:10 am');
    expect(screen.getByText(forms.actionErrors.rate_limited)).toBeVisible();
  });

  it('disables code submission while pending and prevents another request', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onVerifyEmailCode = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show(<EmailCodeStep data={signInEmailCodeStep} handlers={handlers({ onVerifyEmailCode })} />);
    await userEvent.type(screen.getByLabelText('6-digit code'), '123456');
    const submit = screen.getByRole('button', { name: 'Continue' });
    await userEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(submit);
    expect(onVerifyEmailCode).toHaveBeenCalledTimes(1);
    await act(async () => finish(signInResults.codeIncorrect));
    expect(submit).toBeEnabled();
    expect(await screen.findByText(forms.fieldErrors.incorrect)).toBeVisible();
  });

  it('keeps resend disabled until its deadline without submitting automatically', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T15:00:00.000Z'));
    const onResendEmailCode = vi.fn();
    show(<EmailCodeStep data={{ ...signInEmailCodeStep, resendAvailableAt: '2026-11-17T15:00:02.000Z' }} handlers={handlers({ onResendEmailCode })} />);
    const resend = screen.getByRole('button', { name: /Send a new code/ });
    expect(resend).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(resend).toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(resend).toBeEnabled();
    expect(onResendEmailCode).not.toHaveBeenCalled();
  });

  it('resends without validating an empty code and confirms the result', async () => {
    const onResendEmailCode = vi.fn(async (): Promise<ActionResult> => signInResults.codeSent);
    show(<EmailCodeStep data={signInEmailCodeStep} handlers={handlers({ onResendEmailCode })} />);
    await userEvent.click(screen.getByRole('button', { name: /Send a new code/ }));
    expect(onResendEmailCode).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/^New code sent\.?$/)).toBeVisible();
    expect(screen.queryByText(forms.fieldErrors.required)).not.toBeInTheDocument();
  });

  it('requires both profile checkboxes and links to the current policies', async () => {
    const onSaveProfile = vi.fn();
    show(<ProfileStep data={signInProfileStep} handlers={handlers({ onSaveProfile })} />);
    await userEvent.type(screen.getByLabelText('First name'), 'Maya');
    await userEvent.type(screen.getByLabelText('Last name'), 'Rivera');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findAllByText(forms.fieldErrors.must_accept)).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /18 or older/ })).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute('href', routes.legal('terms'));
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', routes.legal('privacy'));
    expect(onSaveProfile).not.toHaveBeenCalled();
  });

  it('prefills profile names supplied by the app', () => {
    show(<ProfileStep data={signInProfileStepPrefilled} handlers={handlers()} />);
    expect(screen.getByLabelText('First name')).toHaveValue('Maya');
    expect(screen.getByLabelText('Last name')).toHaveValue('Rivera');
  });

  it('rejects an unsupported phone number before calling the handler', async () => {
    const onSendPhoneCode = vi.fn();
    show(<PhoneStep data={signInPhoneStep} handlers={handlers({ onSendPhoneCode })} />);
    await userEvent.type(screen.getByLabelText('Phone number'), '+44 20 7946 0958');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(forms.fieldErrors.not_supported)).toBeVisible();
    expect(onSendPhoneCode).not.toHaveBeenCalled();
  });

  it('follows an auth redirect with replace instead of push', async () => {
    const onVerifyPhoneCode = vi.fn(async (): Promise<ActionResult> => signInResults.done);
    show(<PhoneCodeStep data={signInPhoneCodeStep} handlers={handlers({ onVerifyPhoneCode })} />);
    const code = screen.getByLabelText('6-digit code');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('maxlength', '6');
    await userEvent.type(code, '123456');
    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(signInResults.done.redirectTo));
    expect(onVerifyPhoneCode).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows friendly feedback when a handler rejects', async () => {
    const onRequestEmailCode = vi.fn(async (): Promise<ActionResult> => { throw new Error('Network unavailable'); });
    show(<EmailStep data={signInEmailStep} handlers={handlers({ onRequestEmailCode })} />);
    await userEvent.type(screen.getByLabelText('Email'), 'maya@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('changes steps only when the app supplies new data', async () => {
    const suppliedHandlers = handlers({ onRequestEmailCode: vi.fn(async (): Promise<ActionResult> => signInResults.codeSent) });
    const view = show(<SignInScreen data={signInEmailStep} handlers={suppliedHandlers} />);
    await userEvent.type(screen.getByLabelText('Email'), 'maya@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    view.rerender(<SignInScreen data={signInEmailCodeStep} handlers={suppliedHandlers} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
  });
});

describe('creating an account (/sign-up)', () => {
  it('sends the details with what the person is here for, and links to sign-in', async () => {
    const onStartSignUp = vi.fn(async (): Promise<ActionResult> => signInResults.codeSent);
    show(<SignInScreen data={signInSignUpStep} handlers={handlers({ onStartSignUp })} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
    expect(screen.getByRole('radio', { name: /I need help with tasks/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onStartSignUp).not.toHaveBeenCalled();
    expect((await screen.findAllByText(forms.fieldErrors.required)).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('radio', { name: /I want to help and earn/ }));
    await userEvent.type(screen.getByLabelText('First name'), 'Bea');
    await userEvent.type(screen.getByLabelText('Last name'), 'Tester');
    await userEvent.type(screen.getByLabelText('Email'), 'bea@example.test');
    await userEvent.click(screen.getByRole('checkbox', { name: "I'm 18 or older" }));
    await userEvent.click(screen.getByRole('checkbox', { name: /I agree to the Terms of service/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onStartSignUp).toHaveBeenCalledWith({ firstName: 'Bea', lastName: 'Tester', email: 'bea@example.test', intent: 'help_out', adultAttested: true, termsAccepted: true }));
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', routes.signIn(signInSignUpStep.next));
  });

  it('carries the choice to Google and Microsoft', async () => {
    const onSignUpWith = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent', redirectTo: '#provider' }));
    show(<SignInScreen data={signInSignUpStepWithProviders} handlers={handlers({ onSignUpWith })} />);
    await userEvent.click(screen.getByRole('radio', { name: /I want to help and earn/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(onSignUpWith).toHaveBeenCalledWith({ provider: 'google', intent: 'help_out' }));
  });

  it('links from sign-in to creating an account, keeping where the person was going', () => {
    show(<EmailStep data={{ ...signInEmailStep, next: routes.app.newTask() }} handlers={handlers()} />);
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', routes.signUp(routes.app.newTask()));
  });
});

describe('Continue with Google or Microsoft', () => {
  it('shows no provider buttons when none is offered', () => {
    show(<EmailStep data={signInEmailStep} handlers={handlers()} />);
    expect(screen.queryByRole('button', { name: /Continue with/ })).toBeNull();
    expect(screen.getByText(signIn.email.description)).toBeVisible();
  });

  it('leaves for the provider with a full page load, and stays busy meanwhile', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const onContinueWith = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent', redirectTo: 'https://accounts.example/authorize?state=1' }));
    show(<EmailStep data={signInEmailStepWithProviders} handlers={handlers({ onContinueWith })} />);
    expect(screen.getByText(signIn.social.microsoftHint)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onContinueWith).toHaveBeenCalledExactlyOnceWith({ provider: 'google' });
    expect(assign).toHaveBeenCalledExactlyOnceWith('https://accounts.example/authorize?state=1');
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue with Microsoft' })).toBeDisabled();
  });

  it('shows why a provider sign-in came back, and a refused start', async () => {
    const onContinueWith = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'rate_limited', retryAt: '2026-11-17T15:10:00.000Z' }));
    show(<EmailStep data={signInSocialErrors.emailUnconfirmed} handlers={handlers({ onContinueWith })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(signIn.social.errors.email_unconfirmed.replace('{provider}', 'Microsoft'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Microsoft' }));
    expect(await screen.findByText(forms.actionErrors.rate_limited)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue with Microsoft' })).toBeEnabled();
  });

  it('points a blocked account to help', () => {
    show(<EmailStep data={signInSocialErrors.notAllowed} handlers={handlers()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(signIn.social.errors.not_allowed);
    expect(screen.getByRole('link', { name: signIn.social.getHelp })).toHaveAttribute('href', routes.help());
  });
});

