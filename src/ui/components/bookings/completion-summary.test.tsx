/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompletionView } from '@/contracts';
import { deskCompletionView, deskWithExpensesCompletionView, movingCompletionView } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import completionMessages from '../../../../messages/en/ui/completion.json';
import { CompletionSummary } from './completion-summary';

afterEach(cleanup);

function show(completion: CompletionView, variant: 'poster' | 'helper' = 'poster') {
  return render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, completion: completionMessages }}><CompletionSummary completion={completion} variant={variant} /></NextIntlClientProvider>);
}

describe('CompletionSummary', () => {
  it('shows the submitted time in Austin, the note, and supplied work photos', () => {
    show(deskCompletionView);
    expect(screen.getByText('Sent Sat, Nov 21 · 11:48 am')).toHaveAttribute('dateTime', deskCompletionView.submittedAt);
    expect(screen.getByText(deskCompletionView.note!)).toBeInTheDocument();
    for (const photo of deskCompletionView.photos) {
      expect(screen.getByRole('img', { name: photo.alt })).toHaveAttribute('src', photo.src);
    }
    expect(screen.queryByText('Receipts')).not.toBeInTheDocument();
  });

  it('opens work photos by keyboard and restores focus after Escape', async () => {
    const user = userEvent.setup();
    show(deskCompletionView);
    const photo = deskCompletionView.photos[0]!;
    const trigger = screen.getByRole('button', { name: `View photo: ${photo.alt}` });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Photo 1 of 2' });
    expect(within(dialog).getByRole('img', { name: photo.alt })).toHaveAttribute('src', photo.src);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('shows the receipt description and amount and opens its full photo', async () => {
    const user = userEvent.setup();
    show(deskWithExpensesCompletionView);
    const receipts = screen.getByRole('list', { name: 'Receipts' });
    expect(within(receipts).getByText('Wall anchors')).toBeInTheDocument();
    expect(within(receipts).getByText('$8.00')).toBeInTheDocument();
    await user.click(within(receipts).getByRole('button', { name: 'View receipt: Hardware store receipt for $8.00' }));
    expect(screen.getByRole('dialog', { name: 'Receipt: Wall anchors' })).toBeInTheDocument();
  });

  it('shows supplied refunds only in the client variant', () => {
    show(deskWithExpensesCompletionView);
    expect(screen.getByText('Refund')).toBeInTheDocument();
    expect(screen.getByText('$12.00')).toBeInTheDocument();
    expect(screen.queryByText('Reimbursed expenses')).not.toBeInTheDocument();
    expect(screen.queryByText('$54.00')).not.toBeInTheDocument();
  });

  it('keeps helper earnings and reimbursement separate and excludes the client refund', () => {
    show(deskWithExpensesCompletionView, 'helper');
    const breakdown = screen.getByRole('region', { name: "What you'll earn" });
    expect(within(breakdown).getByText('$54.00')).toBeInTheDocument();
    expect(within(breakdown).getByText('$8.00')).toBeInTheDocument();
    expect(within(breakdown).getByText('Reimbursed expenses')).toBeInTheDocument();
    expect(screen.queryByText('Refund')).not.toBeInTheDocument();
    expect(screen.queryByText('$12.00')).not.toBeInTheDocument();
  });

  it('shows supplied hours against the cap with the hourly refund', () => {
    show(movingCompletionView);
    expect(screen.getByText('Hours worked: 3.5 of up to 4')).toBeInTheDocument();
    expect(screen.getByText('$19.25')).toBeInTheDocument();
    expect(screen.getByText('$35.00 × 3.5 h')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Photos of the work' })).not.toBeInTheDocument();
  });

  it('lists the checklist in its order with what the helper confirmed and left unticked', () => {
    show(deskCompletionView);
    const checklist = screen.getByRole('region', { name: 'Checklist' });
    expect(within(checklist).getByText('3 of 4 confirmed')).toBeInTheDocument();
    expect(within(checklist).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'All parts used, or spares handed back · Confirmed',
      'It stands level and stable · Confirmed',
      'Tall pieces anchored to the wall, when asked · Not ticked',
      'Packaging cleared away · Confirmed',
    ]);
  });

  it('shows no checklist for work sent before checklists', () => {
    show({ ...deskCompletionView, checklist: undefined });
    expect(screen.queryByText('Checklist')).not.toBeInTheDocument();
    expect(screen.getByText(deskCompletionView.note!)).toBeInTheDocument();
  });

  it('keeps the existing hours wording when no cap is supplied', () => {
    show({ ...movingCompletionView, hoursCap: undefined });
    expect(screen.getByText('Hours worked: 3.5 h')).toBeInTheDocument();
    expect(screen.queryByText(/of up to/)).not.toBeInTheDocument();
  });
});
