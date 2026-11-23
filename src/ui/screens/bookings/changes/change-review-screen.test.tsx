/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, CHANGE_ACTIONS, CHANGE_STATUSES, PROPOSABLE_CHANGE_TYPES, routes, type ChangeReviewHandlers, type ChangeReviewPageData, type PaymentAttemptResult } from '@/contracts';
import { deskChairChangeAppliedData, deskChairChangeCounterpartyData, deskChairChangePayData, deskChairChangeProposerData, fakeHandler, movingCapChangeData } from '@/fixtures';
import messages from '../../../../../messages/en/ui';
import changes from '../../../../../messages/en/ui/changes.json';
import { ChangeReviewScreen } from './change-review-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-11-19T18:30:00.000Z';
const success = { ok: true, code: 'paid', redirectTo: routes.app.booking('bkg_desk') } as const;
const verification = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_change_desk', kind: 'dev' } } as const;

function mount(data: ChangeReviewPageData = deskChairChangePayData, overrides: Partial<ChangeReviewHandlers> = {}) {
  const handlers: ChangeReviewHandlers = {
    onAccept: vi.fn(fakeHandler<Parameters<ChangeReviewHandlers['onAccept']>[0]>(success, 0)),
    onPayDifference: vi.fn(fakeHandler<Parameters<ChangeReviewHandlers['onPayDifference']>[0]>(success, 0)),
    onFinishVerification: vi.fn(fakeHandler<Parameters<ChangeReviewHandlers['onFinishVerification']>[0]>(success, 0)),
    onDecline: vi.fn(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onWithdraw: vi.fn(fakeHandler({ ok: true, code: 'updated' }, 0)),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={{ ...messages, changes }}><ChangeReviewScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

async function confirmAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name }));
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name }));
}

describe('ChangeReviewScreen', () => {
  it('names the person who is being asked to respond', () => {
    mount(deskChairChangeProposerData);
    expect(screen.getByText(`Waiting for ${deskChairChangeProposerData.booking.helperDisplayName}`)).toBeVisible();
  });

  it('says who has until the deadline, and to do what (journeys on a phone)', () => {
    // The proposer waits on the other person.
    mount(deskChairChangeProposerData);
    expect(screen.getByText(`${deskChairChangeProposerData.booking.helperDisplayName} can respond until`)).toBeVisible();
    expect(screen.queryByText('Respond by')).not.toBeInTheDocument();
    cleanup();
    // The person asked responds.
    mount(movingCapChangeData);
    expect(screen.getByText('Respond by')).toBeVisible();
    cleanup();
    // Accepted: the poster pays the difference, and the helper waits on them.
    mount(deskChairChangePayData);
    expect(screen.getByText('Finish payment by')).toBeVisible();
    cleanup();
    mount({ ...deskChairChangePayData, booking: { ...deskChairChangePayData.booking, viewerRole: 'helper' } });
    expect(screen.getByText(`${deskChairChangePayData.booking.posterDisplayName} can finish payment until`)).toBeVisible();
  });

  it('shows the supplied terms, marks changed lines, and renders only the received actions in order', () => {
    mount(deskChairChangeCounterpartyData);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Change to Assemble a desk');
    expect(screen.getByText(`${deskChairChangeCounterpartyData.booking.posterDisplayName} proposed a change`)).toBeVisible();
    expect(screen.getByText(deskChairChangeCounterpartyData.change.message)).toBeVisible();
    expect(screen.getAllByText('Changed')).toHaveLength(4);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Accept change', 'Decline change']);
    expect(screen.getByRole('link', { name: 'Back to booking' })).toHaveAttribute('href', routes.app.booking('bkg_desk'));
  });

  it('shows no change actions after application', () => {
    mount(deskChairChangeAppliedData);
    expect(screen.getByText('Applied')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(changes.review.newTermsApply)).toBeVisible();
  });

  it('confirms and accepts helper terms without sending a payment', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(deskChairChangeCounterpartyData);
    await confirmAction(user, 'Accept change');
    await waitFor(() => expect(handlers.onAccept).toHaveBeenCalledExactlyOnceWith({}));
    expect(navigation.push).toHaveBeenCalledWith(success.redirectTo);
  });

  it('sends the chosen card on client acceptance, with the server-provided cap and amount unchanged', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(movingCapChangeData);
    expect(screen.getByRole('radio', { name: /Visa.*1881/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Mastercard.*4444/ }));
    await confirmAction(user, 'Accept change');
    await waitFor(() => expect(handlers.onAccept).toHaveBeenCalledExactlyOnceWith({ payment: { kind: 'saved', methodId: 'pm_maya_mc' } }));
  });

  it('keeps payment-required actions visible and disabled if cards have not been supplied', () => {
    const { handlers } = mount({ ...movingCapChangeData, payment: undefined });
    expect(screen.getByRole('button', { name: 'Accept change' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline change' })).toBeEnabled();
    expect(screen.getByText(changes.review.paymentMissing)).toBeVisible();
    expect(handlers.onAccept).not.toHaveBeenCalled();
  });

  it('withdraws only after confirmation and routes success when supplied', async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn(fakeHandler({ ok: true, code: 'updated', redirectTo: success.redirectTo }, 0));
    const { handlers } = mount(deskChairChangeProposerData, { onWithdraw });
    await user.click(screen.getByRole('button', { name: 'Withdraw change' }));
    expect(onWithdraw).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Back to review' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Withdraw change' })).toHaveFocus());
    expect(onWithdraw).not.toHaveBeenCalled();
    await confirmAction(user, 'Withdraw change');
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledExactlyOnceWith());
    expect(handlers.onDecline).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith(success.redirectTo);
  });

  it('declines with no payment input', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(movingCapChangeData);
    await confirmAction(user, 'Decline change');
    await waitFor(() => expect(handlers.onDecline).toHaveBeenCalledExactlyOnceWith());
    expect(handlers.onAccept).not.toHaveBeenCalled();
  });

  it('states the exact client payment in the acceptance confirmation', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(movingCapChangeData);
    await user.click(screen.getByRole('button', { name: 'Accept change' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleDescription('Accept these proposed terms and pay $36.75 with the selected card? The new terms apply after payment goes through.');
    expect(handlers.onAccept).not.toHaveBeenCalled();
  });

  it('labels and focuses a server-rejected payment choice', async () => {
    const user = userEvent.setup();
    mount(deskChairChangePayData, { onPayDifference: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { 'payment.methodId': ['invalid'] } }, 0) });
    await confirmAction(user, 'Pay $21.00');
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Visa.*1881/ })).toHaveFocus());
    expect(screen.getByRole('radiogroup', { name: 'Payment method' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows bank verification, sends its payment id and outcome, and waits for payment before redirecting', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(deskChairChangePayData, { onPayDifference: vi.fn().mockResolvedValue(verification) });
    await confirmAction(user, 'Pay $21.00');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(/Your bank wants to confirm/);
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(handlers.onFinishVerification).toHaveBeenCalledExactlyOnceWith({ paymentId: 'pay_change_desk', outcome: 'approved' }));
    expect(navigation.push).toHaveBeenCalledWith(success.redirectTo);
  });

  it('keeps the selected card and restores payment focus after failed bank verification', async () => {
    const user = userEvent.setup();
    mount(deskChairChangePayData, {
      onPayDifference: vi.fn().mockResolvedValue(verification),
      onFinishVerification: fakeHandler({ ok: false, code: 'payment_declined' }, 0),
    });
    await confirmAction(user, 'Pay $21.00');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('region', { name: 'Payment' })).toHaveFocus());
    expect(screen.getByRole('radio', { name: /Visa.*1881/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Pay $21.00' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('locks all controls during payment and keeps a completed payment locked', async () => {
    const user = userEvent.setup();
    let finish!: (result: PaymentAttemptResult) => void;
    const onPayDifference = vi.fn(() => new Promise<PaymentAttemptResult>((resolve) => { finish = resolve; }));
    mount(deskChairChangePayData, { onPayDifference });
    await confirmAction(user, 'Pay $21.00');
    const pay = screen.getByRole('button', { name: 'Pay $21.00' });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAttribute('aria-busy', 'true');
    screen.getAllByRole('radio').forEach((radio) => expect(radio).toBeDisabled());
    await user.click(pay);
    expect(onPayDifference).toHaveBeenCalledTimes(1);
    await act(async () => finish(success));
    expect(pay).toBeDisabled();
    expect(navigation.push).toHaveBeenCalledWith(success.redirectTo);
  });

  it.each(ACTION_ERROR_CODES)('announces friendly feedback for %s', async (code) => {
    const user = userEvent.setup();
    mount(deskChairChangePayData, { onPayDifference: fakeHandler({ ok: false, code }, 0) });
    await confirmAction(user, 'Pay $21.00');
    const copy = code in changes.review.errors
      ? changes.review.errors[code as keyof typeof changes.review.errors]
      : code in messages.forms.actionErrors
        ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors]
        : messages.feedback.error[code];
    const feedback = await screen.findByText(copy);
    expect(feedback.closest('[aria-live]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Pay $21.00' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('offers a working reload for changed terms and preserves the selected card', async () => {
    const user = userEvent.setup();
    mount(deskChairChangePayData, { onPayDifference: fakeHandler({ ok: false, code: 'version_conflict' }, 0) });
    await confirmAction(user, 'Pay $21.00');
    await user.click(await screen.findByRole('button', { name: 'Reload change' }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('radio', { name: /Visa.*1881/ })).toBeChecked();
  });

  it('maps rejected requests to friendly unknown feedback', async () => {
    const user = userEvent.setup();
    mount(deskChairChangePayData, { onPayDifference: vi.fn().mockRejectedValue(new Error('offline')) });
    await confirmAction(user, 'Pay $21.00');
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
  });

  it('has copy for every change type, status, and action', () => {
    PROPOSABLE_CHANGE_TYPES.forEach((type) => expect(changes.review.types[type]).toBeTruthy());
    CHANGE_STATUSES.forEach((status) => expect(changes.review.statuses[status]).toBeTruthy());
    CHANGE_ACTIONS.forEach((action) => expect(changes.review.actions[action]).toBeTruthy());
  });
});
