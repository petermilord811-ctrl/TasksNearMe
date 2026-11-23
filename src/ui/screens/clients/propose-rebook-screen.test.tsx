/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ACTION_ERROR_CODES, routes, type ActionResult, type ProposeRebookHandlers } from '@/contracts';
import { deskBreakdown, fakeHandler, fakeProposeRebookHandlers, movingProposalSentHelper, proposeDeskRebookData, proposeYardRebookData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import clients from '../../../../messages/en/ui/clients.json';
import { ProposeRebookContent, type ProposeRebookPreviewState, type ProposeRebookScreenProps } from './propose-rebook-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const now = '2026-12-08T17:00:00.000Z';
function mount(props: Partial<ProposeRebookScreenProps & ProposeRebookPreviewState> = {}) {
  const handlers: ProposeRebookHandlers = { ...fakeProposeRebookHandlers, onQuote: vi.fn(async () => deskBreakdown), onPropose: vi.fn(fakeHandler<Parameters<ProposeRebookHandlers['onPropose']>[0]>({ ok: true, code: 'sent' }, 0)) };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={{ ...messages, clients }}><ProposeRebookContent data={proposeDeskRebookData} handlers={handlers} now={now} initialBreakdown={deskBreakdown} {...props} /></NextIntlClientProvider>) };
}

/** The helper's line in the earnings breakdown: the whole price since 2026-11-23 (no service fees). */
const earnings = () => screen.getByText("You'll earn").closest('div');

function chooseStart(date = '2026-12-19', time = '10:00') {
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: time } });
}

describe('propose a booking', () => {
  it('prefills the last price, keeps the start unchosen, and sends cents and market-time strings', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    expect(screen.getByRole('textbox', { name: 'Task price ($)' })).toHaveValue('60');
    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByLabelText('Start time')).toHaveValue('');
    expect(earnings()).toHaveTextContent('$60.00');
    chooseStart();
    await user.type(screen.getByRole('textbox', { name: 'Message (optional)' }), ' Happy to help again. ');
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    await waitFor(() => expect(handlers.onPropose).toHaveBeenCalledExactlyOnceWith({ date: '2026-12-19', startTime: '10:00', pricing: { type: 'fixed', priceCents: 6000 }, message: 'Happy to help again.' }));
    expect(await screen.findByText(clients.form.sent)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send proposal' })).toBeDisabled();
  });

  it('uses supplied hourly pricing and earnings without calculating an amount', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ data: { ...proposeDeskRebookData, booking: { ...proposeDeskRebookData.booking, lastPricing: movingProposalSentHelper.pricing } }, initialBreakdown: movingProposalSentHelper.breakdown });
    expect(screen.getByRole('textbox', { name: 'Hourly rate ($)' })).toHaveValue('35');
    expect(screen.getByRole('spinbutton', { name: 'Estimated hours' })).toHaveValue(3.5);
    expect(screen.getByRole('spinbutton', { name: 'Hours cap' })).toHaveValue(4);
    expect(earnings()).toHaveTextContent('$140.00');
    chooseStart();
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    await waitFor(() => expect(handlers.onPropose).toHaveBeenCalledExactlyOnceWith({ date: '2026-12-19', startTime: '10:00', pricing: movingProposalSentHelper.pricing, message: undefined }));
  });

  it('validates required dates, the supplied date range, and the supplied lead time', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    expect(screen.getByLabelText('Date')).toHaveAttribute('min', proposeDeskRebookData.limits.firstDate);
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', proposeDeskRebookData.limits.lastDate);
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveFocus());
    expect(handlers.onPropose).not.toHaveBeenCalled();
    chooseStart('2026-12-23');
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    chooseStart('2026-12-08', '13:00');
    expect(screen.getByLabelText('Start time')).toHaveAttribute('min', '14:00');
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    await waitFor(() => expect(screen.getByLabelText('Start time')).toHaveFocus());
    expect(handlers.onPropose).not.toHaveBeenCalled();
  });

  it('debounces prices and prevents sending while the quote is stale or unavailable', async () => {
    vi.useFakeTimers();
    const onQuote = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(deskBreakdown);
    mount({ handlers: { ...fakeProposeRebookHandlers, onQuote } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Task price ($)' }), { target: { value: '60.50' } });
    expect(screen.queryByText("You'll earn")).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send proposal' })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(349); });
    expect(onQuote).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onQuote).toHaveBeenCalledExactlyOnceWith({ pricing: { type: 'fixed', priceCents: 6050 } });
    expect(screen.getByText(clients.form.earningsError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update earnings' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(earnings()).toHaveTextContent('$60.00');
  });

  it('disables pending submissions, prevents duplicate sends, and follows the handler redirect', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onPropose = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount({ handlers: { ...fakeProposeRebookHandlers, onPropose } });
    chooseStart();
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    const sending = screen.getByRole('button', { name: 'Sending proposal…' });
    expect(sending).toBeDisabled(); expect(sending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Date')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Task price ($)' })).toBeDisabled();
    await user.click(sending);
    expect(onPropose).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'sent', redirectTo: routes.app.clients() }));
    expect(navigation.push).toHaveBeenCalledWith(routes.app.clients());
  });

  it('maps server field errors, focuses the first error, and preserves the general error', async () => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeProposeRebookHandlers, onPropose: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { date: ['out_of_range'], 'pricing.priceCents': ['invalid'], other: ['invalid'] } }, 0) } });
    chooseStart();
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    expect(screen.getByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveFocus());
    expect(screen.getByText(messages.feedback.error.validation_failed)).toBeInTheDocument();
  });

  it.each(ACTION_ERROR_CODES)('shows friendly feedback for %s', (code) => {
    mount({ initialResult: { ok: false, code } });
    const text = code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('handles rejected submissions as an actionable error', async () => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeProposeRebookHandlers, onPropose: vi.fn().mockRejectedValue(new Error('offline')) } });
    chooseStart();
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send proposal' })).toBeEnabled();
  });
});

describe('regular visits on a proposal', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); }); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('offers Repeat only where the task can repeat', () => {
    mount();
    expect(screen.queryByRole('radiogroup', { name: clients.form.repeat })).not.toBeInTheDocument();
  });

  it('says the schedule for the chosen start and sends the cadence', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ data: proposeYardRebookData });
    expect(screen.getByRole('radiogroup', { name: clients.form.repeat })).toBeInTheDocument();
    expect(screen.getByText(clients.form.repeatOnce)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Every 2 weeks' }));
    expect(screen.getByText(clients.form.repeatPickDate)).toBeInTheDocument();
    chooseStart('2026-12-15', '09:00');
    expect(screen.getByText(/^Every 2 weeks on Tuesday at 9:00 am\. Each visit is charged to Maya/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send proposal' }));
    await waitFor(() => expect(handlers.onPropose).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ date: '2026-12-15', startTime: '09:00', repeat: 'biweekly' })));
  });
});
