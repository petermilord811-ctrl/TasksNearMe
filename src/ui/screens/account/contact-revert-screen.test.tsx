/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, ContactRevertHandlers, ContactRevertPageData } from '@/contracts';
import messages from '../../../../messages/en/ui';
import account from '../../../../messages/en/ui/account.json';
import { ContactRevertScreen } from './contact-revert-screen';

/** The "Not you?" link's page (completion plan 5.23): it asks first, then says what happens next. */

afterEach(cleanup);
const copy = account.notMe;

function show(data: ContactRevertPageData, onConfirm: ContactRevertHandlers['onConfirm'] = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }))) {
  render(
    // Copy errors throw here, as on the e2e build.
    <NextIntlClientProvider locale="en" messages={{ ...messages, account }} onError={(error) => { throw error; }}>
      <ContactRevertScreen data={data} handlers={{ onConfirm }} />
    </NextIntlClientProvider>,
  );
  return onConfirm;
}

describe('ContactRevertScreen', () => {
  it('asks first, then says the account is being secured and what happens next', async () => {
    const user = userEvent.setup();
    const onConfirm = show({ state: 'ask' });
    expect(screen.getByRole('heading', { level: 1, name: copy.ask.title })).toBeVisible();
    expect(screen.getByText('The change is undone, if it was made in the last 7 days.')).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: copy.ask.confirm }));
    expect(onConfirm).toHaveBeenCalledOnce();
    const heading = await screen.findByRole('heading', { level: 1, name: copy.done.title });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2, name: copy.done.listTitle })).toBeVisible();
    expect(screen.getByRole('link', { name: copy.done.signIn })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByRole('link', { name: copy.contactSupport })).toHaveAttribute('href', '/help/contact');
    expect(screen.queryByRole('button', { name: copy.ask.confirm })).not.toBeInTheDocument();
  });

  it('turns into the same neutral page when the link turns out used or expired', async () => {
    const user = userEvent.setup();
    show({ state: 'ask' }, async () => ({ ok: false, code: 'not_found' }));
    await user.click(screen.getByRole('button', { name: copy.ask.confirm }));
    expect(await screen.findByRole('heading', { level: 1, name: copy.invalid.title })).toHaveFocus();
    expect(screen.getByRole('link', { name: copy.contactSupport })).toHaveAttribute('href', '/help/contact');
  });

  it('says when to try again, and stays put', async () => {
    const user = userEvent.setup();
    show({ state: 'ask' }, async () => ({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T18:05:00.000Z' }));
    await user.click(screen.getByRole('button', { name: copy.ask.confirm }));
    expect(await screen.findByRole('status')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: copy.ask.title })).toBeVisible();
    expect(screen.getByRole('button', { name: copy.ask.confirm })).toBeEnabled();
  });

  it('explains a link that can’t be used, without a button, and points to support', () => {
    show({ state: 'invalid' });
    expect(screen.getByRole('heading', { level: 1, name: copy.invalid.title })).toBeVisible();
    expect(screen.getByText('It may have been used already, be more than 7 days old, or have been copied only in part.')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.contactSupport })).toHaveAttribute('href', '/help/contact');
  });
});
