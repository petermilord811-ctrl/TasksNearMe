/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, EmailUnsubscribeHandlers, EmailUnsubscribePageData } from '@/contracts';
import messages from '../../../../messages/en/ui';
import account from '../../../../messages/en/ui/account.json';
import { EmailUnsubscribeScreen } from './email-unsubscribe-screen';

afterEach(cleanup);
const copy = account.unsubscribe;

function show(data: EmailUnsubscribePageData, handlers: Partial<EmailUnsubscribeHandlers> = {}) {
  const all: EmailUnsubscribeHandlers = {
    onUnsubscribe: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    onResubscribe: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    ...handlers,
  };
  render(<NextIntlClientProvider locale="en" messages={{ ...messages, account }}><EmailUnsubscribeScreen data={data} handlers={all} /></NextIntlClientProvider>);
  return all;
}

describe('EmailUnsubscribeScreen', () => {
  it('asks first, unsubscribes, and can turn the emails back on', async () => {
    const user = userEvent.setup();
    const handlers = show({ state: 'confirm', topic: 'offers' });
    expect(screen.getByRole('heading', { level: 1, name: 'Stop offer emails?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.confirm }));
    expect(handlers.onUnsubscribe).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { level: 1, name: "You won't get offer emails anymore" })).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.resubscribe }));
    expect(handlers.onResubscribe).toHaveBeenCalledOnce();
    expect(await screen.findByText('Offer emails are back on.')).toBeVisible();
    expect(screen.getByRole('link', { name: copy.manage })).toHaveAttribute('href', '/app/account');
  });

  it('says why when it fails, and stays put', async () => {
    const user = userEvent.setup();
    show({ state: 'confirm', topic: 'messages' }, { onUnsubscribe: async () => ({ ok: false, code: 'not_allowed' }) });
    await user.click(screen.getByRole('button', { name: copy.confirm }));
    expect(await screen.findByRole('status')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Stop message emails?' })).toBeVisible();
  });

  it.each([
    ['locked', copy.lockedTitle],
    ['invalid', copy.invalidTitle],
  ] as const)('explains a %s link and points to the account', (state, title) => {
    show({ state });
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.manage })).toHaveAttribute('href', '/app/account');
  });
});
