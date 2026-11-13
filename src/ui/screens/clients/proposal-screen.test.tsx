/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, REBOOK_ACTION_IDS, REBOOK_PROPOSAL_STATUSES, routes, type PaymentAttemptResult, type ProposalHandlers, type ProposalPageData } from '@/contracts';
import { fakeHandler, proposalAcceptedData, proposalHelperData, proposalPosterData, proposalRepeatAcceptedData, proposalRepeatPosterData } from '@/fixtures';
import baseMessages from '../../../../messages/en/ui';
import proposalCopy from '../../../../messages/en/ui/proposal.json';
import { ProposalScreen } from './proposal-screen';

const messages = { ...baseMessages, proposal: proposalCopy };
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-12-08T17:00:00.000Z';
const booked = { ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_desk_again') } as const;
const verification = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_proposal_desk', kind: 'dev' } } as const;

function mount(data: ProposalPageData = proposalPosterData, overrides: Partial<ProposalHandlers> = {}) {
  const handlers: ProposalHandlers = {
    onAccept: vi.fn(fakeHandler<Parameters<ProposalHandlers['onAccept']>[0]>(booked, 0)),
    onFinishVerification: vi.fn(fakeHandler<Parameters<ProposalHandlers['onFinishVerification']>[0]>(booked, 0)),
    onDecline: vi.fn(fakeHandler({ ok: true, code: 'updated' }, 0)), onWithdraw: vi.fn(fakeHandler({ ok: true, code: 'updated' }, 0)),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><ProposalScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

const terms = () => screen.getByRole('checkbox', { name: /I agree/ });
const accept = () => screen.getByRole('button', { name: /^Accept and pay/ });
async function submit(user: ReturnType<typeof userEvent.setup>) { await user.click(terms()); await user.click(accept()); }

describe('ProposalScreen', () => {
  it('renders the client price, market time and the exact-address panel and sends the chosen payment with consent', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Jordan T. proposed a booking');
    expect(screen.getByText('Sat, Dec 19 · 10:00 am')).toBeVisible();
    expect(screen.getByRole('region', { name: messages.location.exactAddress })).toHaveTextContent('1234 Example Lane');
    expect(screen.getByRole('region', { name: 'Your total' })).toHaveTextContent('$66.00');
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    await submit(user);
    await waitFor(() => expect(handlers.onAccept).toHaveBeenCalledExactlyOnceWith({ payment: { kind: 'saved', methodId: 'pm_maya_visa' }, acceptTerms: true }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(booked.redirectTo));
    expect(accept()).toBeDisabled();
  });

  it('validates consent before payment and focuses the checkbox', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(accept());
    expect(await screen.findByText(messages.forms.fieldErrors.must_accept)).toBeVisible();
    expect(terms()).toHaveFocus();
    expect(handlers.onAccept).not.toHaveBeenCalled();
  });

  it('sends the selected development card and save choice', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('radio', { name: 'Use a new card' }));
    await user.click(screen.getByRole('radio', { name: messages.payments.testCards.insufficient_funds }));
    await user.click(screen.getByRole('checkbox', { name: 'Save this card for next time' }));
    await submit(user);
    await waitFor(() => expect(handlers.onAccept).toHaveBeenCalledWith({ payment: { kind: 'dev_card', card: 'insufficient_funds', save: true }, acceptTerms: true }));
  });

  it('renders only supplied actions, preserves their order, and never shows an exact address to a helper', () => {
    const data: ProposalPageData = { ...proposalHelperData, proposal: { ...proposalHelperData.proposal, exactAddress: proposalPosterData.proposal.exactAddress } };
    mount(data);
    const group = screen.getByRole('group', { name: 'Proposal actions' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Withdraw']);
    expect(screen.queryByRole('region', { name: messages.location.exactAddress })).not.toBeInTheDocument();
    expect(screen.queryByText('1234 Example Lane')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your earnings' })).toHaveTextContent('$54.00');
  });

  it('honors a supplied action order and absence without inventing controls', () => {
    const { rerender, handlers } = mount({ ...proposalPosterData, proposal: { ...proposalPosterData.proposal, actions: ['decline_proposal', 'accept_proposal'] } });
    expect(within(screen.getByRole('group', { name: 'Proposal actions' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['Decline', 'Accept and pay']);
    rerender(<NextIntlClientProvider locale="en" messages={messages}><ProposalScreen data={{ ...proposalPosterData, proposal: { ...proposalPosterData.proposal, actions: [] } }} handlers={handlers} now={now} /></NextIntlClientProvider>);
    expect(screen.queryByRole('group', { name: 'Proposal actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it.each(['decline_proposal', 'withdraw_proposal'] as const)('confirms %s, allows keeping the proposal, and announces success', async (action) => {
    const user = userEvent.setup();
    const { handlers } = mount(action === 'decline_proposal' ? proposalPosterData : proposalHelperData);
    const handler = action === 'decline_proposal' ? handlers.onDecline : handlers.onWithdraw;
    await user.click(screen.getByRole('button', { name: messages.actions[action] }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    expect(handler).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep proposal' }));
    expect(screen.getByRole('button', { name: messages.actions[action] })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: messages.actions[action] }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: messages.actions[action] }));
    await waitFor(() => expect(handler).toHaveBeenCalledExactlyOnceWith());
    expect(await screen.findByText(messages.proposal.success[action])).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it.each(['approved', 'failed'] as const)('opens bank verification and submits its %s outcome', async (outcome) => {
    const user = userEvent.setup();
    const result = outcome === 'approved' ? booked : { ok: false, code: 'payment_declined' } as const;
    const { handlers } = mount(proposalPosterData, { onAccept: vi.fn().mockResolvedValue(verification), onFinishVerification: vi.fn().mockResolvedValue(result) });
    const trigger = accept();
    await submit(user);
    const dialog = await screen.findByRole('dialog');
    expect(trigger).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: outcome === 'approved' ? 'Approve' : 'Fail' }));
    await waitFor(() => expect(handlers.onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: verification.verification.paymentId, outcome }));
    if (outcome === 'approved') expect(navigation.push).toHaveBeenCalledWith(booked.redirectTo);
    else expect(await screen.findByText(messages.feedback.error.payment_declined)).toBeVisible();
  });

  it('locks controls and suppresses duplicate submissions while payment is pending', async () => {
    const user = userEvent.setup();
    let finish!: (result: PaymentAttemptResult) => void;
    const onAccept = vi.fn(() => new Promise<PaymentAttemptResult>((resolve) => { finish = resolve; }));
    const { container } = mount(proposalPosterData, { onAccept });
    await user.click(terms());
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.submit(container.querySelector('form')!);
    const pending = await screen.findByRole('button', { name: 'Accepting and paying…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(terms()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    expect(onAccept).toHaveBeenCalledTimes(1);
    await act(async () => finish(booked));
  });

  it.each(ACTION_ERROR_CODES)('shows friendly, announced feedback for %s', async (code) => {
    const user = userEvent.setup();
    mount(proposalPosterData, { onAccept: fakeHandler({ ok: false, code }, 0) });
    await submit(user);
    const copy = code in messages.proposal.errors ? messages.proposal.errors[code as keyof typeof messages.proposal.errors]
      : code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    const feedback = await screen.findByText(copy);
    expect(feedback.closest('[aria-live]')).not.toBeNull();
    expect(accept()).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('maps server consent errors onto the field and focuses it', async () => {
    const user = userEvent.setup();
    mount(proposalPosterData, { onAccept: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { acceptTerms: ['must_accept'] } }, 0) });
    await submit(user);
    expect(await screen.findByText(messages.forms.fieldErrors.must_accept)).toBeVisible();
    await waitFor(() => expect(terms()).toHaveFocus());
  });

  it('handles a rejected handler without assuming success', async () => {
    const user = userEvent.setup();
    mount(proposalPosterData, { onAccept: vi.fn().mockRejectedValue(new Error('offline')) });
    await submit(user);
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('links accepted proposals to their booking and provides all status and action labels', () => {
    mount(proposalAcceptedData);
    expect(screen.getByRole('link', { name: 'View booking' })).toHaveAttribute('href', routes.app.booking(proposalAcceptedData.proposal.bookingId!));
    expect(screen.queryByRole('button', { name: 'Accept and pay' })).not.toBeInTheDocument();
    for (const status of REBOOK_PROPOSAL_STATUSES) expect(messages.proposal.status[status]).toBeTruthy();
    for (const action of REBOOK_ACTION_IDS) expect(messages.actions[action]).toBeTruthy();
  });
});

describe('a repeating proposal', () => {
  it('shows the schedule and the first dates, and keeps the card for later visits', () => {
    mount(proposalRepeatPosterData);
    expect(screen.getByText(proposalCopy.schedule)).toBeInTheDocument();
    expect(screen.getByText('Every 2 weeks on Tuesday at 9:00 am')).toBeInTheDocument();
    expect(screen.getByText(/^Visits on Tue, Dec 15 · Tue, Dec 29/)).toBeInTheDocument();
    expect(screen.getByText(proposalCopy.paymentNoteRepeat)).toBeInTheDocument();
    // No "save this card" choice: it's kept.
    expect(screen.queryByRole('checkbox', { name: /Save this card/ })).not.toBeInTheDocument();
  });

  it('links to the regular visits once accepted', () => {
    mount(proposalRepeatAcceptedData);
    expect(screen.getByRole('link', { name: proposalCopy.viewSeries })).toHaveAttribute('href', routes.app.series('srs_yard'));
  });
});
