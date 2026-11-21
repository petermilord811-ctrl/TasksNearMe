/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActionErrorCode } from '@/contracts';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import messages from '../../../../messages/en/ui';
import feedback from '../../../../messages/en/ui/feedback.json';
import { FormFeedback } from './form-feedback';

/** jsdom's navigator.onLine is a getter on the prototype: an own property stands in for it, and goes again after. */
function setOffline(on: boolean) {
  if (on) Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
  else delete (window.navigator as unknown as { onLine?: boolean }).onLine;
}
afterEach(() => {
  cleanup();
  setOffline(false);
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
