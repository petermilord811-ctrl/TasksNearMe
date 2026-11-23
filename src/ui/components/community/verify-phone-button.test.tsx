/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult } from '@/contracts';
import messages from '../../../../messages/en/ui';
import { VerifyPhoneButton } from './verify-phone-button';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('sonner', () => ({ toast }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const show = (handlers?: Parameters<typeof VerifyPhoneButton>[0]['handlers']) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
  <p>Verify your phone number to post and reply. <VerifyPhoneButton handlers={handlers} /></p>
</NextIntlClientProvider>);

describe('VerifyPhoneButton (2026-11-23: Neighbors verifies a phone in place)', () => {
  it('verifies the number in a dialog over the page: a texted code, then the page refreshes and can post', async () => {
    const user = userEvent.setup();
    const onStartPhoneChange = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent' }));
    const onConfirmPhoneChange = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show({ onStartPhoneChange, onConfirmPhoneChange });
    const button = screen.getByRole('button', { name: messages.community.verifyPhone });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await user.click(button);
    const dialog = await screen.findByRole('dialog', { name: messages.community.verifyPhoneTitle });
    await user.type(within(dialog).getByLabelText(messages.forms.fields.phone.label), '(352) 555-0188');
    await user.click(within(dialog).getByRole('button', { name: messages.account.contact.phoneDialog.send }));
    expect(onStartPhoneChange).toHaveBeenCalledExactlyOnceWith({ phone: '(352) 555-0188' });
    // The sixth digit sends the code.
    await user.type(await within(dialog).findByLabelText('6-digit code'), '123456');
    await waitFor(() => expect(onConfirmPhoneChange).toHaveBeenCalledExactlyOnceWith({ code: '123456' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(messages.community.phoneVerified);
    expect(navigation.refresh).toHaveBeenCalled();
    // Opened by state with no trigger of its own: focus comes back to the button.
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('keeps the wrong code in the dialog, with nothing refreshed', async () => {
    const user = userEvent.setup();
    const onConfirmPhoneChange = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } }));
    show({ onStartPhoneChange: async () => ({ ok: true, code: 'sent' }), onConfirmPhoneChange });
    await user.click(screen.getByRole('button', { name: messages.community.verifyPhone }));
    const dialog = await screen.findByRole('dialog', { name: messages.community.verifyPhoneTitle });
    await user.type(within(dialog).getByLabelText(messages.forms.fields.phone.label), '3525550188');
    await user.click(within(dialog).getByRole('button', { name: messages.account.contact.phoneDialog.send }));
    await user.type(await within(dialog).findByLabelText('6-digit code'), '000000');
    await waitFor(() => expect(onConfirmPhoneChange).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog', { name: messages.community.verifyPhoneTitle })).toBeInTheDocument();
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('links to the account page where the page brought no phone steps', () => {
    show();
    expect(screen.getByRole('link', { name: messages.community.verifyPhone })).toHaveAttribute('href', routes.app.account());
  });
});
