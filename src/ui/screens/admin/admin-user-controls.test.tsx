/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_USER_ACTIONS, routes, type ActionResult, type AdminUserHandlers, type AdminUserPageData } from '@/contracts';
import { adminUserJordanData, adminUserReadOnlyData, adminUserSuspendedData, fakeHandler } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import adminUser from '../../../../messages/en/ui/adminUser.json';
import { AdminUserControls } from './admin-user-controls';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(data: AdminUserPageData = adminUserJordanData, handler: AdminUserHandlers['onSuspension'] = fakeHandler({ ok: true, code: 'updated' }, 0)) {
  const onSuspension = vi.fn(handler);
  render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, adminUser }}><AdminUserControls data={data} handlers={{ onSuspension }} /></NextIntlClientProvider>);
  return onSuspension;
}

describe('AdminUserControls', () => {
  it('renders only the supplied actions in order, with labels for every action', () => {
    for (const id of ADMIN_USER_ACTIONS) expect(adminUser.actions[id]).toMatch(/\S/);
    mount({ ...adminUserJordanData, actions: ['reinstate_helper', 'suspend_helper'] });
    expect(within(screen.getByRole('group', { name: adminUser.actionsLabel })).getAllByRole('button').map((button) => button.textContent)).toEqual(['Reinstate helper', 'Suspend helper']);
  });

  it('provides no controls for read-only data', () => {
    mount(adminUserReadOnlyData);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it.each([['suspend_helper', adminUserJordanData, true], ['reinstate_helper', adminUserSuspendedData, false]] as const)('validates and sends only the suspension schema fields for %s', async (actionId, data, suspend) => {
    const user = userEvent.setup();
    const handler = mount(data);
    const trigger = screen.getByRole('button', { name: adminUser.actions[actionId] });
    await user.click(trigger);
    const dialog = within(screen.getByRole('alertdialog'));
    await waitFor(() => expect(dialog.getByRole('button', { name: adminUser.dialog.cancel })).toHaveFocus());
    expect(dialog.getByText(suspend ? adminUser.dialog.suspendDescription : adminUser.dialog.reinstateDescription)).toBeInTheDocument();
    const reason = dialog.getByRole('textbox', { name: adminUser.dialog.reason });
    fireEvent.change(reason, { target: { value: '  123456789  ' } });
    await user.click(dialog.getByRole('button', { name: adminUser.actions[actionId] }));
    expect(await dialog.findByText(adminUser.dialog.required)).toBeInTheDocument();
    await waitFor(() => expect(reason).toHaveFocus());
    expect(handler).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: 'x'.repeat(1001) } });
    await user.click(dialog.getByRole('button', { name: adminUser.actions[actionId] }));
    expect(await dialog.findByText(adminUser.dialog.tooLong)).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: '  1234567890  ' } });
    await user.click(dialog.getByRole('button', { name: adminUser.actions[actionId] }));
    await waitFor(() => expect(handler).toHaveBeenCalledExactlyOnceWith({ suspend, reason: '1234567890' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText(adminUser.updated)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText(adminUser.updated).closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('keeps success focused when refreshed data removes the action that opened the dialog', async () => {
    const user = userEvent.setup();
    let settle!: (result: ActionResult) => void;
    const handlers: AdminUserHandlers = { onSuspension: () => new Promise((resolve) => { settle = resolve; }) };
    const view = (data: AdminUserPageData) => <NextIntlClientProvider locale="en" messages={{ ...uiMessages, adminUser }}><AdminUserControls data={data} handlers={handlers} /></NextIntlClientProvider>;
    const { rerender } = render(view(adminUserJordanData));
    await user.click(screen.getByRole('button', { name: 'Suspend helper' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Check the linked accounts.' } });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Suspend helper' }));
    await act(async () => { settle({ ok: true, code: 'updated' }); });
    rerender(view({ ...adminUserJordanData, actions: ['reinstate_helper'] }));
    expect(screen.queryByRole('button', { name: 'Suspend helper' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reinstate helper' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(adminUser.updated).closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('locks the dialog while pending, prevents repeat submissions, then follows redirectTo', async () => {
    const user = userEvent.setup();
    let settle!: (result: ActionResult) => void;
    const handler = mount(adminUserJordanData, () => new Promise((resolve) => { settle = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Suspend helper' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Check the linked accounts.' } });
    const form = screen.getByRole('form', { name: 'Suspend helper' });
    fireEvent.submit(form);
    await waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.submit(form);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(handler).toHaveBeenCalledOnce();
    await act(async () => { settle({ ok: true, code: 'updated', redirectTo: routes.admin.users() }); });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.admin.users()));
  });

  it.each(['validation_failed', 'not_allowed', 'unknown'] as const)('keeps the reason available and announces %s', async (code) => {
    const user = userEvent.setup();
    mount(adminUserJordanData, fakeHandler({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { reason: ['too_short'] } } : {}) }, 0));
    await user.click(screen.getByRole('button', { name: 'Suspend helper' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Check the linked accounts.' } });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Suspend helper' }));
    const feedback = code === 'validation_failed' ? adminUser.dialog.required : code === 'not_allowed' ? adminUser.dialog.notAllowed : uiMessages.feedback.error.unknown;
    expect(await screen.findByText(feedback)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Check the linked accounts.');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('handles a thrown error and restores focus when canceled', async () => {
    const user = userEvent.setup();
    mount(adminUserJordanData, async () => { throw new Error('offline'); });
    const trigger = screen.getByRole('button', { name: 'Suspend helper' });
    await user.click(trigger);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Check the linked accounts.' } });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Suspend helper' }));
    expect(await screen.findByText(uiMessages.feedback.error.unknown)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
