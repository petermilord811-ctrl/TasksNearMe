/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult } from '@/contracts';
import { clientInvite, clientInvitePrefilled, clientInviteResults } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { ClientInviteScreen } from './client-invite-screen';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const renderUi = (ui: ReactElement, locale: 'en' | 'es' = 'en') => render(<NextIntlClientProvider locale={locale} timeZone="America/New_York" messages={locale === 'es' ? esMessages : uiMessages}>{ui}</NextIntlClientProvider>);
const resolved = (result: ActionResult) => vi.fn(async () => result);

describe('booking help while a market opens soon (J-V8)', () => {
  it('says the market opens soon and why, offers the waitlist, and sends a code from a link', async () => {
    const onRedeem = resolved(clientInviteResults.redeemed);
    renderUi(<ClientInviteScreen data={clientInvitePrefilled} handlers={{ onRedeem }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Gainesville opens soon' })).toBeTruthy();
    expect(screen.getByText('Helpers in Gainesville are joining now. Until we open to everyone, booking help is by invitation.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe(routes.waitlist({ from: 'beta' }));
    expect((screen.getByLabelText('Invite code') as HTMLInputElement).value).toBe('GNV4KQ7P');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onRedeem).toHaveBeenCalledWith({ inviteCode: 'GNV4KQ7P' }));
  });

  it("says a helper code isn't the one for posting", async () => {
    const onRedeem = resolved(clientInviteResults.forHelpers);
    renderUi(<ClientInviteScreen data={clientInvite} handlers={{ onRedeem }} />);
    await userEvent.type(screen.getByLabelText('Invite code'), 'HLPR7Q2M');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('This invite is for helpers. Posting a task or booking a helper needs a client invite.')).toBeTruthy();
  });

  it('reads in Spanish', () => {
    renderUi(<ClientInviteScreen data={clientInvite} handlers={{ onRedeem: resolved(clientInviteResults.redeemed) }} />, 'es');
    expect(screen.getByRole('heading', { level: 1, name: 'Gainesville abre pronto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  });
});
