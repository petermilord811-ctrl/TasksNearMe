/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserPageData } from '@/contracts';
import { ADMIN_NOW, adminSignInRows, adminUserJordanData, adminUserNoSignInsData, adminUserSignInsData, fakeAdminUserHandlers } from '@/fixtures';
import { formatDateTime } from '@/shared/format';
import uiMessages from '../../../../messages/en/ui';
import adminUser from '../../../../messages/en/ui/adminUser.json';
import adminUsers from '../../../../messages/en/ui/adminUsers.json';
import adminRewards from '../../../../messages/en/ui/adminRewards.json';
import { AdminUserScreen } from './admin-user-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

const copy = adminUser.signIns;
function mount(data: AdminUserPageData) {
  render(<NextIntlClientProvider locale="en" messages={{ ...uiMessages, adminUser, adminUsers, adminRewards }}><AdminUserScreen data={data} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></NextIntlClientProvider>);
}
const section = () => within(screen.getByRole('region', { name: copy.title }));
const rows = () => section().getAllByRole('listitem');

describe('AdminSignIns', () => {
  it('is absent for staff who don’t get sign-ins', () => {
    mount(adminUserJordanData);
    expect(screen.queryByRole('region', { name: copy.title })).not.toBeInTheDocument();
    expect(screen.queryByText(copy.hint)).not.toBeInTheDocument();
  });

  it('shows each sign-in newest first: place, network, address, browser and when', () => {
    mount(adminUserSignInsData);
    expect(section().getByRole('heading', { level: 2, name: copy.title })).toBeInTheDocument();
    expect(rows()).toHaveLength(adminSignInRows.length);
    const phone = within(rows()[0]!);
    expect(phone.getByText('Gainesville, Florida, United States')).toBeInTheDocument();
    expect(phone.getByText('AS7922 Comcast Cable Communications, LLC')).toBeInTheDocument();
    expect(phone.getByText('203.0.113.24')).toHaveClass('font-mono');
    expect(phone.getByText(/Safari on iPhone/)).toBeInTheDocument();
    expect(phone.getByText('Host name: c-203-0-113-24.hsd1.fl.comcast.net')).toBeInTheDocument();
    expect(phone.getByText(formatDateTime(adminSignInRows[0]!.at))).toHaveAttribute('datetime', adminSignInRows[0]!.at);
    const link = phone.getByRole('link', { name: `${copy.ipinfoLink} (${copy.opensInNewTab})` });
    expect(link).toHaveAttribute('href', 'https://ipinfo.io/203.0.113.24');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(phone.getByText(copy.browserDetails)).toBeInTheDocument();
  });

  it('marks a VPN or data center, the sign-up, and an expired sign-in in words', () => {
    mount(adminUserSignInsData);
    const vpn = within(rows()[1]!);
    expect(vpn.getByText('Frankfurt am Main, Hesse, Germany')).toBeInTheDocument();
    expect(vpn.getByText(copy.anonymous)).toBeInTheDocument();
    expect(vpn.getByText(copy.hosting)).toBeInTheDocument();
    expect(within(rows().at(-1)!).getByText(copy.signUp)).toBeInTheDocument();
    const local = within(rows()[5]!);
    expect(local.getByText(copy.expired)).toBeInTheDocument();
    expect(section().getAllByText(copy.signUp)).toHaveLength(1);
    expect(section().getAllByText(copy.expired)).toHaveLength(1);
  });

  it('says when there’s no place: unavailable (and why), unknown, private, or no address', () => {
    mount(adminUserSignInsData);
    const [limit, failed, unknown, local, none] = [2, 3, 4, 5, 6].map((index) => within(rows()[index]!));
    expect(limit!.getByText(copy.unavailable)).toBeInTheDocument();
    expect(limit!.getByText(copy.unavailableReasons.limit)).toBeInTheDocument();
    expect(failed!.getByText(copy.unavailableReasons.failed)).toBeInTheDocument();
    expect(unknown!.getByText(copy.placeUnknown)).toBeInTheDocument();
    expect(unknown!.getByText('AS64500 Example Networks')).toBeInTheDocument();
    expect(local!.getByText(copy.privateAddress)).toBeInTheDocument();
    expect(local!.getByText(/Unknown browser/)).toBeInTheDocument();
    expect(local!.queryByRole('link')).not.toBeInTheDocument();
    expect(none!.getByText(copy.noAddress)).toBeInTheDocument();
    expect(none!.getByText('Chrome on Android')).toBeInTheDocument();
    expect(section().getAllByRole('link')).toHaveLength(adminSignInRows.filter((row) => row.ipinfoUrl).length);
  });

  it('explains an empty list', () => {
    mount(adminUserNoSignInsData);
    expect(section().getByText(copy.none)).toBeInTheDocument();
    expect(section().queryByRole('listitem')).not.toBeInTheDocument();
  });
});
