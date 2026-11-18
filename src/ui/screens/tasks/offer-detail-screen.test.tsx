/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type OfferView } from '@/contracts';
import { deskOfferDetailData, deskOfferLee, deskOfferSamExpired, deskOfferSamStale } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import offers from '../../../../messages/en/ui/offers.json';
import { OfferDetailScreen } from './offer-detail-screen';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const now = '2026-11-17T15:00:00.000Z';
function show(offer: OfferView = deskOfferDetailData.offer, onOfferAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }))) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, offers }}><OfferDetailScreen data={{ ...deskOfferDetailData, offer }} handlers={{ onOfferAction }} now={now} /></NextIntlClientProvider>);
}

describe('OfferDetailScreen', () => {
  it('renders only the safe phone hint and explains masking', () => {
    show(deskOfferLee);
    const message = screen.getByText(/•••-•••-0134/);
    expect(message.textContent).toBe('•••-•••-0134 (hidden until booking)');
    expect(message.textContent?.replace('0134', '')).not.toMatch(/\d/);
    expect(screen.getByText('Contact details are shared after you book')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Compare with 2 other offers' })).toHaveAttribute('href', '/app/tasks/tsk_desk#compare');
  });

  it('sends the offer identity and action, then follows redirectTo', async () => {
    const redirectTo = routes.app.confirmOffer('tsk_desk', 'off_jordan');
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo }));
    show(deskOfferDetailData.offer, handler);
    await userEvent.click(screen.getByRole('button', { name: 'Book helper' }));
    expect(handler).toHaveBeenCalledExactlyOnceWith({ offerId: 'off_jordan', action: 'book_offer' });
    expect(push).toHaveBeenCalledExactlyOnceWith(redirectTo);
    expect(screen.getByText('$66.00')).toBeVisible();
  });

  it('disables stale booking with the supplied reason', async () => {
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show(deskOfferSamStale, handler);
    const button = screen.getByRole('button', { name: 'Book helper' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.actionReasons.awaiting_other_party);
    await userEvent.click(button);
    expect(handler).not.toHaveBeenCalled();
  });

  it('says an expired offer expired, drops what booking would cost, and asks the helper again (audit M31)', async () => {
    const redirectTo = routes.app.requestHelper('sam-k');
    const handler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo }));
    show(deskOfferSamExpired, handler);
    expect(screen.getByText(/This offer expired .*You can still request Sam K\. directly/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: offers.breakdownTitle })).not.toBeInTheDocument();
    expect(screen.queryByText(offers.paymentNote)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Book helper' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Request this helper' }));
    expect(handler).toHaveBeenCalledExactlyOnceWith({ offerId: 'off_sam', action: 'request_helper' });
    expect(push).toHaveBeenCalledExactlyOnceWith(redirectTo);
  });

  it('keeps the control busy during submission and announces a failed result', async () => {
    let finish: (result: ActionResult) => void = () => {};
    show(deskOfferDetailData.offer, vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; })));
    const button = screen.getByRole('button', { name: 'Book helper' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish({ ok: false, code: 'version_conflict' }));
    expect(screen.getByText(messages.feedback.error.version_conflict)).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });
});
