/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, VERIFICATION_STEP_IDS } from '@/contracts';
import { clientAccountVerification, newHelperStanding, welcomeEarnedCard, welcomeQueuedCard, welcomeReadyCard, welcomeRemoteOnlyCard } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/helperStanding.json';
import { WelcomeGiftCardView, WelcomeGiftStrip } from '@/ui/components/rewards/welcome-gift-card';
import { HelperStandingPanel, VerificationChecklist } from './helper-standing';

afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('the profile’s first page', () => {
  it('has a label for every verification step and state', () => {
    for (const step of VERIFICATION_STEP_IDS) expect(copy.checklist.steps[step]).toBeTruthy();
    for (const state of ['done', 'current', 'todo', 'in_review', 'locked', 'skipped'] as const) expect(copy.checklist.states[state]).toBeTruthy();
  });

  it('shows the welcome gift card with its three checks and no spots to count, then each step', () => {
    render(withMessages(<HelperStandingPanel standing={newHelperStanding} />));
    const card = within(screen.getByRole('region', { name: 'Get verified, get $50' }));
    expect(card.getByText('1 of 3 checks done')).toBeTruthy();
    const checks = within(card.getByRole('list', { name: 'The checks that earn it' }));
    expect(checks.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['PhoneDone', 'IDIn review', 'Background checkAfter the step before']);
    expect(card.queryByText(/spots? left/)).toBeNull();
    expect(card.queryByRole('meter')).toBeNull();
    // The next check to do opens its onboarding step (the ID is in review, so the background check isn't next yet).
    expect(card.getByRole('link', { name: 'Continue verification' }).getAttribute('href')).toBe(routes.app.helperOnboarding('identity'));
    expect(card.getByText('One per person. Rewards never depend on reviews or ratings.')).toBeTruthy();

    const checklist = within(screen.getByRole('region', { name: 'Your verification' }));
    expect(checklist.getByText('1 of 5 done')).toBeTruthy();
    // In review: a link to check on it; locked steps have none.
    expect(checklist.getByRole('link', { name: 'Check status: ID check' }).getAttribute('href')).toBe(routes.app.helperCheck('identity'));
    expect(checklist.queryByRole('link', { name: /Home address/ })).toBeNull();
  });

  it('says the gift card is earned (with the founding badge), in line, or ready to pick', () => {
    render(withMessages(<WelcomeGiftCardView card={welcomeEarnedCard} />));
    expect(screen.getByRole('heading', { name: 'Your $50 gift card is yours' })).toBeTruthy();
    expect(screen.getByText('Founding helper #4')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rewards' }).getAttribute('href')).toBe(routes.app.rewards());
    cleanup();
    render(withMessages(<WelcomeGiftCardView card={welcomeQueuedCard} />));
    expect(screen.getByText(/It moves on by Tue, Dec 1/)).toBeTruthy();
    cleanup();
    render(withMessages(<WelcomeGiftCardView card={welcomeReadyCard} />));
    expect(screen.getByRole('heading', { name: 'Your $50 gift card is ready' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pick your card' }).getAttribute('href')).toBe(routes.app.rewards());
  });

  it('explains a background check that only comes with in-home services', () => {
    render(withMessages(<WelcomeGiftCardView card={welcomeRemoteOnlyCard} />));
    expect(screen.getByText('Comes with an in-home service')).toBeTruthy();
  });

  it('sums the checks up in one line under onboarding’s stepper', () => {
    render(withMessages(<WelcomeGiftStrip card={newHelperStanding.giftCard!} />));
    expect(screen.getByRole('complementary', { name: 'Welcome gift card' }).textContent).toContain('1 of 3 checks done for your $50 gift card.');
    cleanup();
    render(withMessages(<WelcomeGiftStrip card={welcomeEarnedCard} />));
    expect(screen.getByRole('link', { name: '$50 gift card earned' }).getAttribute('href')).toBe(routes.app.rewards());
  });

  it('sends a client to their ID check page, and back to the account', () => {
    render(withMessages(<VerificationChecklist steps={clientAccountVerification.steps} role="client" />));
    expect(screen.getByRole('link', { name: 'Start: ID check' }).getAttribute('href')).toBe(routes.app.verifyIdentity(routes.app.account()));
    expect(screen.queryByRole('link', { name: /Phone/ })).toBeNull();
  });
});
