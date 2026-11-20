/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_NOW, adminWebhooksCalmData, adminWebhooksFailingData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { AdminWebhooksScreen } from './admin-webhooks-screen';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('AdminWebhooksScreen', () => {
  it('lists dead events first, offers replay only where it can run, and announces the outcome', async () => {
    const onAction = vi.fn().mockResolvedValueOnce({ ok: false, code: 'unknown' });
    render(withMessages(<AdminWebhooksScreen data={adminWebhooksFailingData} handlers={{ onAction }} now={ADMIN_NOW} />));
    const items = within(screen.getByRole('region', { name: 'Failing events' })).getAllByRole('listitem');
    expect(within(items[0]!).getByText('Dead')).toBeTruthy();
    expect(within(items[1]!).getByText('Retrying')).toBeTruthy();
    expect(within(items[1]!).queryByRole('button', { name: /Replay/ })).toBeNull();
    expect(within(items[1]!).getByText(/Resend it from the provider's dashboard/)).toBeTruthy();

    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Replay Stripe payment_intent.succeeded' }));
    expect(onAction).toHaveBeenCalledWith({ eventRowId: 'whk_dead_pi', action: 'replay' });
    expect(await within(items[0]!).findByText('It failed again. The error above is the latest.')).toBeTruthy();
  });

  it('asks why before dismissing, and sends the reason (security review SEC24)', async () => {
    const onAction = vi.fn().mockResolvedValueOnce({ ok: true, code: 'updated' });
    render(withMessages(<AdminWebhooksScreen data={adminWebhooksFailingData} handlers={{ onAction }} now={ADMIN_NOW} />));
    const [dead] = within(screen.getByRole('region', { name: 'Failing events' })).getAllByRole('listitem');
    await userEvent.click(within(dead!).getByRole('button', { name: 'Dismiss Stripe payment_intent.succeeded' }));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.type(within(dead!).getByLabelText('Why dismiss it?'), 'Refunded by hand in the Stripe Dashboard.');
    await userEvent.click(within(dead!).getByRole('button', { name: 'Dismiss Stripe payment_intent.succeeded' }));
    expect(onAction).toHaveBeenCalledWith({ eventRowId: 'whk_dead_pi', action: 'dismiss', reason: 'Refunded by hand in the Stripe Dashboard.' });
    expect(await within(dead!).findByText('Done.')).toBeTruthy();
  });

  it('says when nothing is failing', () => {
    render(withMessages(<AdminWebhooksScreen data={adminWebhooksCalmData} handlers={{ onAction: vi.fn() }} now={ADMIN_NOW} />));
    expect(screen.getByText('Nothing is failing.')).toBeTruthy();
  });
});
