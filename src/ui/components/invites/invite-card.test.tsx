/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, INVITE_ACTION_IDS, INVITE_STATUSES, routes, type ActionResult, type InviteHandlers, type InviteView } from '@/contracts';
import { bookshelfInviteAcceptedPoster, bookshelfInviteCounteredPoster, bookshelfInviteSentHelper, bookshelfInviteSentPoster, fakeHandler, helperMovingHourly, movingFundedBreakdown, slotInviteSentHelper } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import inviteCard from '../../../../messages/en/ui/inviteCard.json';
import { InviteCard } from './invite-card';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const now = '2026-12-08T18:00:00.000Z';
const verification = { ok: false, code: 'requires_bank_verification', verification: { paymentId: 'pay_bookshelf_counter', kind: 'dev' } } as const;

function mount(invite = bookshelfInviteSentHelper, overrides: Partial<InviteHandlers> = {}) {
  const handlers: InviteHandlers = {
    onAccept: vi.fn(fakeHandler<unknown>({ ok: true, code: 'booked' }, 0)), onDecline: vi.fn(fakeHandler<unknown>({ ok: true, code: 'updated' }, 0)),
    onCounter: vi.fn(fakeHandler<unknown>({ ok: true, code: 'sent' }, 0)), onCancel: vi.fn(fakeHandler<unknown>({ ok: true, code: 'updated' }, 0)),
    onAcceptCounter: vi.fn(fakeHandler<unknown>({ ok: true, code: 'booked' }, 0)), onDeclineCounter: vi.fn(fakeHandler<unknown>({ ok: true, code: 'updated' }, 0)),
    onFinishVerification: vi.fn(fakeHandler<unknown>({ ok: true, code: 'booked', redirectTo: routes.app.booking('bkg_bookshelf') }, 0)), ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={{ ...messages, inviteCard }}><InviteCard invite={invite} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

async function confirm(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: label }));
}

describe('InviteCard', () => {
  it.each(['helper', 'poster'] as const)('names the original opening for the %s role', (viewerRole) => {
    mount(viewerRole === 'helper' ? slotInviteSentHelper : { ...bookshelfInviteSentPoster, slot: slotInviteSentHelper.slot });
    expect(screen.getByText(viewerRole === 'helper'
      ? 'For your Sun, Dec 13 · 1:00 pm–5:00 pm opening'
      : "For Jordan T.'s Sun, Dec 13 · 1:00 pm–5:00 pm opening")).toBeVisible();
  });

  it('renders exactly the supplied actions in order, plus the helper earnings and market time', () => {
    mount({ ...bookshelfInviteSentHelper, actions: ['counter_invite', 'accept_invite'] });
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Counter', 'Accept']);
    expect(screen.getByText('$40.50')).toBeVisible();
    expect(screen.queryByText('$49.50')).not.toBeInTheDocument();
    expect(screen.getByText('Sat, Dec 12 · 10:00 am')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Assemble a bookshelf' })).toHaveAttribute('href', routes.app.findWorkTask('tsk_bookshelf'));
  });

  it('displays both counter breakdowns, held amount and client actions', () => {
    mount(bookshelfInviteCounteredPoster);
    expect(screen.getByText('$49.50')).toBeVisible();
    expect(screen.getByText('$55.00')).toBeVisible();
    expect(screen.getByText('$49.50 held on your card')).toBeVisible();
    expect(screen.getByText(bookshelfInviteCounteredPoster.counter!.message)).toBeVisible();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Accept counter', 'Decline counter', 'Cancel']);
  });

  it('links an accepted invite to its booking without retaining a card hold', () => {
    mount(bookshelfInviteAcceptedPoster);
    expect(screen.getByText('Booked')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View booking' })).toHaveAttribute('href', routes.app.booking('bkg_bookshelf'));
    expect(screen.queryByText('$49.50 held on your card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('requires a changed price or start and a message of at least 10 characters', async () => {
    const user = userEvent.setup(); const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: 'Counter' }));
    await user.click(screen.getByRole('button', { name: 'Send counter' }));
    expect(await screen.findByText(inviteCard.counter.changeRequired)).toBeVisible();
    expect(screen.getByText(messages.forms.fieldErrors.too_short)).toBeVisible();
    expect(handlers.onCounter).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: 'Change the price' }));
    const price = screen.getByRole('textbox', { name: 'Task price' });
    await user.clear(price); await user.type(price, '50');
    await user.type(screen.getByRole('textbox', { name: 'Message to the client' }), bookshelfInviteCounteredPoster.counter!.message);
    await user.click(screen.getByRole('button', { name: 'Send counter' }));
    await waitFor(() => expect(handlers.onCounter).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_bookshelf', counter: { pricing: { type: 'fixed', priceCents: 5000 }, message: bookshelfInviteCounteredPoster.counter!.message } }));
    expect(await screen.findByText(messages.feedback.success.sent)).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('sends a start-only counter as an ISO instant in Austin time', async () => {
    const user = userEvent.setup(); const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: 'Counter' }));
    await user.click(screen.getByRole('checkbox', { name: 'Change the start' }));
    const start = screen.getByLabelText('New start · Austin time');
    await user.clear(start); await user.type(start, '2026-12-12T11:00');
    await user.type(screen.getByRole('textbox', { name: 'Message to the client' }), 'I can arrive one hour later.');
    await user.click(screen.getByRole('button', { name: 'Send counter' }));
    await waitFor(() => expect(handlers.onCounter).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_bookshelf', counter: { start: '2026-12-12T17:00:00.000Z', message: 'I can arrive one hour later.' } }));
  });

  it('confirms cancellation before releasing the hold', async () => {
    const user = userEvent.setup(); const { handlers } = mount(bookshelfInviteSentPoster);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onCancel).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Back to request' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await confirm(user, 'Cancel');
    await waitFor(() => expect(handlers.onCancel).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_bookshelf' }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('keeps hourly cents and hours separate when sending a counter', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ ...bookshelfInviteSentHelper, terms: { ...bookshelfInviteSentHelper.terms, pricing: helperMovingHourly.offerDefaults.pricing }, breakdown: movingFundedBreakdown });
    await user.click(screen.getByRole('button', { name: 'Counter' }));
    await user.click(screen.getByRole('checkbox', { name: 'Change the price' }));
    expect(screen.getByRole('textbox', { name: 'Hourly rate' })).toHaveValue('35');
    expect(screen.getByRole('spinbutton', { name: 'Estimated hours' })).toHaveValue(3.5);
    expect(screen.getByRole('spinbutton', { name: 'Maximum hours' })).toHaveValue(4);
    await user.type(screen.getByRole('textbox', { name: 'Message to the client' }), 'I can help at this hourly rate.');
    await user.click(screen.getByRole('button', { name: 'Send counter' }));
    await waitFor(() => expect(handlers.onCounter).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_bookshelf', counter: { pricing: helperMovingHourly.offerDefaults.pricing, message: 'I can help at this hourly rate.' } }));
  });

  it('locks all controls and indicates which action is pending', async () => {
    let finish!: (result: ActionResult) => void;
    const onAccept = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    const user = userEvent.setup(); mount(bookshelfInviteSentHelper, { onAccept });
    await confirm(user, 'Accept');
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    await act(async () => finish({ ok: true, code: 'booked' }));
    expect(await screen.findByText(messages.feedback.success.booked)).toBeVisible();
  });

  it('finishes bank verification for accepting a counter before redirecting', async () => {
    const user = userEvent.setup(); const { handlers } = mount(bookshelfInviteCounteredPoster, { onAcceptCounter: vi.fn().mockResolvedValue(verification) });
    await confirm(user, 'Accept counter');
    const bank = await screen.findByRole('dialog');
    expect(bank).toHaveAccessibleName(/Your bank wants to confirm/);
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(within(bank).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(handlers.onFinishVerification).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_bookshelf', paymentId: verification.verification.paymentId, outcome: 'approved' }));
    expect(navigation.push).toHaveBeenCalledWith(routes.app.booking('bkg_bookshelf'));
  });

  it('reports failed verification and restores the counter actions for retry', async () => {
    const user = userEvent.setup();
    const onFinishVerification = vi.fn(fakeHandler<Parameters<InviteHandlers['onFinishVerification']>[0]>({ ok: false, code: 'payment_declined' }, 0));
    mount(bookshelfInviteCounteredPoster, { onAcceptCounter: vi.fn().mockResolvedValue(verification), onFinishVerification });
    await confirm(user, 'Accept counter');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Fail' }));
    await waitFor(() => expect(onFinishVerification).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_bookshelf', paymentId: verification.verification.paymentId, outcome: 'failed' }));
    expect(await screen.findByText(messages.feedback.error.payment_declined)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept counter' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('shows friendly %s errors and allows retry', async (code) => {
    const user = userEvent.setup(); mount(bookshelfInviteSentHelper, { onAccept: fakeHandler({ ok: false, code }, 0) });
    await confirm(user, 'Accept');
    expect(await screen.findByText((messages.forms.actionErrors as Partial<Record<string, string>>)[code] ?? messages.feedback.error[code])).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
  });

  it('has visible copy for every invite status and action id', () => {
    for (const action of INVITE_ACTION_IDS) expect(inviteCard.actions[action]).toBeTruthy();
    for (const status of INVITE_STATUSES) {
      const invite: InviteView = { ...bookshelfInviteSentHelper, status, actions: [] };
      const view = mount(invite);
      const label = status === 'sent' ? messages.status.invite.sent_helper : messages.status.invite[status];
      expect(screen.getByText(label)).toBeVisible();
      view.unmount();
    }
  });
});
