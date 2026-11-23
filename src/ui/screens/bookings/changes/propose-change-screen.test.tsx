/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type ChangeQuoteResult, type ProposeChangeHandlers, type ProposeChangeInput, type ProposeChangePageData } from '@/contracts';
import { deskChairChangeProposerData, deskChairQuote, deskProposeChangeBlockedData, deskProposeChangeData, fakeHandler, movingProposeChangeData } from '@/fixtures';
import messages from '../../../../../messages/en/ui';
import { ChangeQuote } from './change-quote';
import { ProposeChangeContent } from './propose-change-screen';
import { changedInput, changeDefaults } from './propose-change-values';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const message = deskChairChangeProposerData.change.message;
const validInput: ProposeChangeInput = { priceCents: 8000, message };
const now = '2026-11-19T18:00:00.000Z';

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

function mount({
  data = deskProposeChangeData,
  initialInput = validInput,
  onQuote = vi.fn(async () => deskChairQuote),
  onPropose = vi.fn(fakeHandler<ProposeChangeInput>({ ok: true, code: 'sent' }, 0)),
}: {
  data?: ProposeChangePageData;
  initialInput?: Partial<ProposeChangeInput>;
  onQuote?: ProposeChangeHandlers['onQuote'];
  onPropose?: ProposeChangeHandlers['onPropose'];
} = {}) {
  return { onQuote, onPropose, ...render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago">
    <ProposeChangeContent data={data} handlers={{ onQuote, onPropose }} now={now} initialInput={initialInput} />
  </TimeZoneProvider></NextIntlClientProvider>) };
}

async function sendProposal() {
  await userEvent.click(screen.getByRole('button', { name: 'Send change' }));
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Send change' }));
}

describe('ProposeChangeScreen', () => {
  it('sends only edited fields in cents and UTC after confirmation', async () => {
    const { onPropose } = mount({ initialInput: {} });
    fireEvent.change(screen.getByLabelText('Task price (USD)'), { target: { value: '80.25' } });
    fireEvent.change(screen.getByLabelText('Expense allowance (USD)'), { target: { value: '20.00' } });
    fireEvent.change(screen.getByLabelText('New start (Central Time)'), { target: { value: '2026-11-21T11:30' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
    await userEvent.click(screen.getByRole('button', { name: 'Send change' }));
    expect(onPropose).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Send change' }));
    expect(onPropose).toHaveBeenCalledExactlyOnceWith({ priceCents: 8025, expenseAllowanceCents: 2000, start: '2026-11-21T17:30:00.000Z', message });
  });

  it('shows only allowed fields and sends an hourly cap without unchanged rate or scope', async () => {
    const { onPropose } = mount({ data: movingProposeChangeData, initialInput: { message } });
    expect(screen.getByLabelText('Hourly rate (USD)')).toHaveValue('35');
    expect(screen.queryByLabelText('Task price (USD)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New start (Central Time)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hours cap'), { target: { value: '5' } });
    await sendProposal();
    expect(onPropose).toHaveBeenCalledExactlyOnceWith({ hoursCap: 5, message });
  });

  it('omits disallowed edits and equivalent schedule/scope values from the payload', () => {
    expect(changedInput({ ...deskProposeChangeData, allowedTypes: ['scope', 'schedule'] }, {
      ...changeDefaults(deskProposeChangeData), priceCents: 8000, expenseAllowanceCents: 2000,
      start: '2026-11-21T10:30:00-06:00', scopeText: ` ${deskProposeChangeData.current.scopeText} `, message,
    })).toEqual({ message });
  });

  it('shows the existing change link instead of a form when blocked', () => {
    const { onQuote, onPropose } = mount({ data: deskProposeChangeBlockedData });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Propose a change');
    expect(screen.getByRole('heading', { name: 'A change is already open' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'View open change' })).toHaveAttribute('href', routes.app.bookingChange(deskProposeChangeBlockedData.booking.id, deskProposeChangeBlockedData.openChangeId!));
    expect(screen.getByRole('link', { name: 'Back to booking' })).toHaveAttribute('href', routes.app.booking(deskProposeChangeBlockedData.booking.id));
    expect(screen.queryByRole('button', { name: 'Send change' })).not.toBeInTheDocument();
    expect(onQuote).not.toHaveBeenCalled();
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('validates the market schedule window and focuses its labelled error', async () => {
    const { onQuote, onPropose } = mount({ initialInput: { start: '2026-12-18T16:00:00.000Z', message } });
    const start = screen.getByLabelText('New start (Central Time)');
    expect(start).toHaveAttribute('min', '2026-11-18T10:00');
    expect(start).toHaveAttribute('max', '2026-12-17T10:00');
    await userEvent.click(screen.getByRole('button', { name: 'Send change' }));
    expect(start).toHaveFocus();
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(start).toHaveAccessibleDescription(expect.stringContaining(messages.forms.fieldErrors.out_of_range));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onQuote).not.toHaveBeenCalled();
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('does not submit a message shorter than the contract permits', async () => {
    const { onPropose } = mount({ initialInput: { priceCents: 8000, message: 'Please' } });
    await userEvent.click(screen.getByRole('button', { name: 'Send change' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveAttribute('aria-invalid', 'true');
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('asks for an edited term before submitting an unchanged proposal', async () => {
    const { onPropose } = mount({ initialInput: { message } });
    await userEvent.click(screen.getByRole('button', { name: 'Send change' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(messages.changes.propose.noChanges);
    expect(screen.getByLabelText('Task price (USD)')).toHaveFocus();
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('allows backing out of the proposal confirmation and restores focus', async () => {
    const { onPropose } = mount();
    const send = screen.getByRole('button', { name: 'Send change' });
    await userEvent.click(send);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Keep editing' }));
    expect(send).toHaveFocus();
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('disables inputs while pending, prevents duplicate submission, and follows redirectTo', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onPropose = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    const { container } = mount({ onPropose });
    await sendProposal();
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Task price (USD)')).toBeDisabled();
    const pendingButton = screen.getByRole('button', { name: /Sending/ });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(pendingButton);
    expect(onPropose).toHaveBeenCalledTimes(1);
    const redirectTo = routes.app.bookingChange(deskProposeChangeData.booking.id, 'chg_desk_chair');
    await act(async () => finish({ ok: true, code: 'sent', redirectTo }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(messages.feedback.success.sent);
  });

  it.each(['validation_failed', 'not_allowed', 'rate_limited', 'unknown'] as const)('shows friendly inline feedback for %s without navigating', async (code) => {
    mount({ onPropose: fakeHandler({ ok: false, code }, 0) });
    await sendProposal();
    const result = await screen.findByRole('status', { name: '' });
    expect(result.textContent).not.toContain(code);
    expect(within(result).getByRole('link', { name: messages.forms.getHelp })).toHaveAttribute('href', routes.help());
    expect(screen.getByRole('button', { name: 'Send change' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('attaches server field errors and focuses the invalid input', async () => {
    mount({ onPropose: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { priceCents: ['invalid'] } }, 0) });
    await sendProposal();
    await waitFor(() => expect(screen.getByLabelText('Task price (USD)')).toHaveFocus());
    expect(screen.getByLabelText('Task price (USD)')).toHaveAccessibleDescription(expect.stringContaining(messages.forms.fieldErrors.invalid));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(messages.feedback.error.validation_failed);
  });

  it('recovers from a rejected proposal handler', async () => {
    mount({ onPropose: async () => { throw new Error('offline'); } });
    await sendProposal();
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send change' })).toBeEnabled();
  });
});

describe('proposal money preview', () => {
  it('debounces edits and uses server totals and difference without recalculating them', async () => {
    vi.useFakeTimers();
    const { onQuote } = mount();
    fireEvent.change(screen.getByLabelText('Task price (USD)'), { target: { value: '90.00' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(349); });
    expect(onQuote).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onQuote).toHaveBeenCalledExactlyOnceWith({ priceCents: 9000, message });
    expect(screen.getByText('$84.00')).toBeVisible();
    expect(screen.getByText(/You'd pay \$21.00 more/)).toBeVisible();
    // $90.00 plus a 5% hold fee, worked out on the screen: never shown, the server's numbers are.
    expect(screen.queryByText('$94.50')).not.toBeInTheDocument();
  });

  it('ignores an older response after inputs change and announces the pending state', async () => {
    vi.useFakeTimers();
    const resolve: ((value: ChangeQuoteResult) => void)[] = [];
    const onQuote = vi.fn(() => new Promise<ChangeQuoteResult>((done) => { resolve.push(done); }));
    const wrap = (input: ProposeChangeInput) => <NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago"><ChangeQuote input={input} viewerRole="poster" onQuote={onQuote} /></TimeZoneProvider></NextIntlClientProvider>;
    const { rerender, container } = render(wrap(validInput));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    rerender(wrap({ ...validInput, priceCents: 9000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(onQuote).toHaveBeenCalledTimes(2);
    await act(async () => { resolve[0](deskChairQuote); });
    expect(screen.queryByText('$84.00')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live="polite"]')).toHaveAttribute('aria-busy', 'true');
    await act(async () => { resolve[1](deskChairQuote); });
    expect(screen.getByText('$84.00')).toBeVisible();
    expect(container.querySelector('[aria-live="polite"]')).toHaveAttribute('aria-busy', 'false');
  });
});
