/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, BACKGROUND_CHECK_STATUSES, IDENTITY_FAILURE_REASONS, IDENTITY_STATUSES, PAYOUT_ACCOUNT_STATUSES, routes, type ActionResult, type HelperOnboardingHandlers, type VerificationSummary } from '@/contracts';
import { fakeOnboardingHandlers, onboardingBackgroundNotStarted, onboardingDone, onboardingIdentityStep, onboardingPayoutStep } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import verificationCopy from '../../../../messages/en/ui/verification.json';
import { backgroundStatusTones, identityStatusTones, payoutStatusTones, VerificationPanel, type VerificationPanelProps } from './verification-panel';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function show(props: Partial<VerificationPanelProps> = {}) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, verification: verificationCopy }}><VerificationPanel
    track="identity" verification={onboardingIdentityStep.verification} categories={onboardingIdentityStep.categories}
    bookableCategories={[]} handlers={fakeOnboardingHandlers} {...props}
  /></NextIntlClientProvider>);
}

describe('helper verification', () => {
  it.each(IDENTITY_FAILURE_REASONS)('explains the %s identity retry reason', (failureReason) => {
    show({ verification: { ...onboardingIdentityStep.verification, identity: { status: 'requires_input', failureReason, consentNeeded: false } } });
    expect(screen.getByText(verificationCopy.identityFailureReasons[failureReason])).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it.each([
    ['identity', 'Start ID check', 'onStartIdentity', onboardingIdentityStep.verification, verificationCopy.setup.biometric.checkbox, { consent: true }],
    ['payout', 'Set up payouts', 'onStartPayout', onboardingPayoutStep.verification, undefined, undefined],
    ['background', 'Start background check', 'onStartBackgroundCheck', onboardingBackgroundNotStarted.verification, verificationCopy.setup.disclosure.checkbox, { acknowledged: true }],
  ] as const)('starts the %s provider flow and follows its redirect', async (track, label, handlerKey, verification, agreement, input) => {
    const destination = routes.app.helperOnboarding(track);
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: destination }));
    const handlers: HelperOnboardingHandlers = { ...fakeOnboardingHandlers, [handlerKey]: handler };
    show({ track, verification, handlers });
    if (agreement) await userEvent.click(screen.getByRole('checkbox', { name: agreement }));
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(handler).toHaveBeenCalledExactlyOnceWith(input);
    expect(push).toHaveBeenCalledWith(destination);
  });

  it.each([
    ['identity', 'Start ID check', onboardingIdentityStep.verification, verificationCopy.setup.biometric.required],
    ['background', 'Start background check', onboardingBackgroundNotStarted.verification, verificationCopy.setup.disclosure.required],
  ] as const)('asks for the %s consent before opening the provider', async (track, label, verification, required) => {
    const onStartIdentity = vi.fn(fakeOnboardingHandlers.onStartIdentity);
    const onStartBackgroundCheck = vi.fn(fakeOnboardingHandlers.onStartBackgroundCheck);
    show({ track, verification, handlers: { ...fakeOnboardingHandlers, onStartIdentity, onStartBackgroundCheck } });
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText(required)).toBeVisible();
    expect(onStartIdentity).not.toHaveBeenCalled();
    expect(onStartBackgroundCheck).not.toHaveBeenCalled();
  });

  it.each([
    ['try_later', verificationCopy.setup.identityBlocked.try_later.split('{')[0]!],
    ['too_many_attempts', verificationCopy.setup.identityBlocked.too_many_attempts],
    ['under_18', verificationCopy.setup.identityBlocked.under_18],
  ] as const)('explains a blocked ID check (%s) without a start button', (blocked, copy) => {
    show({ verification: { ...onboardingIdentityStep.verification, identity: { status: 'requires_input', failureReason: 'other', consentNeeded: false, blocked, ...(blocked === 'try_later' ? { retryAt: '2026-11-18T15:30:00.000Z' } : {}) } } });
    expect(screen.getByText(new RegExp(copy.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeVisible();
    expect(screen.queryByRole('button', { name: /Start ID check|Try again/ })).not.toBeInTheDocument();
  });

  it('waits for the provider result, disables duplicate starts, and announces failures', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onStartIdentity = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    const { container } = show({ handlers: { ...fakeOnboardingHandlers, onStartIdentity } });
    await userEvent.click(screen.getByRole('checkbox', { name: verificationCopy.setup.biometric.checkbox }));
    const button = screen.getByRole('button', { name: 'Start ID check' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onStartIdentity).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: false, code: 'unknown' }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(uiMessages.feedback.error.unknown);
    expect(push).not.toHaveBeenCalled();
  });

  it('refreshes processing status through the supplied handler', async () => {
    const onRefreshStatus = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show({ verification: { ...onboardingIdentityStep.verification, identity: { status: 'processing', consentNeeded: false } }, handlers: { ...fakeOnboardingHandlers, onRefreshStatus } });
    expect(screen.getByText("We're checking")).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(onRefreshStatus).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(await screen.findByText(uiMessages.feedback.success.updated)).toBeVisible();
  });

  it('says a consider result is under review, with no details, and offers only a status check', () => {
    const verification: VerificationSummary = { ...onboardingBackgroundNotStarted.verification, background: { status: 'consider', requiredFor: ['light-cleaning'], disclosureNeeded: false, renewalOpen: false, canStart: false } };
    show({ track: 'background', verification, bookableCategories: ['yard-cleanup'] });
    expect(screen.getByText('Under review')).toBeVisible();
    expect(screen.getByText(verificationCopy.setup.backgroundReview)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
  });

  it('opens the renewal 30 days before the check runs out', async () => {
    const onStartBackgroundCheck = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    const verification: VerificationSummary = { ...onboardingBackgroundNotStarted.verification, background: { status: 'clear', checkedAt: '2025-12-10T16:00:00.000Z', validUntil: '2026-12-10T16:00:00.000Z', requiredFor: ['light-cleaning'], disclosureNeeded: false, renewalOpen: true, canStart: true } };
    show({ track: 'background', verification, handlers: { ...fakeOnboardingHandlers, onStartBackgroundCheck } });
    await userEvent.click(screen.getByRole('button', { name: verificationCopy.setup.startRenewal }));
    expect(onStartBackgroundCheck).toHaveBeenCalledExactlyOnceWith({ acknowledged: false });
  });

  it('only shows background categories supplied by the app as bookable', () => {
    show({ track: 'background', verification: { ...onboardingBackgroundNotStarted.verification, background: { status: 'pending', requiredFor: ['light-cleaning'], disclosureNeeded: false, renewalOpen: false, canStart: false } }, bookableCategories: ['yard-cleanup'] });
    expect(screen.getByText('Light cleaning')).toBeVisible();
    expect(screen.getByText('Yard cleanup')).toBeVisible();
    expect(screen.getByText(verificationCopy.setup.bookableCategories).parentElement).not.toHaveTextContent('Light cleaning');
  });

  it('omits the background panel when no category requires a check', () => {
    const { container } = show({ track: 'background', verification: { ...onboardingIdentityStep.verification, background: { status: 'not_required', requiredFor: [], disclosureNeeded: false, renewalOpen: false, canStart: false } } });
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the supplied verified date for the public badge', () => {
    show({ verification: onboardingDone.verification });
    expect(screen.getByRole('button', { name: 'ID verified · Nov 2026' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start ID check' })).not.toBeInTheDocument();
  });

  it('links incomplete editor statuses back to onboarding and restricted payouts to support', () => {
    show({ track: 'payout', verification: onboardingPayoutStep.verification, handlers: undefined });
    expect(screen.getByRole('link', { name: 'Open payout setup' })).toHaveAttribute('href', routes.app.helperOnboarding('payout'));
    cleanup();
    show({ track: 'payout', verification: { ...onboardingPayoutStep.verification, payout: { status: 'restricted' } } });
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', routes.app.support());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['identity', 'payout', 'background'] as const)('never collects private provider fields for %s', (track) => {
    const { container } = show({ track, verification: onboardingBackgroundNotStarted.verification });
    expect(screen.queryByLabelText(/ID number|SSN|social security|date of birth|bank account/i)).not.toBeInTheDocument();
    // At most the consent checkbox: nothing the providers collect.
    expect(container.querySelector('input:not([type="checkbox"]), select, textarea')).toBeNull();
  });

  it.each(ACTION_ERROR_CODES)('announces the %s action error without raw codes', (code) => {
    const { container } = show({ initialResult: { ok: false, code } });
    expect(container.querySelector('[aria-live="polite"]')).not.toBeEmptyDOMElement();
    expect(screen.queryByText(code, { exact: true })).not.toBeInTheDocument();
  });

  it('still announces validation errors when the provider returns fields this screen does not collect', () => {
    show({ initialResult: { ok: false, code: 'validation_failed', fieldErrors: { document: ['invalid'] } } });
    expect(screen.getByText(uiMessages.feedback.error.validation_failed)).toBeVisible();
  });

  it('has plain-language labels and tones for every provider status', () => {
    for (const status of IDENTITY_STATUSES) {
      expect(verificationCopy.statuses.identity[status]).toBeTruthy();
      expect(identityStatusTones[status]).toBeTruthy();
    }
    for (const status of PAYOUT_ACCOUNT_STATUSES) {
      expect(verificationCopy.statuses.payout[status]).toBeTruthy();
      expect(payoutStatusTones[status]).toBeTruthy();
    }
    for (const status of BACKGROUND_CHECK_STATUSES) {
      expect(verificationCopy.statuses.background[status]).toBeTruthy();
      expect(backgroundStatusTones[status]).toBeTruthy();
    }
    expect(JSON.stringify({ setup: verificationCopy.setup, statuses: verificationCopy.statuses, reasons: verificationCopy.identityFailureReasons })).not.toMatch(/\b(escrow|wallet|guaranteed|hire|best|cheapest|gig|job|worker|tasker|bonus pay)\b/i);
  });
});
