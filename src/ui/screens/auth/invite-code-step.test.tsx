/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_CHECK_STAND_IN_TOKEN, routes, type ActionResult, type SignInHandlers } from '@/contracts';
import { botCheckResults, fakeSignInHandlers, signInEmailStep, signInInviteStep, signInInviteStepPrefilled, signInProfileStep, signInResults, standInBotCheck } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { EmailStep } from './email-step';
import { InviteCodeStep } from './invite-code-step';
import { ProfileStep } from './profile-step';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const renderUi = (ui: ReactElement) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{ui}</NextIntlClientProvider>);
const handlers = (overrides: Partial<SignInHandlers> = {}): SignInHandlers => ({ ...fakeSignInHandlers, ...overrides });
const resolved = (result: ActionResult) => vi.fn(async () => result);

describe('the invite step (private beta)', () => {
  it('says the market is invite-only, fills in a code from a link, and sends it', async () => {
    const onRedeemInvite = resolved(signInResults.inviteRedeemed);
    renderUi(<InviteCodeStep data={signInInviteStepPrefilled} handlers={handlers({ onRedeemInvite })} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Enter your invite code' })).toBeTruthy();
    expect(screen.getByText(/invite-only in Austin for now/)).toBeTruthy();
    expect((screen.getByLabelText('Invite code') as HTMLInputElement).value).toBe('K7QPM4XD');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onRedeemInvite).toHaveBeenCalledWith({ inviteCode: 'K7QPM4XD' }));
  });

  it('shows why a code was turned down, on the field', async () => {
    renderUi(<InviteCodeStep data={signInInviteStep} handlers={handlers({ onRedeemInvite: resolved(signInResults.inviteExpired) })} />);
    await userEvent.type(screen.getByLabelText('Invite code'), 'k7qp-m4xd');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/This invite can't be used anymore/)).toBeTruthy();
  });

  it('asks for a code before sending, and offers the waitlist and another email', async () => {
    const onRedeemInvite = resolved(signInResults.inviteRedeemed);
    const onSignOut = resolved({ ok: true, code: 'updated' });
    renderUi(<InviteCodeStep data={signInInviteStep} handlers={handlers({ onRedeemInvite, onSignOut })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter your invite code.')).toBeTruthy();
    expect(onRedeemInvite).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe(routes.waitlist({ from: 'beta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});

describe('the bot check on sign-in and sign-up', () => {
  it('sends the stand-in answer with the email, and nothing when no check is set up', async () => {
    const onRequestEmailCode = resolved(signInResults.codeSent);
    renderUi(<EmailStep data={{ ...signInEmailStep, botCheck: standInBotCheck }} handlers={handlers({ onRequestEmailCode })} />);
    await userEvent.type(screen.getByLabelText('Email'), 'maya@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onRequestEmailCode).toHaveBeenCalledWith({ email: 'maya@example.test', botCheck: BOT_CHECK_STAND_IN_TOKEN }));
    cleanup();

    const withoutCheck = resolved(signInResults.codeSent);
    renderUi(<EmailStep data={signInEmailStep} handlers={handlers({ onRequestEmailCode: withoutCheck })} />);
    await userEvent.type(screen.getByLabelText('Email'), 'maya@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(withoutCheck).toHaveBeenCalledWith({ email: 'maya@example.test' }));
  });

  it('says so when the check is turned down or timed out', () => {
    renderUi(<EmailStep data={{ ...signInEmailStep, botCheck: standInBotCheck }} handlers={handlers()} initialResult={botCheckResults.refused} />);
    expect(screen.getByText("We couldn't confirm you're a person. The check is running again: continue once it passes.")).toBeTruthy();
    cleanup();
    renderUi(<ProfileStep data={{ ...signInProfileStep, botCheck: standInBotCheck }} handlers={handlers()} initialResult={botCheckResults.expired} />);
    expect(screen.getByText("The security check timed out. It's running again: continue once it passes.")).toBeTruthy();
  });
});
