/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostTaskHandlers, PriceBreakdown, TaskDraftInput } from '@/contracts';
import { addressSuggestions, deskBreakdown, deskDraft, fakePostTaskHandlers, movingDraft, movingFundedBreakdown, postTaskPageData, remoteHelpDraft, uploadedTaskPhotos } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { ReviewStep } from './review-step';

afterEach(cleanup);

function show(values: TaskDraftInput = deskDraft, handlers: PostTaskHandlers = fakePostTaskHandlers) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><ReviewStep data={postTaskPageData} handlers={handlers} values={values} photos={uploadedTaskPhotos} selectedAddress={addressSuggestions[0]} /></NextIntlClientProvider>);
}

describe('ReviewStep', () => {
  it('names the category in the page’s language, not the database’s English (Spanish pass, 2026-11-21)', async () => {
    render(<NextIntlClientProvider locale="es" messages={{ ...messages, ...esMessages }}><ReviewStep data={postTaskPageData} handlers={fakePostTaskHandlers} values={deskDraft} photos={uploadedTaskPhotos} selectedAddress={addressSuggestions[0]} /></NextIntlClientProvider>);
    expect(within(screen.getByRole('region', { name: 'Todos ven' })).getByText('Armado de muebles')).toBeInTheDocument();
    expect(screen.queryByText('Furniture assembly')).not.toBeInTheDocument();
    await screen.findByRole('region', { name: 'Si reservas a este precio' });
  });

  it('requests the exact supplied budget and displays the returned poster total', async () => {
    const onQuote = vi.fn().mockResolvedValue(deskBreakdown);
    show(deskDraft, { ...fakePostTaskHandlers, onQuote });
    const breakdown = await screen.findByRole('region', { name: 'If you book at this price' });
    expect(onQuote).toHaveBeenCalledWith({ budget: deskDraft.budget, expenseAllowanceCents: 0 });
    expect(within(breakdown).getByText('$66.00')).toBeInTheDocument();
    const publicSection = screen.getByRole('region', { name: 'Everyone sees' });
    expect(within(publicSection).getByText('Mueller, Austin')).toBeInTheDocument();
    expect(within(publicSection).queryByText('1234 Example Lane')).not.toBeInTheDocument();
    const privateSection = screen.getByRole('region', { name: 'Only your booked helper sees' });
    expect(within(privateSection).getByText('1234 Example Lane')).toBeInTheDocument();
    expect(within(privateSection).getByText('Apt 2B')).toBeInTheDocument();
  });

  it('includes the provided expense allowance without deriving a total', async () => {
    const onQuote = vi.fn().mockResolvedValue(movingFundedBreakdown);
    show(movingDraft, { ...fakePostTaskHandlers, onQuote });
    await screen.findByRole('region', { name: 'If you book at this price' });
    expect(onQuote).toHaveBeenCalledWith({ budget: movingDraft.budget, expenseAllowanceCents: 2000 });
    expect(screen.getByText('Estimated 3.5 h · Cap 4 h')).toBeInTheDocument();
  });

  it('offers a retry when the breakdown fails and shows the next successful response', async () => {
    const onQuote = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(deskBreakdown);
    show(deskDraft, { ...fakePostTaskHandlers, onQuote });
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the price breakdown");
    await userEvent.click(screen.getByRole('button', { name: 'Try price breakdown again' }));
    expect(await screen.findByText('$66.00')).toBeInTheDocument();
    expect(onQuote).toHaveBeenCalledTimes(2);
  });

  it('does not show a local address for a remote draft', async () => {
    show(remoteHelpDraft, { ...fakePostTaskHandlers, onQuote: async () => deskBreakdown });
    await screen.findByRole('region', { name: 'If you book at this price' });
    expect(screen.getByText('This is a remote task. No address is shared.')).toBeInTheDocument();
    expect(screen.queryByText('1234 Example Lane')).not.toBeInTheDocument();
    expect(screen.getByText('Any time that day')).toBeInTheDocument();
  });

  it('ignores a completed request after the reviewed budget changes', async () => {
    let resolveFirst!: (value: PriceBreakdown) => void;
    const onQuote = vi.fn().mockImplementationOnce(() => new Promise<PriceBreakdown>((resolve) => { resolveFirst = resolve; })).mockResolvedValue(movingFundedBreakdown);
    const handlers = { ...fakePostTaskHandlers, onQuote };
    const view = show(deskDraft, handlers);
    await act(async () => {});
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><ReviewStep data={postTaskPageData} handlers={handlers} values={movingDraft} photos={[]} /></NextIntlClientProvider>);
    const breakdown = await screen.findByRole('region', { name: 'If you book at this price' });
    await act(async () => resolveFirst(deskBreakdown));
    expect(within(breakdown).queryByText('$66.00')).not.toBeInTheDocument();
    expect(onQuote).toHaveBeenCalledTimes(2);
  });
});
