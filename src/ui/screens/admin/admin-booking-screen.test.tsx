/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_BOOKING_ACTIONS, EARNINGS_STATUSES, STAFF_REFUND_REASONS, routes, type ActionResult, type AdminBookingHandlers, type AdminBookingPageData } from '@/contracts';
import { ADMIN_NOW, adminBookingDisputedData, adminBookingReadOnlyData, adminBookingRefundRequestData, adminBookingSettledData, deskExactAddress, reportedConversation } from '@/fixtures';
import { formatDateTime, formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import adminBooking from '../../../../messages/en/ui/adminBooking.json';
import { AdminBookingScreen } from './admin-booking-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const copy = adminBooking;
const note = 'Refund after reviewing the booking report.';
const reason = 'Review the reported booking problem.';

function mount(data: AdminBookingPageData = adminBookingDisputedData, overrides: Partial<AdminBookingHandlers> = {}) {
  const handlers: AdminBookingHandlers = {
    onRefund: vi.fn().mockResolvedValue({ ok: true, code: 'submitted' }),
    onDecideRefund: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }),
    onRevealAddress: vi.fn().mockResolvedValue({ ok: true, address: deskExactAddress }),
    onRevealConversation: vi.fn().mockResolvedValue({ ok: true, conversation: reportedConversation }),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={{ ...messages, adminBooking }}><AdminBookingScreen data={data} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>) };
}

async function fillRefund(user: ReturnType<typeof userEvent.setup>, amount = '16.50', body = note) {
  await user.click(screen.getByRole('button', { name: copy.actions.refund }));
  fireEvent.change(screen.getByRole('textbox', { name: copy.refund.amount }), { target: { value: amount } });
  await user.selectOptions(screen.getByRole('combobox', { name: copy.refund.reason }), 'goodwill');
  fireEvent.change(screen.getByRole('textbox', { name: copy.refund.note }), { target: { value: body } });
}

describe('AdminBookingScreen', () => {
  it('shows staff booking details and supplied money without deriving amounts', () => {
    mount(adminBookingSettledData);
    expect(screen.getByRole('heading', { level: 1, name: adminBookingSettledData.booking.title })).toBeVisible();
    expect(screen.getByText(adminBookingSettledData.poster.displayName)).toBeVisible();
    expect(screen.getByText(adminBookingSettledData.helper.displayName)).toBeVisible();
    expect(screen.getByText(formatDateTime(adminBookingSettledData.booking.start))).toBeVisible();
    const final = screen.getByRole('region', { name: copy.final });
    expect(within(final).getByText('$45.00')).toBeVisible();
    expect(within(final).getByText('$40.50')).toBeVisible();
    expect(within(final).getByText('$9.00')).toBeVisible();
    const history = screen.getByRole('list', { name: copy.refunds });
    expect(within(history).getByText('$16.50')).toBeVisible();
    expect(within(history).getByText(copy.refundReasons.dispute_settlement)).toBeVisible();
    expect(within(history).getByText(copy.refundStatuses.succeeded)).toBeVisible();
    const earnings = screen.getByRole('list', { name: copy.earnings });
    expect(within(earnings).getByText('$40.50')).toBeVisible();
    expect(within(earnings).getByText(messages.status.earnings.transferred)).toBeVisible();
    expect(within(earnings).getByText(copy.transferred.replace('{at}', formatDateTime(adminBookingSettledData.money.earnings[0]!.transferredAt!)))).toBeVisible();
    expect(screen.getByRole('link', { name: adminBookingSettledData.cases[0]!.subject })).toHaveAttribute('href', routes.admin.case(adminBookingSettledData.cases[0]!.id));
  });

  it('renders actions in the supplied order and no controls for a read-only viewer', () => {
    const view = mount({ ...adminBookingDisputedData, actions: ['reveal_conversation', 'refund', 'reveal_address'] });
    expect(within(screen.getByRole('group', { name: copy.actionsLabel })).getAllByRole('button').map((button) => button.textContent)).toEqual([copy.actions.reveal_conversation, copy.actions.refund, copy.actions.reveal_address]);
    view.unmount(); mount(adminBookingReadOnlyData);
    expect(screen.queryByRole('group', { name: copy.actionsLabel })).not.toBeInTheDocument();
    expect(screen.getByText(copy.readOnly)).toBeVisible();
    expect(screen.queryByText(deskExactAddress.line1)).not.toBeInTheDocument();
  });

  it('has copy for every action, refund reason and earnings status', () => {
    for (const action of ADMIN_BOOKING_ACTIONS) expect(copy.actions[action]).toBeTruthy();
    for (const value of STAFF_REFUND_REASONS) expect(copy.refund.reasons[value]).toBeTruthy();
    for (const status of EARNINGS_STATUSES) expect(messages.status.earnings[status]).toBeTruthy();
  });

  it('keeps the address hidden until a ten-character reason is accepted, then uses the exact address panel', async () => {
    const user = userEvent.setup(); const { handlers } = mount();
    expect(screen.queryByText(deskExactAddress.line1)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.actions.reveal_address }));
    const dialog = screen.getByRole('dialog', { name: copy.actions.reveal_address });
    expect(dialog).toHaveAccessibleDescription(copy.loggedHint);
    const reasonInput = screen.getByRole('textbox', { name: messages.adminCase.conversation.reason });
    fireEvent.change(reasonInput, { target: { value: '123456789' } });
    await user.click(screen.getByRole('button', { name: messages.adminCase.conversation.submit }));
    expect(await screen.findByText(messages.adminCase.conversation.reasonRequired)).toBeVisible();
    expect(handlers.onRevealAddress).not.toHaveBeenCalled();
    expect(screen.queryByText(deskExactAddress.line1)).not.toBeInTheDocument();
    fireEvent.change(reasonInput, { target: { value: `  ${reason}  ` } });
    await user.click(screen.getByRole('button', { name: messages.adminCase.conversation.submit }));
    const panel = await screen.findByRole('region', { name: messages.location.exactAddress });
    expect(within(panel).getByText(deskExactAddress.line1).closest('address')).not.toBeNull();
    expect(within(panel).getByRole('link', { name: new RegExp(messages.location.openMaps) })).toHaveAttribute('href', routes.external.googleMapsSearch(deskExactAddress));
    expect(handlers.onRevealAddress).toHaveBeenCalledWith({ reason });
    await waitFor(() => expect(panel.parentElement).toHaveFocus());
    expect(screen.getByText(copy.accessLogged)).toBeVisible();
  });

  it.each(['validation_failed', 'not_allowed', 'unknown'] as const)('keeps the address hidden on %s and preserves the access reason', async (code) => {
    const user = userEvent.setup();
    mount(undefined, { onRevealAddress: vi.fn().mockResolvedValue({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { reason: ['too_short'] } } : {}) }) });
    await user.click(screen.getByRole('button', { name: copy.actions.reveal_address }));
    const input = screen.getByRole('textbox', { name: messages.adminCase.conversation.reason });
    fireEvent.change(input, { target: { value: reason } });
    await user.click(screen.getByRole('button', { name: messages.adminCase.conversation.submit }));
    const expected = messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] ?? messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
    expect(input).toHaveValue(reason);
    expect(screen.queryByText(deskExactAddress.line1)).not.toBeInTheDocument();
  });

  it('opens the conversation only after logged access', async () => {
    const user = userEvent.setup(); const { handlers } = mount();
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.actions.reveal_conversation }));
    fireEvent.change(screen.getByRole('textbox', { name: messages.adminCase.conversation.reason }), { target: { value: reason } });
    await user.click(screen.getByRole('button', { name: messages.adminCase.conversation.submit }));
    expect(await screen.findByText(reportedConversation.messages[1]!.body)).toBeVisible();
    expect(handlers.onRevealConversation).toHaveBeenCalledWith({ reason });
  });

  it('sends refund cents and a trimmed note, then refreshes and follows the returned route', async () => {
    const user = userEvent.setup(); const destination = routes.admin.booking(adminBookingDisputedData.booking.id);
    const { handlers } = mount(undefined, { onRefund: vi.fn().mockResolvedValue({ ok: true, code: 'submitted', redirectTo: destination }) });
    await fillRefund(user, '16.50', `  ${note}  `);
    expect(screen.getByRole('alertdialog', { name: copy.refund.title })).toBeVisible();
    expect(screen.getByText(copy.refund.limit.replace('{amount}', '$100.00'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.refund.submit }));
    await waitFor(() => expect(handlers.onRefund).toHaveBeenCalledWith({ amountCents: 1650, reason: 'goodwill', note }));
    expect(await screen.findByText(copy.refund.submitted)).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce(); expect(navigation.push).toHaveBeenCalledWith(destination);
  });

  it.each([true, false])('focuses the refund dialog, traps keyboard focus and restores its trigger (refund details: %s)', async (hasRefund) => {
    const user = userEvent.setup();
    mount(hasRefund ? adminBookingDisputedData : { ...adminBookingDisputedData, refund: undefined });
    const trigger = screen.getByRole('button', { name: copy.actions.refund });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: copy.refund.title });
    const cancel = within(dialog).getByRole('button', { name: copy.refund.cancel });
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(cancel);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('blocks amounts above the supplied maximum and requires a note of ten characters', async () => {
    const user = userEvent.setup(); const { handlers } = mount();
    await fillRefund(user, '66.01', '123456789');
    expect(screen.getByRole('button', { name: copy.refund.submit })).toBeDisabled();
    expect(screen.getByText(copy.refund.amountTooHigh.replace('{amount}', formatMoney(adminBookingDisputedData.refund!.maxCents)))).toBeVisible();
    fireEvent.submit(screen.getByRole('form', { name: copy.refund.title }));
    expect(handlers.onRefund).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: copy.refund.amount }), { target: { value: '66.00' } });
    await user.click(screen.getByRole('button', { name: copy.refund.submit }));
    expect(await screen.findByText(copy.refund.noteTooShort)).toBeVisible();
    expect(handlers.onRefund).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: copy.refund.note }), { target: { value: '1234567890' } });
    await user.click(screen.getByRole('button', { name: copy.refund.submit }));
    await waitFor(() => expect(handlers.onRefund).toHaveBeenCalledWith({ amountCents: 6600, reason: 'goodwill', note: '1234567890' }));
  });

  it.each(['0', '-1', '1.234', 'abc'])('rejects invalid amount %s without sending a refund', async (amount) => {
    const user = userEvent.setup(); const { handlers } = mount();
    await fillRefund(user, amount);
    await user.click(screen.getByRole('button', { name: copy.refund.submit }));
    expect(await screen.findByText(copy.refund.amountInvalid)).toBeVisible();
    expect(handlers.onRefund).not.toHaveBeenCalled();
  });

  it('locks a pending refund against duplicate submits and dismissal, and preserves the draft on failure', async () => {
    const user = userEvent.setup(); let finish!: (result: ActionResult) => void;
    const onRefund = vi.fn<AdminBookingHandlers['onRefund']>().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mount(undefined, { onRefund }); await fillRefund(user);
    await user.click(screen.getByRole('button', { name: copy.refund.submit }));
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: copy.refund.amount })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.refund.submitting })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.refund.cancel })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form')); await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeVisible(); expect(onRefund).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: false, code: 'unknown' }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('textbox', { name: copy.refund.note })).toHaveValue(note);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(['validation_failed', 'not_allowed', 'rate_limited', 'unknown'] as const)('shows friendly %s refund feedback and preserves the form', async (code) => {
    const user = userEvent.setup();
    mount(undefined, { onRefund: vi.fn().mockResolvedValue({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { amountCents: ['out_of_range'] } } : {}) }) });
    await fillRefund(user); await user.click(screen.getByRole('button', { name: copy.refund.submit }));
    const expected = code === 'not_allowed' ? copy.refund.notAllowed : messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] ?? messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
    if (code === 'validation_failed') expect(await screen.findByText(copy.refund.amountTooHigh.replace('{amount}', '$66.00'))).toBeVisible();
    expect(screen.getByRole('textbox', { name: copy.refund.amount })).toHaveValue('16.50');
    expect(screen.getByRole('textbox', { name: copy.refund.note })).toHaveValue(note);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('lists refund requests, and an approver approves one with a note (focus back on the button)', async () => {
    const user = userEvent.setup();
    const onDecideRefund = vi.fn().mockResolvedValue({ ok: true, code: 'updated' });
    mount(adminBookingRefundRequestData, { onDecideRefund });
    const requests = within(screen.getByRole('region', { name: copy.requests.title }));
    expect(requests.getByText('Waiting for approval')).toBeVisible();
    expect(requests.getByText('Declined')).toBeVisible();
    const approve = requests.getByRole('button', { name: 'Approve the $120.00 refund' });
    await user.click(approve);
    const dialog = screen.getByRole('alertdialog', { name: 'Approve a $120.00 refund' });
    await user.click(within(dialog).getByRole('button', { name: copy.requests.dialog.confirmApprove }));
    expect(await within(dialog).findByText(copy.requests.dialog.noteTooShort)).toBeVisible();
    await user.type(within(dialog).getByRole('textbox', { name: copy.requests.dialog.note }), 'Checked the timeline: the helper left early.');
    await user.click(within(dialog).getByRole('button', { name: copy.requests.dialog.confirmApprove }));
    await waitFor(() => expect(onDecideRefund).toHaveBeenCalledWith({ requestId: 'rrq_moving', decision: 'approve', note: 'Checked the timeline: the helper left early.' }));
    await waitFor(() => expect(approve).toHaveFocus());
  });

  it('asks for approval above the limit, up to what is left of the charge', async () => {
    const user = userEvent.setup();
    const onRefund = vi.fn().mockResolvedValue({ ok: true, code: 'sent' });
    mount(adminBookingRefundRequestData, { onRefund });
    await user.click(screen.getByRole('button', { name: copy.actions.refund }));
    const dialog = screen.getByRole('alertdialog');
    await user.type(within(dialog).getByLabelText(copy.refund.amount), '120');
    expect(within(dialog).getByRole('button', { name: copy.refund.askApproval })).toBeVisible();
    expect(within(dialog).getByText(/Above your \$100\.00 limit/)).toBeVisible();
    await user.selectOptions(within(dialog).getByLabelText(copy.refund.reason), 'goodwill');
    await user.type(within(dialog).getByLabelText(copy.refund.note), 'The helper left two hours early.');
    await user.click(within(dialog).getByRole('button', { name: copy.refund.askApproval }));
    await waitFor(() => expect(onRefund).toHaveBeenCalledWith({ amountCents: 12000, reason: 'goodwill', note: 'The helper left two hours early.' }));
    // The dialog closes and the page says where it went.
    expect(await screen.findByText(copy.refund.sent)).toBeVisible();
  });
});

