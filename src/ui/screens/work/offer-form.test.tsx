/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ACTION_ERROR_CODES, routes, type ActionResult, type HelperWorkHandlers, type OfferInput } from '@/contracts';
import { deskBreakdown, fakeHandler, fakeHelperWorkHandlers, helperDeskWithOffer, helperMovingHourly } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { OfferForm, type OfferFormProps } from './offer-form';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const desk = { ...helperDeskWithOffer, myOffer: undefined };
function mount(props: Partial<OfferFormProps> = {}) {
  const handlers: HelperWorkHandlers = { ...fakeHelperWorkHandlers, onQuote: vi.fn(async () => deskBreakdown), onSubmitOffer: vi.fn(fakeHandler<OfferInput>({ ok: true, code: 'sent' }, 0)) };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><OfferForm data={desk} handlers={handlers} {...props} /></NextIntlClientProvider>) };
}

describe('helper offer form', () => {
  it('limits the select to supplied start times and rejects a tampered start', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const start = screen.getByRole('combobox', { name: 'Proposed start' });
    expect(Array.from((start as HTMLSelectElement).options).map((option) => option.value)).toEqual(['', ...desk.offerRules.startTimes]);
    expect(screen.queryByRole('option', { name: '9:00 am' })).not.toBeInTheDocument();
    fireEvent.change(start, { target: { value: '09:00' } });
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(handlers.onSubmitOffer).not.toHaveBeenCalled();
    expect(await screen.findByText(messages.forms.fieldErrors.required)).toBeInTheDocument();
  });

  it('validates the desk minimum and focuses the price', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const price = screen.getByRole('textbox', { name: 'Task price ($)' });
    await user.clear(price); await user.type(price, '$20');
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    await waitFor(() => expect(price).toHaveFocus());
    expect(handlers.onSubmitOffer).not.toHaveBeenCalled();
  });

  it('sends contract input with integer cents, selected start and bring chips', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Proposed start' }), '10:30');
    await user.type(screen.getByRole('textbox', { name: 'Message to the client' }), 'I can help.');
    await user.type(screen.getByRole('textbox', { name: "What you'll bring" }), 'Drill{Enter}');
    expect(handlers.onSubmitOffer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    await waitFor(() => expect(handlers.onSubmitOffer).toHaveBeenCalledExactlyOnceWith({ pricing: { type: 'fixed', priceCents: 6000 }, startTime: '10:30', message: 'I can help.', brings: ['Drill'] }));
    expect(await screen.findByText(messages.feedback.success.sent)).toBeInTheDocument();
  });

  it('debounces pricing requests and displays the supplied $54.00 earnings', async () => {
    vi.useFakeTimers();
    const { handlers } = mount();
    const price = screen.getByRole('textbox', { name: 'Task price ($)' });
    fireEvent.change(price, { target: { value: '$50' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    fireEvent.change(price, { target: { value: '$60' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(349); });
    expect(handlers.onQuote).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(handlers.onQuote).toHaveBeenCalledExactlyOnceWith({ pricing: { type: 'fixed', priceCents: 6000 } });
    expect(screen.getByText('$54.00')).toBeInTheDocument();
  });

  it('ignores late earnings responses after the price changes and retries failures', async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: typeof deskBreakdown) => void;
    const onQuote = vi.fn().mockImplementationOnce(() => new Promise<typeof deskBreakdown>((resolve) => { resolveFirst = resolve; })).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(deskBreakdown);
    mount({ handlers: { ...fakeHelperWorkHandlers, onQuote } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    fireEvent.change(screen.getByRole('textbox', { name: 'Task price ($)' }), { target: { value: '70' } });
    await act(async () => resolveFirst(deskBreakdown));
    expect(screen.queryByText('$54.00')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(screen.getByText(messages.helperTask.form.earningsError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(screen.getByText('$54.00')).toBeInTheDocument();
  });

  it('uses half-hour steps and the supplied hourly schema', async () => {
    const user = userEvent.setup();
    const onSubmitOffer = vi.fn(fakeHandler<OfferInput>({ ok: true, code: 'sent' }, 0));
    mount({ data: helperMovingHourly, handlers: { ...fakeHelperWorkHandlers, onSubmitOffer } });
    const estimate = screen.getByRole('spinbutton', { name: 'Estimated hours' });
    const cap = screen.getByRole('spinbutton', { name: 'Hours cap' });
    expect(estimate).toHaveAttribute('step', '0.5'); expect(cap).toHaveAttribute('step', '0.5');
    fireEvent.change(cap, { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    expect(onSubmitOffer).not.toHaveBeenCalled();
    fireEvent.change(cap, { target: { value: '4' } });
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    await waitFor(() => expect(onSubmitOffer).toHaveBeenCalledExactlyOnceWith(helperMovingHourly.offerDefaults));
  });

  it('caps bring chips at ten, removes them and counts the message', async () => {
    const user = userEvent.setup();
    mount({ data: { ...desk, offerDefaults: { ...desk.offerDefaults, brings: Array.from({ length: 10 }, (_, i) => `Tool ${i + 1}`) } } });
    expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove Tool 1' }));
    expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled();
    await user.type(screen.getByRole('textbox', { name: 'Message to the client' }), 'Ready');
    expect(screen.getByText('5 of 500 characters')).toBeInTheDocument();
  });

  it('prevents duplicate submits while pending and follows redirects', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onSubmitOffer = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount({ handlers: { ...fakeHelperWorkHandlers, onSubmitOffer } });
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    const pending = screen.getByRole('button', { name: /Sending/ });
    expect(pending).toBeDisabled(); expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: 'Task price ($)' })).toBeDisabled();
    await user.click(pending);
    expect(onSubmitOffer).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'sent', redirectTo: routes.app.offers() }));
    expect(navigation.push).toHaveBeenCalledWith(routes.app.offers());
  });

  it('maps dotted server errors and keeps an error summary for unknown fields', async () => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeHelperWorkHandlers, onSubmitOffer: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { 'pricing.priceCents': ['out_of_range'], unexpected: ['invalid'] } }, 0) } });
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Task price ($)' })).toHaveFocus());
    expect(screen.getByText(messages.feedback.error.validation_failed)).toBeInTheDocument();
  });

  it.each(ACTION_ERROR_CODES)('shows friendly feedback for %s', (code) => {
    mount({ initialResult: { ok: false, code } });
    const text = code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] : messages.feedback.error[code];
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('focuses bring errors even when the ten-item limit is reached', async () => {
    mount({ data: { ...desk, offerDefaults: { ...desk.offerDefaults, brings: Array.from({ length: 10 }, (_, i) => `Tool ${i + 1}`) } }, initialResult: { ok: false, code: 'validation_failed', fieldErrors: { 'brings.0': ['invalid'] } } });
    await waitFor(() => expect(screen.getByRole('textbox', { name: "What you'll bring" })).toHaveFocus());
    expect(screen.getByText(messages.forms.fieldErrors.invalid)).toBeInTheDocument();
  });

  it('handles rejected submissions as a retryable error', async () => {
    const user = userEvent.setup();
    mount({ handlers: { ...fakeHelperWorkHandlers, onSubmitOffer: vi.fn().mockRejectedValue(new Error('offline')) } });
    await user.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send offer' })).toBeEnabled();
  });
});
