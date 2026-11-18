/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { Activity, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAuditPageData } from '@/contracts';
import {
  adminAuditData, adminBookingsSearchData, adminPaymentsExceptionsData, adminUsersSearchData, findWorkPageData, portalFeedData, taskBoardFilteredData,
} from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { PortalSearch } from '@/ui/components/portal/portal-header';
import { BoardFilters } from '@/ui/components/search/board-filters';
import { AdminAuditScreen } from '@/ui/screens/admin/admin-audit-screen';
import { AdminBookingsScreen } from '@/ui/screens/admin/admin-bookings-screen';
import { AdminPaymentsScreen } from '@/ui/screens/admin/admin-payments-screen';
import { AdminUsersScreen } from '@/ui/screens/admin/admin-users-screen';
import { FindWorkFilters } from '@/ui/screens/work/find-work-filters';
import { UrlForm } from './url-form';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const now = '2026-11-24T16:00:00.000Z';

/**
 * Next keeps a page you leave alive but hidden (React Activity) and shows it again as it was left, on Back or a link
 * to the same URL (Clear): `leaveAndComeBack` does the same to whatever `page` renders.
 */
const at = (mode: 'visible' | 'hidden', page: ReactNode) => <Activity mode={mode}><NextIntlClientProvider locale="en" messages={uiMessages}><TimeZoneProvider timeZone="America/Chicago">{page}</TimeZoneProvider></NextIntlClientProvider></Activity>;
function shownThenRestored(page: ReactNode) {
  const view = render(at('visible', page));
  return { view, leaveAndComeBack: () => { view.rerender(at('hidden', page)); view.rerender(at('visible', page)); } };
}

describe('UrlForm', () => {
  it('goes back to its URL values when the router hides it, and starts over when the URL changes under it', () => {
    const form = (q: string) => <UrlForm urlKey={q} role="search" aria-label="Search"><input name="q" aria-label="Words" defaultValue={q} /></UrlForm>;
    const { view, leaveAndComeBack } = shownThenRestored(form('desk'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Words' }), { target: { value: 'desk chair' } });
    leaveAndComeBack();
    expect(screen.getByRole('textbox', { name: 'Words' })).toHaveValue('desk');
    fireEvent.change(screen.getByRole('textbox', { name: 'Words' }), { target: { value: 'typed' } });
    // The same form given another URL's values (no remount of the page): its fields start over from them.
    view.rerender(at('visible', form('shelf')));
    expect(screen.getByRole('textbox', { name: 'Words' })).toHaveValue('shelf');
  });
});

describe('filter forms show their URL when the router shows a page it kept (sweep D10, everywhere)', () => {
  it('find work: the search in the filters sheet', async () => {
    const user = userEvent.setup();
    const { leaveAndComeBack } = shownThenRestored(<FindWorkFilters data={findWorkPageData} />);
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'tape and boxes' } });
    leaveAndComeBack();
    expect(within(await screen.findByRole('dialog')).getByRole('searchbox')).toHaveValue(findWorkPageData.query.q ?? '');
  });

  it("the neighborhood portal's search", () => {
    const { leaveAndComeBack } = shownThenRestored(<PortalSearch data={{ query: { ...portalFeedData.query, q: 'ladder' } }} id="portal-q" />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the neighborhood' }), { target: { value: 'ladder and drill' } });
    leaveAndComeBack();
    expect(screen.getByRole('searchbox', { name: 'Search the neighborhood' })).toHaveValue('ladder');
  });

  it("the public board's search and price range", () => {
    const { leaveAndComeBack } = shownThenRestored(<BoardFilters board={taskBoardFilteredData} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'assemble a bed' } });
    fireEvent.change(screen.getByLabelText(uiMessages.taskBoard.priceRange.min), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(uiMessages.taskBoard.priceRange.max), { target: { value: '500' } });
    leaveAndComeBack();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('assemble');
    expect(screen.getByLabelText(uiMessages.taskBoard.priceRange.min)).toHaveValue(String(taskBoardFilteredData.query.minPrice));
    expect(screen.getByLabelText(uiMessages.taskBoard.priceRange.max)).toHaveValue(String(taskBoardFilteredData.query.maxPrice));
  });

  it("staff's audit log filters, the selects too", () => {
    const data: AdminAuditPageData = { ...adminAuditData, filters: { actor: 'taylor', targetId: 'tsk_desk' } };
    const { leaveAndComeBack } = shownThenRestored(<AdminAuditScreen data={data} now={now} />);
    const form = screen.getByRole('form', { name: uiMessages.adminAudit.filters });
    const [action] = within(form).getAllByRole('combobox');
    fireEvent.change(within(form).getByLabelText(uiMessages.adminAudit.actor), { target: { value: 'someone else' } });
    fireEvent.change(action!, { target: { value: (action as HTMLSelectElement).options[1]!.value } });
    leaveAndComeBack();
    expect(within(form).getByLabelText(uiMessages.adminAudit.actor)).toHaveValue('taylor');
    expect(within(form).getByLabelText(uiMessages.adminAudit.targetId)).toHaveValue('tsk_desk');
    expect(action).toHaveValue('');
  });

  it.each([
    ['people', () => <AdminUsersScreen data={adminUsersSearchData} now={now} />, adminUsersSearchData.query],
    ['payments', () => <AdminPaymentsScreen data={{ ...adminPaymentsExceptionsData, query: 'desk' }} now={now} />, 'desk'],
    ['bookings', () => <AdminBookingsScreen data={adminBookingsSearchData} now={now} />, adminBookingsSearchData.query],
  ])("staff's %s search", (_name, page, query) => {
    const { leaveAndComeBack } = shownThenRestored(page());
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'something else' } });
    leaveAndComeBack();
    expect(screen.getByRole('searchbox')).toHaveValue(query);
  });
});
