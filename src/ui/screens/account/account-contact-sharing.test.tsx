/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELPER_CONTACT_EARNED_MIN, type AccountPageData, type ActionResult } from '@/contracts';
import account from '../../../../messages/en/ui/account.json';
import { AccountContactSharing } from './account-contact-sharing';

afterEach(() => cleanup());

const onSave = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));

function mount(sharing: NonNullable<AccountPageData['contactSharing']>) {
  return render(<NextIntlClientProvider locale="en" messages={{ account }}>
    <AccountContactSharing sharing={sharing} onSave={onSave} />
  </NextIntlClientProvider>);
}

const options = () => screen.getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value);

describe('contact details on your profile', () => {
  it('offers every choice where a phone can be verified', () => {
    mount({ setting: 'none', phoneVerified: false, at: HELPER_CONTACT_EARNED_MIN });
    expect(options()).toEqual(['none', 'email', 'phone', 'email_phone']);
    expect(screen.queryByText(account.contactSharing.phoneUnavailable)).toBeNull();
  });

  it("doesn't offer the phone where texts are off and it isn't verified, and says why (sweep 2026-11-24 A6)", () => {
    mount({ setting: 'none', phoneVerified: false, at: HELPER_CONTACT_EARNED_MIN, phoneUnavailable: true });
    expect(options()).toEqual(['none', 'email']);
    expect(screen.getByText(account.contactSharing.phoneUnavailable)).toBeTruthy();
    expect(screen.queryByText(account.contactSharing.phoneUnverified)).toBeNull();
  });

  it('keeps a phone choice made earlier listed, so it can be changed', () => {
    mount({ setting: 'email_phone', phoneVerified: false, at: HELPER_CONTACT_EARNED_MIN, phoneUnavailable: true });
    expect(options()).toEqual(['none', 'email', 'email_phone']);
    expect((screen.getByRole('radio', { checked: true }) as HTMLInputElement).value).toBe('email_phone');
  });
});
