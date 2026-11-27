/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserPageData } from '@/contracts';
import { ADMIN_NOW, adminDetectedIps, adminFraudJordan, adminUserFraudData, adminUserJordanData, adminUserNoIpsData, fakeAdminUserHandlers } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import adminFraud from '../../../../messages/en/ui/adminFraud.json';
import { AdminUserScreen } from './admin-user-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

const copy = adminFraud;
function mount(data: AdminUserPageData) {
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminUserScreen data={data} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></NextIntlClientProvider>);
}
const summary = () => within(screen.getByRole('region', { name: copy.title }));
const ipSection = () => within(screen.getByRole('region', { name: copy.ips.title }));
const ipRows = () => ipSection().getAllByRole('listitem').filter((item) => item.parentElement?.parentElement?.getAttribute('aria-label') === copy.ips.title);

describe('the fraud score on the person page', () => {
  it('is absent for staff who don’t get it', () => {
    mount(adminUserJordanData);
    expect(screen.queryByRole('region', { name: copy.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: copy.ips.title })).not.toBeInTheDocument();
  });

  it('shows the final score with its level, then each area with its reasons', () => {
    mount(adminUserFraudData);
    const { fraud } = adminFraudJordan;
    expect(fraud).toMatchObject({ score: 87, level: 'high' });
    expect(summary().getByText('Fraud 87 · High')).toHaveClass('sr-only');
    expect(summary().getByText('87')).toBeInTheDocument();
    const areas = summary().getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(areas).toEqual(['IP addresses', 'ID check', 'Home address', 'Payouts', 'Background check', 'Account']);
    expect(summary().getByText('Fraud 85 · High')).toBeInTheDocument();
    expect(summary().getAllByText(copy.factors.ip_vpn).length).toBeGreaterThan(0);
    expect(summary().getByText('Also used by 3 other accounts')).toBeInTheDocument();
    expect(summary().getByText(copy.notScored.identity)).toBeInTheDocument();
    expect(summary().getByText(copy.notScored.address)).toBeInTheDocument();
    expect(summary().getByText('1 strike')).toBeInTheDocument();
    expect(summary().getAllByText(copy.nothingFound)).toHaveLength(2);
  });

  it('lists every address with its place, network, score and where it was seen', () => {
    mount(adminUserFraudData);
    expect(ipRows()).toHaveLength(adminDetectedIps.length);
    const home = within(ipRows()[0]!);
    expect(home.getByText('Austin, Texas, United States')).toBeInTheDocument();
    expect(home.getByText('AS7922 Comcast Cable Communications, LLC')).toBeInTheDocument();
    expect(home.getByText('Fraud 0 · Low')).toBeInTheDocument();
    expect(home.getByText(copy.ips.networks.residential)).toBeInTheDocument();
    expect(home.getByText(copy.ips.active)).toBeInTheDocument();
    expect(home.getByText('203.0.113.24')).toHaveClass('font-mono');
    expect(home.getByText(/14 sign-ins · Seen in sign-ins and other actions · Last sign-in with an email code/)).toBeInTheDocument();
    const link = home.getByRole('link', { name: `${copy.ips.ipinfoLink} (${copy.ips.opensInNewTab})` });
    expect(link).toHaveAttribute('href', 'https://ipinfo.io/203.0.113.24');
    expect(link.getAttribute('rel')).toContain('noopener');

    const vpn = within(ipRows()[1]!);
    expect(vpn.getByText('Frankfurt am Main, Hesse, Germany')).toBeInTheDocument();
    expect(vpn.getByText('Fraud 85 · High')).toBeInTheDocument();
    expect(vpn.getByText(copy.ips.networks.vpn)).toBeInTheDocument();
    expect(vpn.getByText(copy.factors.ip_outside_us)).toBeInTheDocument();
    expect(vpn.getByText('Also used by 1 other account')).toBeInTheDocument();

    const phone = within(ipRows()[2]!);
    expect(phone.getByText(copy.ips.networks.mobile)).toBeInTheDocument();
    expect(phone.getByText(copy.factors.ip_other_state)).toBeInTheDocument();
  });

  it('says why an address has no score: no answer, a private network, or not looked up', () => {
    mount(adminUserFraudData);
    const byIp = (ip: string) => within(ipRows().find((row) => row.textContent?.includes(ip))!);
    expect(byIp('192.0.2.10').getByText(copy.ips.unavailableReasons.limit)).toBeInTheDocument();
    expect(byIp('192.0.2.10').getByText(copy.ips.noScore)).toBeInTheDocument();
    expect(byIp('2001:db8::5').getByText(copy.ips.unavailableReasons.failed)).toBeInTheDocument();
    expect(byIp('10.0.0.4').getByText(copy.ips.privateAddress)).toBeInTheDocument();
    expect(byIp('10.0.0.4').queryByText(copy.ips.noScore)).not.toBeInTheDocument();
    expect(byIp('10.0.0.4').queryByRole('link')).not.toBeInTheDocument();
    expect(byIp('203.0.113.200').getByText(copy.ips.notLookedUp)).toBeInTheDocument();
    expect(byIp('2001:db8:85a3::8a2e:370:7334').getByText(copy.ips.signUp)).toBeInTheDocument();
    expect(ipSection().getByText('The newest 9 of 12 addresses.')).toBeInTheDocument();
  });

  it('explains an empty list, and still scores the rest', () => {
    mount(adminUserNoIpsData);
    expect(ipSection().getByText(copy.ips.none)).toBeInTheDocument();
    expect(summary().getByText(copy.notScored.ips)).toBeInTheDocument();
  });
});
