/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type AccountHandlers, type AccountPageData, type AccountProfileInput, type ActionResult } from '@/contracts';
import { fakeAccountHandlers, fakeHandler, jordanAccountData, mayaAccountData, newAccountData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import account from '../../../../messages/en/ui/account.json';
import { AccountScreen } from './account-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(data: AccountPageData = mayaAccountData, overrides: Partial<AccountHandlers> = {}) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, account }}>
    <AccountScreen data={data} handlers={{ ...fakeAccountHandlers, ...overrides }} />
  </NextIntlClientProvider>);
}

function expectUnavailableButton(name: string) {
  const button = screen.queryByRole('button', { name });
  if (button) expect(button).toBeDisabled();
}

describe('AccountScreen', () => {
  it('shows the profile, read-only email, and only the masked phone suffix', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    expect(screen.getByLabelText('First name')).toHaveValue('Maya');
    expect(screen.getByLabelText('Last name')).toHaveValue('Rivera');
    expect(screen.getByText(/Maya R\./)).toBeVisible();
    const email = screen.queryByRole('textbox', { name: /^Email$/i });
    if (email) {
      expect(email).toHaveValue(mayaAccountData.profile.email);
      expect(email).toHaveAttribute('readonly');
    } else {
      expect(screen.getByText(mayaAccountData.profile.email)).toBeVisible();
    }
    expect(screen.getByText('•••• 0101 · Verified')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /phone/i })).not.toBeInTheDocument();
  });

  it('handles an absent phone without an unimplemented phone action', () => {
    mount(newAccountData);
    expect(screen.getByText('Add a phone number')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add a phone number' })).not.toBeInTheDocument();
    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
  });

  it('keeps locked preference switches on and cannot invoke a mutation for them', async () => {
    const onSavePreference = vi.fn(fakeHandler<Parameters<AccountHandlers['onSavePreference']>[0]>({ ok: true, code: 'updated' }, 0));
    mount(mayaAccountData, { onSavePreference });
    for (const topic of ['Bookings', 'Payments']) {
      const control = screen.getByRole('switch', { name: new RegExp(`${topic}.*email`, 'i') });
      expect(control).toBeChecked();
      expect(control).toBeDisabled();
      await userEvent.click(control);
    }
    expect(onSavePreference).not.toHaveBeenCalled();
    expect(screen.getByText(/Receipts and safety messages can't be turned off/)).toBeVisible();
  });

  it('reverts a rejected preference, shows the reason, and permits a retry', async () => {
    let finish!: (result: ActionResult) => void;
    const onSavePreference = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount(mayaAccountData, { onSavePreference });
    const control = screen.getByRole('switch', { name: /Messages.*SMS/i });
    expect(control).not.toBeChecked();
    fireEvent.click(control);
    fireEvent.click(control);
    expect(onSavePreference).toHaveBeenCalledExactlyOnceWith({ topic: 'messages', channel: 'sms', enabled: true });
    expect(control).toBeChecked();
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish({ ok: false, code: 'not_allowed' }));
    expect(control).not.toBeChecked();
    expect(control).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(account.preferences.notAllowed);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('retains a saved preference and announces success', async () => {
    const onSavePreference = vi.fn(fakeHandler<Parameters<AccountHandlers['onSavePreference']>[0]>({ ok: true, code: 'updated' }, 0));
    mount(mayaAccountData, { onSavePreference });
    const control = screen.getByRole('switch', { name: /Offers.*SMS/i });
    await userEvent.click(control);
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).toBeChecked();
    expect(onSavePreference).toHaveBeenCalledExactlyOnceWith({ topic: 'offers', channel: 'sms', enabled: true });
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();
  });

  it('asks before deletion, allows cancellation, and explains blocked deletion', async () => {
    const user = userEvent.setup();
    const onRequestDeletion = vi.fn(fakeHandler<void>({ ok: false, code: 'not_allowed' }, 0));
    mount(mayaAccountData, { onRequestDeletion });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(onRequestDeletion).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /cancel|keep|go back/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onRequestDeletion).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /delete|deletion/i }));
    expect(await screen.findByText(/Finish or cancel your open bookings first/)).toBeVisible();
    expect(onRequestDeletion).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('requests an export once and refreshes for its authoritative timestamp', async () => {
    const onRequestExport = vi.fn(fakeHandler<void>({ ok: true, code: 'submitted' }, 0));
    mount(mayaAccountData, { onRequestExport });
    await userEvent.click(screen.getByRole('button', { name: 'Request a copy of my data' }));
    await waitFor(() => expect(onRequestExport).toHaveBeenCalledExactlyOnceWith(undefined));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
    expect(screen.getByText(/within 30 days/i)).toBeVisible();
    expectUnavailableButton('Request a copy of my data');
  });

  it('returns focus to a stable privacy group after successful deletion and retains it when the request date arrives', async () => {
    const user = userEvent.setup();
    const handlers: AccountHandlers = {
      ...fakeAccountHandlers,
      onRequestDeletion: vi.fn(fakeHandler<void>({ ok: true, code: 'submitted' }, 0)),
    };
    const view = mount(mayaAccountData, handlers);
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Request account deletion' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const privacy = screen.getByRole('group', { name: 'Privacy' });
    expect(privacy).toHaveFocus();
    expect(privacy).toHaveTextContent(account.privacy.deletionSubmitted);
    view.rerender(<NextIntlClientProvider locale="en" messages={{ ...messages, account }}>
      <AccountScreen data={{ ...mayaAccountData, privacy: newAccountData.privacy }} handlers={handlers} />
    </NextIntlClientProvider>);
    expect(privacy).toHaveFocus();
    expect(privacy).toHaveTextContent(/Deletion requested .*Nov 21/);
  });

  it('shows supplied privacy dates and links to the privacy policy', () => {
    const { unmount } = mount(jordanAccountData);
    expect(screen.getByText(/Requested .*Nov 20.*within 30 days/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', routes.legal('privacy'));
    expectUnavailableButton('Request a copy of my data');
    unmount();
    mount(newAccountData);
    expect(screen.getByText(/Deletion requested .*Nov 21/i)).toBeVisible();
    expectUnavailableButton('Delete my account');
  });

  it.each([
    ['none', 'Become a helper', routes.app.helperOnboarding()],
    ['draft', 'Finish your helper profile', routes.app.helperOnboarding()],
    ['active', 'Edit your helper profile', routes.app.helperProfile()],
    ['paused', 'Edit your helper profile', routes.app.helperProfile()],
  ] as const)('shows the helper destination for %s status', (status, label, href) => {
    mount({ ...mayaAccountData, helper: { status } });
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
  });

  it('explains a suspended helper account', () => {
    mount({ ...mayaAccountData, helper: { status: 'suspended' } });
    expect(screen.getByText(/Your helper account is suspended/)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Edit your helper profile' })).not.toBeInTheDocument();
  });

  it('validates required names and focuses the first invalid field before calling the handler', async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn(fakeHandler<AccountProfileInput>({ ok: true, code: 'saved' }, 0));
    mount(mayaAccountData, { onSaveProfile });
    await user.clear(screen.getByLabelText('First name'));
    await user.clear(screen.getByLabelText('Last name'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(screen.getAllByText(messages.forms.fieldErrors.required)).toHaveLength(2);
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
  });

  it('disables profile edits while saving and updates the display name only after success', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onSaveProfile = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    const { container } = mount(mayaAccountData, { onSaveProfile });
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'María');
    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'García');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSaveProfile).toHaveBeenCalledExactlyOnceWith({ firstName: 'María', lastName: 'García' });
    expect(screen.getByLabelText('First name')).toBeDisabled();
    expect(screen.getByLabelText('Last name')).toBeDisabled();
    expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    expect(screen.queryByText(/María G\./)).not.toBeInTheDocument();
    await act(async () => finish({ ok: true, code: 'saved' }));
    expect(screen.getByText(/María G\./)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('shows server field errors, focuses the first field, and preserves the saved display name', async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn(fakeHandler<AccountProfileInput>({ ok: false, code: 'validation_failed', fieldErrors: { firstName: ['invalid'], lastName: ['too_long'] } }, 0));
    mount(mayaAccountData, { onSaveProfile });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    expect(screen.getByText(messages.forms.fieldErrors.too_long)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('First name')).toHaveFocus());
    expect(screen.getByText(/Maya R\./)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('shows retry timing when an export request is rate limited', async () => {
    const onRequestExport = vi.fn(fakeHandler<void>({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T18:00:00.000Z' }, 0));
    mount(mayaAccountData, { onRequestExport });
    await userEvent.click(screen.getByRole('button', { name: 'Request a copy of my data' }));
    expect(await screen.findByText(messages.forms.actionErrors.rate_limited)).toBeVisible();
    expect(screen.getByText(/Try again after.*Central time/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Request a copy of my data' })).toBeEnabled();
  });

  it('follows the supplied sign-out redirect', async () => {
    const onSignOut = vi.fn(fakeHandler<void>({ ok: true, code: 'updated', redirectTo: routes.home() }, 0));
    mount(mayaAccountData, { onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.home()));
    expect(onSignOut).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('handles a rejected sign-out request and leaves the control available to retry', async () => {
    const onSignOut = vi.fn().mockRejectedValue(new Error('Unavailable'));
    mount(mayaAccountData, { onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
