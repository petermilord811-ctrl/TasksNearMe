/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionErrorCode } from '@/contracts';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import messages from '../../../../messages/en/ui';
import feedback from '../../../../messages/en/ui/feedback.json';
import forms from '../../../../messages/en/ui/forms.json';
import { FormFeedback } from './form-feedback';

/** jsdom's navigator.onLine is a getter on the prototype: an own property stands in for it, and goes again after. */
function setOffline(on: boolean) {
  if (on) Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
  else delete (window.navigator as unknown as { onLine?: boolean }).onLine;
}
afterEach(() => {
  cleanup();
  setOffline(false);
  vi.restoreAllMocks();
});

const mount = (code: ActionErrorCode) => render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/New_York"><FormFeedback result={{ ok: false, code }} /></TimeZoneProvider></NextIntlClientProvider>);

describe('FormFeedback on a bad connection (bad connections pass, J-N3)', () => {
  it('says the phone is offline when an action got no answer and there is no network', () => {
    setOffline(true);
    mount('unknown');
    expect(screen.getByText(feedback.error.offline)).toBeVisible();
    expect(screen.queryByText(feedback.error.unknown)).toBeNull();
  });

  it('keeps the usual words online, and for an answer the server gave', () => {
    mount('unknown');
    expect(screen.getByText(feedback.error.unknown)).toBeVisible();
    cleanup();
    setOffline(true);
    mount('not_found');
    expect(screen.getByText(feedback.error.not_found)).toBeVisible();
    expect(screen.queryByText(feedback.error.offline)).toBeNull();
  });

  it('goes back to the usual words when the connection returns', () => {
    setOffline(true);
    mount('unknown');
    expect(screen.getByText(feedback.error.offline)).toBeVisible();
    setOffline(false);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByText(feedback.error.unknown)).toBeVisible();
  });
});

describe('FormFeedback after a session ended (bad connections pass, J-N2)', () => {
  const signedOut = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ signedIn: false }), { status: 200, headers: { 'content-type': 'application/json' } }));

  it('says so, with a link to sign in again and come back to this page', async () => {
    window.history.pushState({}, '', '/app/find-work/tsk_desk?offer=1');
    const fetched = signedOut();
    mount('unknown');
    expect(await screen.findByText(feedback.error.signed_out, { exact: false })).toBeVisible();
    expect(screen.getByRole('link', { name: feedback.error.signInAgain })).toHaveAttribute('href', `/sign-in?next=${encodeURIComponent('/app/find-work/tsk_desk?offer=1')}`);
    // Asked once for this failure.
    expect(fetched.mock.calls.filter(([url]) => String(url).endsWith('/api/session'))).toHaveLength(1);
  });

  it('also asks after "not allowed", which a session that ended on the server gives (the cookie was still there)', async () => {
    const fetched = signedOut();
    mount('not_allowed');
    expect(await screen.findByText(feedback.error.signed_out, { exact: false })).toBeVisible();
    expect(fetched.mock.calls.filter(([url]) => String(url).endsWith('/api/session'))).toHaveLength(1);
    cleanup();
    vi.restoreAllMocks();
    // Signed in, it's a real refusal: the usual words (the forms' own, where they have them).
    mount('not_allowed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(forms.actionErrors.not_allowed)).toBeVisible();
    expect(screen.queryByText(feedback.error.signed_out, { exact: false })).toBeNull();
  });

  it('keeps the usual words while signed in, when the check itself fails, and for answers the server gave', async () => {
    mount('unknown');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(feedback.error.unknown)).toBeVisible();
    cleanup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    mount('unknown');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(feedback.error.unknown)).toBeVisible();
    cleanup();
    vi.restoreAllMocks();
    const fetched = signedOut();
    mount('not_found');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(feedback.error.not_found)).toBeVisible();
    expect(fetched).not.toHaveBeenCalled();
  });
});
