/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserHandlers, AdminUserPageData } from '@/contracts';
import { ADMIN_NOW, adminUserJordanData, adminUserReadOnlyData, fakeAdminUserHandlers, fakeHandler } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import uiMessages from '../../../../messages/en/ui';
import adminUser from '../../../../messages/en/ui/adminUser.json';
import { AdminUserScreen } from './admin-user-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(data: AdminUserPageData = adminUserJordanData, handlers: Partial<AdminUserHandlers> = {}) {
  const onReverseStrike = vi.fn<AdminUserHandlers['onReverseStrike']>(handlers.onReverseStrike ?? fakeHandler({ ok: true, code: 'updated' }, 0));
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminUserScreen data={data} handlers={{ ...fakeAdminUserHandlers, onReverseStrike }} now={ADMIN_NOW} /></NextIntlClientProvider>);
  return onReverseStrike;
}

describe('reversing a strike', () => {
  it('offers it on strikes that still count, and shows reversed ones as reversed', () => {
    mount();
    const strikes = within(screen.getByRole('region', { name: adminUser.strikes }));
    expect(strikes.getByRole('button', { name: 'Reverse strike: No-show' })).toBeVisible();
    expect(strikes.queryByRole('button', { name: 'Reverse strike: Late cancellation' })).not.toBeInTheDocument();
    expect(strikes.getByText(`Reversed ${formatDateTime('2026-11-03T18:20:00.000Z')}`)).toBeVisible();
  });

  it('is not offered without the role', () => {
    mount(adminUserReadOnlyData);
    expect(screen.queryByRole('button', { name: /Reverse strike/ })).not.toBeInTheDocument();
  });

  it('asks for a reason, sends it, and refreshes; cancel returns focus to the button', async () => {
    const user = userEvent.setup();
    const onReverseStrike = mount();
    const button = screen.getByRole('button', { name: 'Reverse strike: No-show' });
    await user.click(button);
    const dialog = screen.getByRole('alertdialog', { name: adminUser.strikeDialog.title });
    await user.type(within(dialog).getByRole('textbox', { name: adminUser.strikeDialog.reason }), 'Too short');
    await user.click(within(dialog).getByRole('button', { name: adminUser.strikeDialog.submit }));
    expect(await within(dialog).findByText(adminUser.strikeDialog.required)).toBeVisible();
    expect(onReverseStrike).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: adminUser.strikeDialog.cancel }));
    await waitFor(() => expect(button).toHaveFocus());

    await user.click(button);
    const again = screen.getByRole('alertdialog', { name: adminUser.strikeDialog.title });
    const reason = 'The helper showed a photo of the locked gate; the client confirmed it.';
    await user.type(within(again).getByRole('textbox', { name: adminUser.strikeDialog.reason }), reason);
    await user.click(within(again).getByRole('button', { name: adminUser.strikeDialog.submit }));
    await waitFor(() => expect(onReverseStrike).toHaveBeenCalledWith({ strikeId: 'stk_jordan_noshow', reason }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
  });

  it('keeps the dialog open with a clear message when it is no longer allowed', async () => {
    const user = userEvent.setup();
    mount(adminUserJordanData, { onReverseStrike: fakeHandler({ ok: false, code: 'not_allowed' }, 0) });
    await user.click(screen.getByRole('button', { name: 'Reverse strike: No-show' }));
    const dialog = screen.getByRole('alertdialog', { name: adminUser.strikeDialog.title });
    await user.type(within(dialog).getByRole('textbox', { name: adminUser.strikeDialog.reason }), 'Reviewed the appeal with the client.');
    await user.click(within(dialog).getByRole('button', { name: adminUser.strikeDialog.submit }));
    expect(await within(dialog).findByText(adminUser.strikeDialog.notAllowed)).toBeVisible();
  });
});
