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
    show({ verification: { ...onboardingIdentityStep.verification, identity: { status: 'requires_input', failureReason } } });
    expect(screen.getByText(verificationCopy.identityFailureReasons[failureReason])).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it.each([
    ['identity', 'Start ID check', 'onStartIdentity', onboardingIdentityStep.verification],
    ['payout', 'Set up payouts', 'onStartPayout', onboardingPayoutStep.verification],
    ['background', 'Start background check', 'onStartBackgroundCheck', onboardingBackgroundNotStarted.verification],
  ] as const)('starts the %s provider flow and follows its redirect', async (track, label, handlerKey, verification) => {
    const destination = routes.app.helperOnboarding(track);
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: destination }));
    const handlers: HelperOnboardingHandlers = { ...fakeOnboardingHandlers, [handlerKey]: handler };
    show({ track, verification, handlers });
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(handler).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(push).toHaveBeenCalledWith(destination);
  });

  it('waits for the provider result, disables duplicate starts, and announces failures', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onStartIdentity = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    const { container } = show({ handlers: { ...fakeOnboardingHandlers, onStartIdentity } });
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
    show({ verification: { ...onboardingIdentityStep.verification, identity: { status: 'processing' } }, handlers: { ...fakeOnboardingHandlers, onRefreshStatus } });
    expect(screen.getByText("We're checking")).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(onRefreshStatus).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(await screen.findByText(uiMessages.feedback.success.updated)).toBeVisible();
  });

  it('shows only the heading and Under review for background consider', () => {
    const verification: VerificationSummary = { ...onboardingBackgroundNotStarted.verification, background: { status: 'consider', requiredFor: ['light-cleaning'] } };
    const { container } = show({ track: 'background', verification, bookableCategories: ['yard-cleanup'] });
    expect(container.textContent).toBe('Background checkUnder review');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('only shows background categories supplied by the app as bookable', () => {
    show({ track: 'background', verification: { ...onboardingBackgroundNotStarted.verification, background: { status: 'pending', requiredFor: ['light-cleaning'] } }, bookableCategories: ['yard-cleanup'] });
    expect(screen.getByText('Light cleaning')).toBeVisible();
    expect(screen.getByText('Yard cleanup')).toBeVisible();
    expect(screen.getByText(verificationCopy.setup.bookableCategories).parentElement).not.toHaveTextContent('Light cleaning');
  });

  it('omits the background panel when no category requires a check', () => {
    const { container } = show({ track: 'background', verification: { ...onboardingIdentityStep.verification, background: { status: 'not_required', requiredFor: [] } } });
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
    expect(container.querySelector('input, select, textarea')).toBeNull();
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
