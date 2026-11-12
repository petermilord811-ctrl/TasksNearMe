/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_BOOKING_FILTERS, ADMIN_BOOKING_FLAGS, TASK_MODERATION_ACTIONS, routes, type AdminTaskHandlers, type AdminTaskPageData } from '@/contracts';
import {
  ADMIN_NOW,
  adminAuditData,
  adminAuditEmptyData,
  adminBookingsAttentionData,
  adminBookingsEmptyData,
  adminBookingsSearchData,
  adminTaskHiddenData,
  adminTaskOpenData,
  adminTaskReadOnlyData,
  fakeHandler,
} from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import adminAudit from '../../../../messages/en/ui/adminAudit.json';
import adminBookings from '../../../../messages/en/ui/adminBookings.json';
import adminTask from '../../../../messages/en/ui/adminTask.json';
import { AdminAuditScreen } from './admin-audit-screen';
import { AdminBookingsScreen } from './admin-bookings-screen';
import { AdminTaskScreen } from './admin-task-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('copy', () => {
  it('has a label for every filter, flag and moderation action', () => {
    for (const filter of ADMIN_BOOKING_FILTERS) expect(adminBookings.filters[filter]).toMatch(/\S/);
    for (const flag of ADMIN_BOOKING_FLAGS) expect(adminBookings.flags[flag]).toMatch(/\S/);
    for (const action of TASK_MODERATION_ACTIONS) {
      expect(adminTask.actions[action]).toMatch(/\S/);
      expect(adminTask.descriptions[action]).toMatch(/\S/);
    }
  });
});

describe('AdminBookingsScreen', () => {
  it('links each tab with the search kept, and the search is a GET form on the route builder', () => {
    render(withMessages(<AdminBookingsScreen data={adminBookingsSearchData} now={ADMIN_NOW} />));
    const tabs = within(screen.getByRole('navigation', { name: adminBookings.filtersLabel }));
    for (const filter of ADMIN_BOOKING_FILTERS) {
      expect(tabs.getByRole('link', { name: new RegExp(`^${adminBookings.filters[filter]}`) })).toHaveAttribute('href', routes.admin.bookings({ filter, q: 'maya' }));
    }
    expect(tabs.getByRole('link', { name: /^All/ })).toHaveAttribute('aria-current', 'page');
    const form = screen.getByRole('search', { name: adminBookings.search });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', routes.admin.bookings());
    expect(screen.getByRole('link', { name: adminBookings.clearSearch })).toHaveAttribute('href', routes.admin.bookings({ filter: 'all' }));
  });

  it('shows each booking with its flags and links to the booking and the people', () => {
    render(withMessages(<AdminBookingsScreen data={adminBookingsAttentionData} now={ADMIN_NOW} />));
    const [first] = adminBookingsAttentionData.rows;
    expect(screen.getAllByRole('link', { name: first!.title })[0]).toHaveAttribute('href', routes.admin.booking(first!.id));
    expect(screen.getAllByRole('link', { name: first!.client.displayName })[0]).toHaveAttribute('href', routes.admin.user(first!.client.id));
    for (const flag of new Set(adminBookingsAttentionData.rows.flatMap((row) => row.flags))) {
      expect(screen.getAllByText(adminBookings.flags[flag]).length).toBeGreaterThan(0);
    }
  });

  it('says so when nothing needs attention', () => {
    render(withMessages(<AdminBookingsScreen data={adminBookingsEmptyData} now={ADMIN_NOW} />));
    expect(screen.getByText(adminBookings.emptyAttention)).toBeInTheDocument();
  });
});

describe('AdminTaskScreen', () => {
  function mount(data: AdminTaskPageData = adminTaskOpenData) {
    const onModerate = vi.fn<AdminTaskHandlers['onModerate']>(fakeHandler({ ok: true, code: 'updated' }, 0));
    render(withMessages(<AdminTaskScreen data={data} handlers={{ onModerate }} now={ADMIN_NOW} />));
    return onModerate;
  }

  it('offers only the supplied actions, and reads only for staff without them', () => {
    mount();
    const group = within(screen.getByRole('group', { name: adminTask.actionsLabel }));
    expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual(adminTaskOpenData.actions.map((action) => adminTask.actions[action]));
    cleanup();
    mount(adminTaskReadOnlyData);
    expect(screen.queryByRole('group', { name: adminTask.actionsLabel })).not.toBeInTheDocument();
    expect(screen.getByText(adminTask.readOnly)).toBeInTheDocument();
  });

  it('shows who hid a task and why', () => {
    mount(adminTaskHiddenData);
    expect(screen.getByRole('heading', { name: adminTask.hiddenTitle })).toBeInTheDocument();
    expect(screen.getByText(adminTaskHiddenData.task.hidden!.reason)).toBeInTheDocument();
  });

  it('needs a reason, then hides the task with it', async () => {
    const user = userEvent.setup();
    const onModerate = mount();
    await user.click(screen.getByRole('button', { name: adminTask.actions.hide_task }));
    const dialog = within(screen.getByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: adminTask.actions.hide_task }));
    expect(await dialog.findByText(adminTask.dialog.reasonRequired)).toBeInTheDocument();
    expect(onModerate).not.toHaveBeenCalled();
    await user.type(dialog.getByLabelText(adminTask.dialog.reason), 'Asks helpers to bring cash for parts.');
    await user.click(dialog.getByRole('button', { name: adminTask.actions.hide_task }));
    await waitFor(() => expect(onModerate).toHaveBeenCalledWith({ action: 'hide_task', reason: 'Asks helpers to bring cash for parts.' }));
    expect(await screen.findByText(adminTask.updated)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('sends the chosen photo, or the chosen category, with the reason', async () => {
    const user = userEvent.setup();
    const onModerate = mount();
    await user.click(screen.getByRole('button', { name: adminTask.actions.remove_photo }));
    let dialog = within(screen.getByRole('alertdialog'));
    await user.click(dialog.getByRole('radio', { name: adminTask.dialog.photoOption.replace('{number}', '2') }));
    await user.type(dialog.getByLabelText(adminTask.dialog.reason), 'The photo shows the street number.');
    await user.click(dialog.getByRole('button', { name: adminTask.actions.remove_photo }));
    await waitFor(() => expect(onModerate).toHaveBeenCalledWith({ action: 'remove_photo', photoId: adminTaskOpenData.photos[1]!.id, reason: 'The photo shows the street number.' }));

    await user.click(await screen.findByRole('button', { name: adminTask.actions.recategorize }));
    dialog = within(screen.getByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: adminTask.actions.recategorize }));
    expect(await dialog.findByText(adminTask.dialog.categoryRequired)).toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText(adminTask.dialog.category), 'moving-help');
    await user.type(dialog.getByLabelText(adminTask.dialog.reason), 'Moving furniture, not assembly.');
    await user.click(dialog.getByRole('button', { name: adminTask.actions.recategorize }));
    await waitFor(() => expect(onModerate).toHaveBeenLastCalledWith({ action: 'recategorize', categorySlug: 'moving-help', reason: 'Moving furniture, not assembly.' }));
  });
});

describe('AdminAuditScreen', () => {
  it('filters with a GET form, links targets, and loads older entries with the cursor', () => {
    render(withMessages(<AdminAuditScreen data={adminAuditData} now={ADMIN_NOW} />));
    const form = screen.getByRole('form', { name: adminAudit.filters });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', routes.admin.audit());
    expect(screen.getAllByRole('link', { name: /tsk_desk/ })[0]).toHaveAttribute('href', routes.admin.task('tsk_desk'));
    expect(screen.getByRole('link', { name: adminAudit.older })).toHaveAttribute('href', routes.admin.audit({ before: adminAuditData.nextCursor }));
    expect(screen.getAllByText(adminAudit.system).length).toBeGreaterThan(0);
  });

  it('offers to clear the filters when nothing matches', () => {
    render(withMessages(<AdminAuditScreen data={adminAuditEmptyData} now={ADMIN_NOW} />));
    expect(screen.getByText(adminAudit.emptyTitle)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: adminAudit.clear })[0]).toHaveAttribute('href', routes.admin.audit());
  });
});
