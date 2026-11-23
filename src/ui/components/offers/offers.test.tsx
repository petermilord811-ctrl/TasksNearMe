/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFER_STATUSES, type ActionResult, type OfferView } from '@/contracts';
import { deskOfferJordan, deskOfferSamStale, deskOwnerView } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import offers from '../../../../messages/en/ui/offers.json';
import status from '../../../../messages/en/ui/status.json';
import { OfferCard } from './offer-card';
import { OfferComparison } from './offer-comparison';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
function card(offer: OfferView = deskOfferJordan) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, offers }}><OfferCard offer={offer} now={now} onAction={handler} /></NextIntlClientProvider>);
}

describe('OfferCard and OfferComparison', () => {
  it('keeps action order, canonical price, and new state without showing an address', () => {
    const { container } = card();
    // The offer is new to the poster, and Jordan is new on TasksNearMe (no reviews yet): two different labels.
    expect(screen.getByText('New offer')).toBeVisible();
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.getByText('$60.00')).toBeVisible();
    expect(screen.getByRole('link', { name: `View ${deskOfferJordan.helper.displayName}'s offer` })).toHaveAttribute('href', '/app/tasks/tsk_desk/offers/off_jordan');
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (item) => item.getAttribute('data-action-id'))).toEqual(deskOfferJordan.actions.map((action) => action.id));
    expect(container.textContent).not.toContain('1234 Example Lane');
  });

  it('renders stale Book disabled with its reason and cannot invoke it', async () => {
    handler.mockClear();
    card(deskOfferSamStale);
    const book = screen.getByRole('button', { name: 'Book helper' });
    expect(book).toBeDisabled();
    expect(book).toHaveAccessibleDescription(messages.actionReasons.awaiting_other_party);
    expect(screen.getByText('Needs re-confirmation')).toBeVisible();
    await userEvent.click(book);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes checkbox selection through without changing offer actions', async () => {
    const onToggle = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={{ ...messages, offers }}><OfferCard offer={deskOfferJordan} now={now} onAction={handler} selectable={{ selected: true, onToggle }} /></NextIntlClientProvider>);
    const checkbox = screen.getByRole('checkbox', { name: `Compare ${deskOfferJordan.helper.displayName}'s offer` });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('compares supplied totals and details in a semantic table without addresses', () => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={{ ...messages, offers }}><OfferComparison offers={deskOwnerView.offers} now={now} /></NextIntlClientProvider>);
    const table = within(screen.getByRole('table', { name: 'Compare offers' }));
    expect(table.getByText('$63.00')).toBeInTheDocument();
    expect(table.getByText('$57.75')).toBeInTheDocument();
    expect(table.getByRole('rowheader', { name: "What you'd pay" })).toBeInTheDocument();
    expect(table.getByText('Nothing listed')).toBeInTheDocument();
    expect(container.textContent).not.toContain('1234 Example Lane');
  });

  it('shows when an offer expires only while it can be booked, or when an expired one did', () => {
    const live: [OfferView, RegExp][] = [
      [deskOfferJordan, /^Expires /],
      [deskOfferSamStale, /^Expires /],
      [{ ...deskOfferJordan, status: 'expired', actions: [] }, /^Expired /],
    ];
    for (const [offer, line] of live) {
      const view = card(offer);
      expect(screen.getByText(line)).toBeVisible();
      view.unmount();
    }
    // Declined, withdrawn, booked, or its task canceled: the expiry means nothing any more (sweep D9 follow-up).
    const closed: OfferView[] = [
      { ...deskOfferJordan, status: 'declined', actions: [] },
      { ...deskOfferJordan, status: 'withdrawn', actions: [] },
      { ...deskOfferJordan, status: 'accepted', actions: [] },
      { ...deskOfferJordan, status: 'declined', actions: [], taskCanceled: true },
    ];
    for (const offer of closed) {
      const view = card(offer);
      expect(screen.queryByText(/^Expire[sd] /)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("badges an offer its task's cancellation closed 'Task canceled', not 'Not selected'", () => {
    card({ ...deskOfferJordan, status: 'declined', isNew: false, actions: [], taskCanceled: true });
    expect(screen.getByText('Task canceled')).toBeVisible();
    expect(screen.queryByText('Not selected')).not.toBeInTheDocument();
  });

  it('covers every offer status and uses the approved glossary', () => {
    for (const value of OFFER_STATUSES) expect(status.offer).toHaveProperty(value === 'pending' ? 'pending_poster' : value, expect.any(String));
    expect(JSON.stringify(offers)).not.toMatch(/\b(hire|bid|wages)\b/i);
  });
});
