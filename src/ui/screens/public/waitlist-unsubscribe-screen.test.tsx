/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type ActionResult, type WaitlistUnsubscribeHandlers, type WaitlistUnsubscribePageData } from '@/contracts';
import { waitlistUnsubscribePages } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { WaitlistUnsubscribeScreen } from './waitlist-unsubscribe-screen';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ok: ActionResult = { ok: true, code: 'updated' };

function show(data: WaitlistUnsubscribePageData, handlers: Partial<WaitlistUnsubscribeHandlers> = {}, locale: 'en' | 'es' = 'en') {
  const all: WaitlistUnsubscribeHandlers = { onUnsubscribe: vi.fn(async () => ok), onResubscribe: vi.fn(async () => ok), ...handlers };
  render(<NextIntlClientProvider locale={locale} messages={locale === 'es' ? esMessages : messages}><WaitlistUnsubscribeScreen data={data} handlers={all} /></NextIntlClientProvider>);
  return all;
}

describe('the waitlist email’s unsubscribe page (plan 8.3)', () => {
  it('asks first, then turns the emails off, and can turn them back on', async () => {
    const user = userEvent.setup();
    const handlers = show(waitlistUnsubscribePages.confirm);
    expect(screen.getByRole('heading', { level: 1, name: 'Stop waitlist emails?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(handlers.onUnsubscribe).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { level: 1, name: "You won't get waitlist emails anymore" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn them back on' }));
    expect(handlers.onResubscribe).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Waitlist emails are back on.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
  });

  it('keeps the question and says what went wrong when it fails', async () => {
    const user = userEvent.setup();
    show(waitlistUnsubscribePages.confirm, { onUnsubscribe: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T18:05:00.000Z' })) });
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Stop waitlist emails?' })).toBeInTheDocument();
  });

  it('says a link that doesn’t work doesn’t, with no button that acts', () => {
    show(waitlistUnsubscribePages.invalid);
    expect(screen.getByRole('heading', { level: 1, name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to TasksNearMe' })).toHaveAttribute('href', routes.home());
  });

  it('reads in Spanish', () => {
    show(waitlistUnsubscribePages.unsubscribed, {}, 'es');
    expect(screen.getByRole('heading', { level: 1, name: 'Ya no recibirás correos de la lista de espera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a activarlos' })).toBeInTheDocument();
  });
});
