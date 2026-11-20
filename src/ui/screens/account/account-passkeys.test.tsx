/** @vitest-environment jsdom */
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../messages/en/ui';
import { AccountPasskeys } from './account-passkeys';

const webauthn = vi.hoisted(() => ({ supported: true, startRegistration: vi.fn(async () => ({ id: 'cred_1', rawId: 'cred_1', response: {}, type: 'public-key', clientExtensionResults: {} })) }));
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => webauthn.supported, startRegistration: webauthn.startRegistration }));
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); webauthn.supported = true; });

const t = messages.account.passkeys;
function makeHandlers() {
  return {
    onPasskeyRegistrationOptions: vi.fn(async () => ({ ok: true as const, options: { challenge: 'abc', rp: { name: 'TasksNearMe' } } })),
    onAddPasskey: vi.fn(async () => ({ ok: true as const, code: 'saved' as const })),
    onRemovePasskey: vi.fn(async () => ({ ok: true as const, code: 'updated' as const })),
  };
}
function mount(passkeys: Parameters<typeof AccountPasskeys>[0]['passkeys'] = []) {
  const handlers = makeHandlers();
  render(<NextIntlClientProvider locale="en" messages={messages}><AccountPasskeys passkeys={passkeys} handlers={handlers} /></NextIntlClientProvider>);
  return handlers;
}

describe('AccountPasskeys', () => {
  it('adds a passkey: the device’s prompt with the server’s options, then its answer with a name', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    expect(screen.getByText(t.none)).toBeInTheDocument();
    await user.type(screen.getByLabelText(t.nameLabel), 'Work laptop');
    await user.click(screen.getByRole('button', { name: t.add }));
    await waitFor(() => expect(handlers.onAddPasskey).toHaveBeenCalledOnce());
    expect(webauthn.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'abc', rp: { name: 'TasksNearMe' } } });
    expect(handlers.onAddPasskey).toHaveBeenCalledWith({ response: expect.objectContaining({ id: 'cred_1' }), name: 'Work laptop' });
    expect(await screen.findByText(t.added)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('saves nothing when the person closes the prompt', async () => {
    const user = userEvent.setup();
    webauthn.startRegistration.mockRejectedValueOnce(new Error('NotAllowedError'));
    const handlers = mount();
    await user.click(screen.getByRole('button', { name: t.add }));
    expect(await screen.findByText(t.cancelled)).toBeInTheDocument();
    expect(handlers.onAddPasskey).not.toHaveBeenCalled();
  });

  it('lists passkeys with when they were added, and removes one', async () => {
    const user = userEvent.setup();
    const handlers = mount([{ id: 'pky_1', name: 'iPhone', createdAt: '2026-11-18T15:00:00.000Z', backedUp: true }]);
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t.synced))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove passkey iPhone' }));
    await waitFor(() => expect(handlers.onRemovePasskey).toHaveBeenCalledWith({ id: 'pky_1' }));
    expect(await screen.findByText(t.removed)).toBeInTheDocument();
  });

  it('hydrates without moving anything: the server’s HTML is already the add form a browser with passkeys shows', async () => {
    // Drawn as "can't use passkeys" on the server, the section grew by the form when the page hydrated, and a press
    // below it made before then was released beside its target (the Ship run's "Download my data" at eb8cba5).
    const tree = <NextIntlClientProvider locale="en" messages={messages}><AccountPasskeys passkeys={[]} handlers={makeHandlers()} /></NextIntlClientProvider>;
    const container = document.body.appendChild(document.createElement('div'));
    let root = null as Root | null;
    try {
      container.innerHTML = renderToString(tree);
      // Hydrating lifts what only waits for it (src/ui/primitives/gated.tsx); nothing else may change.
      const settled = () => container.innerHTML.replace(/ (?:data-hydrating|aria-disabled|readonly)(?:="[^"]*")?/g, '');
      const server = settled();
      expect(screen.getByLabelText(t.nameLabel)).toBeInTheDocument();
      await act(async () => {
        root = hydrateRoot(container, tree);
      });
      expect(settled()).toBe(server);
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });

  it('says so where the browser has no passkeys', () => {
    webauthn.supported = false;
    mount();
    expect(screen.getByText(t.unsupported)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.add })).not.toBeInTheDocument();
  });
});
