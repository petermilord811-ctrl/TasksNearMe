/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminStaffHandlers } from '@/contracts';
import { ADMIN_NOW, adminStaffData, fakeHandler } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminStaff.json';
import { AdminStaffScreen } from './admin-staff-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(onGrant: AdminStaffHandlers['onGrant'] = fakeHandler({ ok: true, code: 'updated' }, 0)) {
  const handlers = { onGrant: vi.fn(onGrant), onRemove: vi.fn<AdminStaffHandlers['onRemove']>(fakeHandler({ ok: true, code: 'updated' }, 0)) };
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminStaffScreen data={adminStaffData} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>);
  return handlers;
}

describe('AdminStaffScreen', () => {
  it('offers to remove only the removable roles', () => {
    mount();
    const removable = adminStaffData.members.flatMap((member) => member.removable).length;
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(removable);
    // Riley (the viewer) and Sky's admin role have no remove button.
    expect(screen.queryByRole('button', { name: 'Remove Admin' })).not.toBeInTheDocument();
  });

  it('grants a role by email with a reason, and shows a server error on the email', async () => {
    const user = userEvent.setup();
    const handlers = mount(fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } }, 0));
    const form = within(screen.getByRole('form', { name: copy.grantTitle }));
    await user.click(form.getByRole('button', { name: copy.grant }));
    expect(await form.findByText(copy.errors.roleRequired)).toBeInTheDocument();
    expect(handlers.onGrant).not.toHaveBeenCalled();
    await user.type(form.getByLabelText(copy.email), 'nobody@example.test');
    await user.selectOptions(form.getByLabelText(copy.role), 'support_agent');
    await user.type(form.getByLabelText(copy.reason), 'Joining the support team this week.');
    await user.click(form.getByRole('button', { name: copy.grant }));
    await waitFor(() => expect(handlers.onGrant).toHaveBeenCalledWith({ email: 'nobody@example.test', role: 'support_agent', reason: 'Joining the support team this week.' }));
    expect(await form.findByText(copy.errors.emailInvalid)).toBeInTheDocument();
  });

  it('removes a role after a confirmation with a reason', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    await user.click(screen.getAllByRole('button', { name: 'Remove Support agent' })[0]!);
    const dialog = within(screen.getByRole('alertdialog'));
    await user.type(dialog.getByLabelText(copy.reason), 'Moved to the support lead role.');
    await user.click(dialog.getByRole('button', { name: 'Remove Support agent' }));
    await waitFor(() => expect(handlers.onRemove).toHaveBeenCalledWith({ userId: 'usr_alex', role: 'support_agent', reason: 'Moved to the support lead role.' }));
    expect(await screen.findByText(copy.removed)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });
});
