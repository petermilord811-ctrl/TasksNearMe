/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AiAssistResult, BookingChecklist, BookingPrepView } from '@/contracts';
import { bookingChecklistResult, bookingPrepEmpty, bookingPrepPosterMade, bookingPrepPosterStale, deskChecklistPoster } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { BookingPrepCard } from './booking-prep-card';

afterEach(() => { cleanup(); window.localStorage.clear(); });

const copy = messages.bookingHub.prep;

function show(prep: BookingPrepView, onPrepare?: () => Promise<AiAssistResult<BookingChecklist>>) {
  render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages} onError={(error) => { throw error; }}>
    <BookingPrepCard bookingId="bkg_desk" role="poster" otherName="Jordan" prep={prep} {...(onPrepare ? { handlers: { onPrepare } } : {})} />
  </NextIntlClientProvider>);
}

describe('Get ready on a booking', () => {
  it('offers "Make my checklist", shows the checklist made with AI, and keeps ticks on this device', async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn(async () => bookingChecklistResult);
    show(bookingPrepEmpty, onPrepare);
    expect(screen.getByRole('heading', { level: 2, name: copy.title })).toBeVisible();
    expect(screen.getByText(copy.introPoster.replace('{name}', 'Jordan'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.make }));
    expect(onPrepare).toHaveBeenCalledExactlyOnceWith({});
    const list = await screen.findByRole('list', { name: copy.list });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(deskChecklistPoster.items.length);
    expect(list).toHaveTextContent(deskChecklistPoster.items[0]!);
    await user.click(boxes[0]!);
    expect(screen.getByText(`1 of ${deskChecklistPoster.items.length} done`)).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem('tasksnearme:prep:bkg_desk:poster') ?? '[]')).toEqual([deskChecklistPoster.items[0]]);
    // Made already: a quieter "Make a new one".
    expect(screen.getByRole('button', { name: copy.again })).toBeVisible();
  });

  it('says when the booking changed since, and why one could not be made', async () => {
    const user = userEvent.setup();
    show(bookingPrepPosterStale, async () => ({ ok: false, code: 'rate_limited' }));
    expect(screen.getByText(copy.stale)).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.again }));
    expect(await screen.findByText(copy.errors.rate_limited)).toBeVisible();
    // The old checklist stays readable.
    expect(screen.getAllByRole('checkbox')).toHaveLength(deskChecklistPoster.items.length);
  });

  it('shows a checklist without the button when there is no handler', () => {
    show(bookingPrepPosterMade);
    expect(screen.getAllByRole('checkbox')).toHaveLength(deskChecklistPoster.items.length);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
