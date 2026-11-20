/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminStaffHandlers } from '@/contracts';
import type { AdminStaffPageData } from '@/contracts';
import { ADMIN_NOW, adminStaffData, adminStaffSetupCode, adminStaffWithPendingGrants, fakeHandler } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminStaff.json';
import { AdminStaffScreen } from './admin-staff-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount(onGrant: AdminStaffHandlers['onGrant'] = fakeHandler({ ok: true, code: 'updated' }, 0), data: AdminStaffPageData = adminStaffData, onDecideGrant: AdminStaffHandlers['onDecideGrant'] = fakeHandler({ ok: true, code: 'updated' }, 0)) {
  const handlers = {
    onGrant: vi.fn(onGrant),
    onRemove: vi.fn<AdminStaffHandlers['onRemove']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onDecideGrant: vi.fn(onDecideGrant),
    onCreateSetupCode: vi.fn<AdminStaffHandlers['onCreateSetupCode']>(async () => ({ ok: true, ...adminStaffSetupCode })),
    onResetAuthenticator: vi.fn<AdminStaffHandlers['onResetAuthenticator']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
  };
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminStaffScreen data={data} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>);
  return handlers;
}

describe('AdminStaffScreen: grants waiting for a second admin (security review SEC19)', () => {
  it('lets another admin approve or decline, and says who decides the viewer’s own request', async () => {
    const user = userEvent.setup();
    const handlers = mount(undefined, adminStaffWithPendingGrants);
    const section = within(screen.getByRole('region', { name: copy.pending.title }));
    const alex = within(section.getByText('Alex P. as Support lead').closest('li')!);
    await user.click(alex.getByRole('button', { name: copy.pending.approve }));
    expect(handlers.onDecideGrant).toHaveBeenCalledWith({ requestId: 'aud_grant_alex', approve: true });
    expect(await alex.findByText(copy.pending.approved)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
    // Riley asked for Casey's grant: no buttons on it.
    const casey = within(section.getByText(/Casey W\. as/).closest('li')!);
    expect(casey.queryByRole('button')).toBeNull();
    expect(casey.getByText(copy.pending.waiting)).toBeInTheDocument();
  });

  it('says when another admin decided first, or the request ended', async () => {
    const user = userEvent.setup();
    mount(undefined, adminStaffWithPendingGrants, fakeHandler({ ok: false, code: 'expired' }, 0));
    await user.click(screen.getByRole('button', { name: copy.pending.decline }));
    expect(await screen.findByText(copy.pending.errors.expired)).toBeInTheDocument();
  });

  it('shows no section when nothing waits, and says a grant was sent for approval', async () => {
    const user = userEvent.setup();
    mount(fakeHandler({ ok: true, code: 'sent' }, 0));
    expect(screen.queryByRole('region', { name: copy.pending.title })).toBeNull();
    await user.type(screen.getByLabelText(copy.email), 'casey@example.test');
    await user.selectOptions(screen.getByLabelText(copy.role), 'trust_safety');
    await user.type(screen.getByLabelText(copy.reason), 'Covers chargeback reviews from December.');
    await user.click(screen.getByRole('button', { name: copy.grant }));
    expect(await screen.findByText(copy.sent)).toBeInTheDocument();
  });
});

describe('AdminStaffScreen', () => {
  it('gives a setup code only where the server allows it, and shows it once', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const offered = adminStaffData.members.filter((member) => member.authenticatorActions.includes('setup_code'));
    expect(screen.getAllByRole('button', { name: copy.authenticator.giveCode })).toHaveLength(offered.length);
    const alex = within(screen.getByText('Alex P.').closest('li')!);
    await user.click(alex.getByRole('button', { name: copy.authenticator.giveCode }));
    expect(handlers.onCreateSetupCode).toHaveBeenCalledWith({ userId: 'usr_alex' });
    expect(await alex.findByText(adminStaffSetupCode.setupCode)).toBeInTheDocument();
    // Nothing for the viewer's own authenticator.
    const riley = within(screen.getByText('Riley N.').closest('li')!);
    expect(riley.queryByRole('button', { name: copy.authenticator.reset })).not.toBeInTheDocument();
  });

  it('resets an authenticator only with a reason', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const morgan = within(screen.getByText('Morgan L.').closest('li')!);
    await user.click(morgan.getByRole('button', { name: copy.authenticator.reset }));
    const dialog = within(await screen.findByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: copy.authenticator.resetConfirm }));
    expect(await dialog.findByText(copy.errors.reasonRequired)).toBeInTheDocument();
    expect(handlers.onResetAuthenticator).not.toHaveBeenCalled();
    await user.type(dialog.getByLabelText(copy.reason), 'Lost their phone; setting up a new one.');
    await user.click(dialog.getByRole('button', { name: copy.authenticator.resetConfirm }));
    await waitFor(() => expect(handlers.onResetAuthenticator).toHaveBeenCalledWith({ userId: 'usr_morgan', reason: 'Lost their phone; setting up a new one.' }));
    expect(await screen.findByText(copy.authenticator.resetDone)).toBeInTheDocument();
  });

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
