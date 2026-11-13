/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes, VERIFICATION_STEP_IDS } from '@/contracts';
import { clientAccountVerification, foundingEarnedCard, foundingYoursCard, newHelperStanding } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/helperStanding.json';
import { FoundingHelperCardView, HelperStandingPanel, VerificationChecklist } from './helper-standing';

afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('the profile’s first page', () => {
  it('has a label for every verification step and state', () => {
    for (const step of VERIFICATION_STEP_IDS) expect(copy.checklist.steps[step]).toBeTruthy();
    for (const state of ['done', 'current', 'todo', 'in_review', 'locked', 'skipped'] as const) expect(copy.checklist.states[state]).toBeTruthy();
  });

  it('shows the open founding card with spots left and what’s still needed, then each step', () => {
    render(withMessages(<HelperStandingPanel standing={newHelperStanding} />));
    const card = within(screen.getByRole('region', { name: '$50.00 founding-helper gift card' }));
    expect(card.getByText('37 spots left of 100')).toBeTruthy();
    expect(card.getByRole('meter', { name: '63 of 100 founding spots taken' })).toBeTruthy();
    expect(card.getByText('1 of 5 verification steps done. Still to do: ID check, Home address, Payout setup, Background check.')).toBeTruthy();
    expect(card.getByText('Rewards never depend on reviews or ratings.')).toBeTruthy();

    const checklist = within(screen.getByRole('region', { name: 'Your verification' }));
    expect(checklist.getByText('1 of 5 done')).toBeTruthy();
    // In review: a link to check on it; locked steps have none.
    expect(checklist.getByRole('link', { name: 'Check status: ID check' }).getAttribute('href')).toBe(routes.app.helperOnboarding('identity'));
    expect(checklist.queryByRole('link', { name: /Home address/ })).toBeNull();
  });

  it('names the founding number and the deadline, or points to the gift card on its way', () => {
    render(withMessages(<FoundingHelperCardView card={foundingYoursCard} />));
    expect(screen.getByRole('heading', { name: "You're founding helper #12" })).toBeTruthy();
    expect(screen.getByText(/by Sat, Jan 2/)).toBeTruthy();
    cleanup();
    render(withMessages(<FoundingHelperCardView card={foundingEarnedCard} />));
    expect(screen.getByRole('link', { name: 'Rewards' }).getAttribute('href')).toBe(routes.app.rewards());
  });

  it('sends a client to their ID check page, and back to the account', () => {
    render(withMessages(<VerificationChecklist steps={clientAccountVerification.steps} role="client" />));
    expect(screen.getByRole('link', { name: 'Start: ID check' }).getAttribute('href')).toBe(routes.app.verifyIdentity(routes.app.account()));
    expect(screen.queryByRole('link', { name: /Phone/ })).toBeNull();
  });
});
