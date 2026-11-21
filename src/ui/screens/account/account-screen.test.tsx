/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type AccountHandlers, type AccountPageData, type AccountProfileInput, type ActionResult } from '@/contracts';
import { deletionWaitingPrivacy, exportReadyPrivacy, fakeAccountHandlers, fakeHandler, heldAccountData, jordanAccountData, jordanProfilePhoto, mayaAccountData, newAccountData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import account from '../../../../messages/en/ui/account.json';
import { AccountScreen } from './account-screen';
import { MARKET_TIME_ZONE } from '@/contracts/common';
import { timeZoneName } from '@/shared/format';

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
  it('shows the profile, the email, and only the masked phone suffix', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    expect(screen.getByLabelText('First name')).toHaveValue('Maya');
    expect(screen.getByLabelText('Last name')).toHaveValue('Rivera');
    expect(screen.getByText(/Maya R\./)).toBeVisible();
    // Shown in contact details, and again under the ways to sign in (for the email code).
    expect(screen.getAllByText(mayaAccountData.profile.email).length).toBeGreaterThan(0);
    expect(screen.getByText('•••• 0101 · Verified')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /phone/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change your email' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Change your phone number' })).toBeEnabled();
  });

  it('offers to add a phone when there is none', () => {
    mount(newAccountData);
    expect(screen.getByText(account.contact.noPhone)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add a phone number' })).toBeEnabled();
    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
  });

  it('asks for no phone and has no text column where texts don’t go out (plan 9.2)', () => {
    mount({ ...newAccountData, textsOff: true, preferences: newAccountData.preferences.filter((preference) => preference.channel !== 'sms') });
    expect(screen.queryByText(account.contact.noPhone)).not.toBeInTheDocument();
    expect(screen.queryByText(account.contact.noPhoneHint)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a phone number' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: account.preferences.channels.sms })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: account.preferences.channels.email })).toBeVisible();
    cleanup();
    // A number verified before shows, without a button to change it (that needs a code by text).
    mount({ ...mayaAccountData, textsOff: true });
    expect(screen.getByText('•••• 0101 · Verified')).toBeVisible();
    expect(screen.queryByRole('button', { name: account.contact.changePhoneLabel })).not.toBeInTheDocument();
  });

  it('says why nothing can change while a "Not you?" link holds the account, and still lets ways in be removed', () => {
    const passkeyHandlers: Partial<AccountHandlers> = {
      onPasskeyRegistrationOptions: vi.fn(async () => ({ ok: false as const, code: 'not_allowed' as const })),
      onAddPasskey: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'not_allowed' })),
      onRemovePasskey: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    };
    mount({ ...heldAccountData, signIn: { ...heldAccountData.signIn, passkeys: [{ id: 'pky_maya', name: 'Laptop', createdAt: '2026-11-18T15:00:00.000Z', backedUp: false }] } }, passkeyHandlers);
    expect(screen.getByText(account.contact.heldTitle)).toBeVisible();
    expect(screen.getByText(account.contact.held)).toBeVisible();
    expect(screen.getByRole('link', { name: account.contact.heldSupport })).toHaveAttribute('href', routes.app.support());
    expect(screen.queryByRole('button', { name: 'Change your email' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change your phone number' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Microsoft' })).not.toBeInTheDocument();
    expect(screen.getByText(account.signIn.held)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Disconnect Google' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: account.passkeys.add })).not.toBeInTheDocument();
    expect(screen.getByText(account.passkeys.held)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove passkey Laptop' })).toBeEnabled();
  });

  it('names the notifications card for what it holds, not "Notifications" again under the group (journeys on a phone, J-C-m)', () => {
    mount(mayaAccountData);
    expect(screen.getByRole('heading', { level: 3, name: 'Emails and texts' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 3, name: 'Notifications' })).not.toBeInTheDocument();
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
    // Busy, not disabled: a disabled switch would drop keyboard focus (J-C8). The second click was ignored.
    expect(control).toBeEnabled();
    expect(control).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish({ ok: false, code: 'not_allowed' }));
    expect(control).not.toBeChecked();
    expect(control).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(account.preferences.notAllowed);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('keeps focus on a switch while it saves, after, and when a refresh brings the saved value (J-C8)', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onSavePreference = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    const { rerender } = mount(mayaAccountData, { onSavePreference });
    const control = screen.getByRole('switch', { name: /Messages.*SMS/i });
    control.focus();
    await user.keyboard(' ');
    expect(onSavePreference).toHaveBeenCalledExactlyOnceWith({ topic: 'messages', channel: 'sms', enabled: true });
    expect(control).toHaveFocus();
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(control).toHaveFocus();
    expect(control).toBeChecked();
    const refreshed = { ...mayaAccountData, preferences: mayaAccountData.preferences.map((item) => item.topic === 'messages' && item.channel === 'sms' ? { ...item, enabled: true } : item) };
    rerender(<NextIntlClientProvider locale="en" messages={{ ...messages, account }}><AccountScreen data={refreshed} handlers={{ ...fakeAccountHandlers, onSavePreference }} /></NextIntlClientProvider>);
    expect(control).toBeInTheDocument();
    expect(control).toHaveFocus();
    expect(control).toBeChecked();
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
    expect(screen.getByText(account.privacy.exportSubmitted)).toBeVisible();
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
    expect(privacy).toHaveTextContent('Deletion requested. It happens in 7 days unless you keep your account.');
    view.rerender(<NextIntlClientProvider locale="en" messages={{ ...messages, account }}>
      <AccountScreen data={{ ...mayaAccountData, privacy: newAccountData.privacy }} handlers={handlers} />
    </NextIntlClientProvider>);
    expect(privacy).toHaveFocus();
    expect(privacy).toHaveTextContent(/Your account will be deleted on .*Nov 28/);
  });

  it('groups the page under an index of its sections (audit M37)', () => {
    mount(jordanAccountData);
    const index = screen.getByRole('navigation', { name: 'Account sections' });
    const links = within(index).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#account-profile', '#account-security', '#account-notifications', '#account-helping', '#account-privacy']);
    for (const link of links) {
      const group = document.querySelector(link.getAttribute('href')!)!;
      expect(group).toBeInTheDocument();
      expect(within(group as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent(link.textContent!);
    }
    // Each card is a part of its group, and the notifications table's columns are short.
    expect(screen.getByRole('heading', { level: 3, name: 'Contact details' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
  });

  it('shows supplied privacy dates and links to the privacy policy', () => {
    const { unmount } = mount(jordanAccountData);
    expect(screen.getByText(/Preparing your copy \(asked for .*Nov 20\)/)).toBeVisible();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', routes.legal('privacy'));
    expectUnavailableButton('Request a copy of my data');
    unmount();
    mount(newAccountData);
    expect(screen.getByText(/Your account will be deleted on .*Nov 28/)).toBeVisible();
    expectUnavailableButton('Delete my account');
  });

  it('offers the ready copy as a download until it expires', () => {
    mount({ ...jordanAccountData, privacy: exportReadyPrivacy });
    expect(screen.getByRole('link', { name: 'Download my data (ZIP)' })).toHaveAttribute('href', routes.api.dataExport());
    expect(screen.getByText(/Ready to download until .*Nov 27/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Request a copy of my data' })).not.toBeInTheDocument();
  });

  it('keeps the account when asked, and says what a waiting deletion waits for', async () => {
    const onCancelDeletion = vi.fn(fakeHandler<void>({ ok: true, code: 'updated' }, 0));
    mount({ ...newAccountData, privacy: deletionWaitingPrivacy }, { onCancelDeletion });
    expect(screen.getByText('It waits until your open bookings are finished or canceled.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    await waitFor(() => expect(onCancelDeletion).toHaveBeenCalledExactlyOnceWith(undefined));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
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
    expect(screen.getByText(new RegExp(`Try again after .*\\(${timeZoneName(MARKET_TIME_ZONE)}\\)`))).toBeVisible();
    expect(screen.getByRole('button', { name: 'Request a copy of my data' })).toBeEnabled();
  });

  it('follows the supplied sign-out redirect', async () => {
    const onSignOut = vi.fn(fakeHandler<void>({ ok: true, code: 'updated', redirectTo: routes.home() }, 0));
    mount(mayaAccountData, { onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.home()));
    expect(onSignOut).toHaveBeenCalledExactlyOnceWith();
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

describe('Ways to sign in', () => {
  it('lists the email code and each provider, connected or not', () => {
    mount();
    const section = screen.getByRole('heading', { name: account.signIn.title }).closest('section') ?? document.body;
    expect(within(section as HTMLElement).getByText(account.signIn.alwaysOn)).toBeVisible();
    expect(within(section as HTMLElement).getByRole('button', { name: 'Disconnect Google' })).toBeEnabled();
    expect(within(section as HTMLElement).getByRole('button', { name: 'Connect Microsoft' })).toBeEnabled();
  });

  it('leaves for the provider to connect one', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const onConnectSignIn = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent', redirectTo: 'https://login.example/authorize' }));
    mount(mayaAccountData, { onConnectSignIn });
    await userEvent.click(screen.getByRole('button', { name: 'Connect Microsoft' }));
    expect(onConnectSignIn).toHaveBeenCalledExactlyOnceWith({ provider: 'microsoft' });
    expect(assign).toHaveBeenCalledExactlyOnceWith('https://login.example/authorize');
    vi.unstubAllGlobals();
  });

  it('disconnects in place and refreshes', async () => {
    const onDisconnectSignIn = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    mount(mayaAccountData, { onDisconnectSignIn });
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect Google' }));
    expect(onDisconnectSignIn).toHaveBeenCalledExactlyOnceWith({ provider: 'google' });
    expect(await screen.findByText(account.signIn.disconnected.replace('{provider}', 'Google'))).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('says how connecting went', () => {
    mount(jordanAccountData);
    expect(screen.getByText(account.signIn.notice.connected.replaceAll('{provider}', 'Microsoft'))).toBeVisible();
  });

  it('offers only the email code when no provider is set up', () => {
    mount(newAccountData);
    expect(screen.queryByRole('button', { name: /Connect|Disconnect/ })).toBeNull();
    expect(screen.getByText(account.signIn.emailCode)).toBeVisible();
  });

  describe('profile photo', () => {
    const photo = (name = 'me.jpg', type = 'image/jpeg', bytes = 2048) => new File([new Uint8Array(bytes)], name, { type });

    it('uploads a chosen photo, shows it at once, and refreshes', async () => {
      const onUploadPhoto = vi.fn(async (_form: FormData) => ({ ok: true as const, photo: jordanProfilePhoto }));
      mount(mayaAccountData, { onUploadPhoto });
      expect(screen.getByRole('img', { name: 'Avatar with initials MR' })).toBeVisible();
      await userEvent.upload(screen.getByLabelText(messages.forms.profilePhoto.add), photo());
      expect(onUploadPhoto).toHaveBeenCalledOnce();
      expect(onUploadPhoto.mock.calls[0]![0].get('file')).toBeInstanceOf(File);
      expect(await screen.findByText(messages.forms.profilePhoto.uploaded)).toBeVisible();
      expect(screen.getByRole('img', { name: 'Profile photo of Jordan T.' })).toBeVisible();
      expect(screen.getByLabelText(messages.forms.profilePhoto.change)).toBeEnabled();
      expect(navigation.refresh).toHaveBeenCalled();
    });

    it('refuses a photo over the limit without uploading it', async () => {
      const onUploadPhoto = vi.fn(fakeAccountHandlers.onUploadPhoto);
      mount(mayaAccountData, { onUploadPhoto });
      await userEvent.upload(screen.getByLabelText(messages.forms.profilePhoto.add), photo('huge.jpg', 'image/jpeg', 11 * 1024 * 1024));
      expect(onUploadPhoto).not.toHaveBeenCalled();
      expect(screen.getByText(messages.forms.profilePhoto.errors.too_large.replace('{megabytes, number}', '10'))).toBeVisible();
    });

    it("explains a photo the server can't use", async () => {
      mount(mayaAccountData, { onUploadPhoto: async () => ({ ok: false, code: 'unsupported_type' }) });
      await userEvent.upload(screen.getByLabelText(messages.forms.profilePhoto.add), photo());
      expect(await screen.findByText(messages.forms.profilePhoto.errors.unsupported_type)).toBeVisible();
      expect(screen.getByRole('img', { name: 'Avatar with initials MR' })).toBeVisible();
    });

    it('removes the photo and goes back to the initials', async () => {
      const onRemovePhoto = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
      mount(jordanAccountData, { onRemovePhoto });
      expect(screen.getByRole('img', { name: 'Profile photo of Jordan T.' })).toBeVisible();
      expect(screen.getByText(messages.forms.profilePhoto.notes.publicProfile, { exact: false })).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: messages.forms.profilePhoto.remove }));
      expect(onRemovePhoto).toHaveBeenCalledOnce();
      expect(await screen.findByText(messages.forms.profilePhoto.removed)).toBeVisible();
      expect(screen.getByRole('img', { name: 'Avatar with initials JT' })).toBeVisible();
      expect(screen.queryByRole('button', { name: messages.forms.profilePhoto.remove })).not.toBeInTheDocument();
    });
  });

  describe('changing the email', () => {
    it('sends a code to the new address, and the sixth digit confirms it', async () => {
      const onStartEmailChange = vi.fn(fakeAccountHandlers.onStartEmailChange);
      const onConfirmEmailChange = vi.fn(fakeAccountHandlers.onConfirmEmailChange);
      mount(mayaAccountData, { onStartEmailChange, onConfirmEmailChange });
      await userEvent.click(screen.getByRole('button', { name: 'Change your email' }));
      const dialog = await screen.findByRole('dialog', { name: account.contact.emailDialog.title });
      await userEvent.type(within(dialog).getByLabelText(account.contact.emailDialog.label), '  Maya.New@Example.test ');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.emailDialog.send }));
      expect(onStartEmailChange).toHaveBeenCalledExactlyOnceWith({ email: 'maya.new@example.test' });
      expect(await within(dialog).findByText('maya.new@example.test')).toBeVisible();
      await userEvent.type(within(dialog).getByLabelText('6-digit code'), '123456');
      await waitFor(() => expect(onConfirmEmailChange).toHaveBeenCalledExactlyOnceWith({ email: 'maya.new@example.test', code: '123456' }));
      expect(await screen.findByText(account.contact.emailChanged.replace('{email}', 'maya.new@example.test'))).toBeVisible();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(navigation.refresh).toHaveBeenCalled();
    });

    it("says when the address is another account's", async () => {
      mount();
      await userEvent.click(screen.getByRole('button', { name: 'Change your email' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(within(dialog).getByLabelText(account.contact.emailDialog.label), 'taken@example.test');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.emailDialog.send }));
      expect(await within(dialog).findByText(messages.forms.fields.email.in_use)).toBeVisible();
      expect(within(dialog).getByLabelText(account.contact.emailDialog.label)).toHaveFocus();
      expect(within(dialog).queryByLabelText('6-digit code')).not.toBeInTheDocument();
    });

    it('keeps the dialog open on a wrong code, and a new code can be sent', async () => {
      const onStartEmailChange = vi.fn(fakeAccountHandlers.onStartEmailChange);
      mount(mayaAccountData, { onStartEmailChange });
      await userEvent.click(screen.getByRole('button', { name: 'Change your email' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(within(dialog).getByLabelText(account.contact.emailDialog.label), 'maya.new@example.test');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.emailDialog.send }));
      await userEvent.type(await within(dialog).findByLabelText('6-digit code'), '000000');
      expect(await within(dialog).findByText(messages.forms.fieldErrors.incorrect)).toBeVisible();
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.resend }));
      expect(onStartEmailChange).toHaveBeenLastCalledWith({ email: 'maya.new@example.test' });
      expect(await within(dialog).findByText(account.contact.newCodeSent)).toBeVisible();
      expect(within(dialog).getByLabelText('6-digit code')).toHaveValue('');
    });

    it('goes back to the address when it was taken before the code was entered', async () => {
      const onConfirmEmailChange = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { email: ['in_use'] } }));
      mount(mayaAccountData, { onConfirmEmailChange });
      await userEvent.click(screen.getByRole('button', { name: 'Change your email' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(within(dialog).getByLabelText(account.contact.emailDialog.label), 'maya.new@example.test');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.emailDialog.send }));
      await userEvent.type(await within(dialog).findByLabelText('6-digit code'), '123456');
      expect(await within(dialog).findByText(messages.forms.fields.email.in_use)).toBeVisible();
      expect(within(dialog).getByLabelText(account.contact.emailDialog.label)).toHaveValue('maya.new@example.test');
    });
  });

  describe('changing the phone', () => {
    it('adds a number with a texted code', async () => {
      const onStartPhoneChange = vi.fn(fakeAccountHandlers.onStartPhoneChange);
      const onConfirmPhoneChange = vi.fn(fakeAccountHandlers.onConfirmPhoneChange);
      mount(newAccountData, { onStartPhoneChange, onConfirmPhoneChange });
      await userEvent.click(screen.getByRole('button', { name: 'Add a phone number' }));
      const dialog = await screen.findByRole('dialog', { name: account.contact.phoneDialog.addTitle });
      await userEvent.type(within(dialog).getByLabelText('Phone number'), '(512) 555-0199');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.phoneDialog.send }));
      expect(onStartPhoneChange).toHaveBeenCalledExactlyOnceWith({ phone: '(512) 555-0199' });
      await userEvent.type(await within(dialog).findByLabelText('6-digit code'), '123456');
      await waitFor(() => expect(onConfirmPhoneChange).toHaveBeenCalledExactlyOnceWith({ code: '123456' }));
      expect(await screen.findByText(account.contact.phoneChanged)).toBeVisible();
    });

    it('shows when to try again after too many codes', async () => {
      mount(mayaAccountData, { onStartPhoneChange: async () => ({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T18:30:00.000Z' }) });
      await userEvent.click(screen.getByRole('button', { name: 'Change your phone number' }));
      const dialog = await screen.findByRole('dialog', { name: account.contact.phoneDialog.changeTitle });
      await userEvent.type(within(dialog).getByLabelText('Phone number'), '512 555 0199');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.phoneDialog.send }));
      expect(await within(dialog).findByText(messages.forms.actionErrors.rate_limited)).toBeVisible();
      expect(within(dialog).queryByLabelText('6-digit code')).not.toBeInTheDocument();
    });

    it('starts over each time the dialog opens', async () => {
      mount();
      await userEvent.click(screen.getByRole('button', { name: 'Change your phone number' }));
      let dialog = await screen.findByRole('dialog');
      await userEvent.type(within(dialog).getByLabelText('Phone number'), '512 555 0199');
      await userEvent.click(within(dialog).getByRole('button', { name: account.contact.phoneDialog.send }));
      await within(dialog).findByLabelText('6-digit code');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: 'Change your phone number' }));
      dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Phone number')).toHaveValue('');
    });
  });
});

