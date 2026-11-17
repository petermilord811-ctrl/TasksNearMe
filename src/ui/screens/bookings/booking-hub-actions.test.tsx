/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, routes, type ActionResult, type BookingHubHandlers, type BookingView } from '@/contracts';
import { deskBookingHelperConfirmed, deskBookingHelperDayOf, deskBookingPosterCantAccessReported, deskBookingPosterCompletionSubmitted, deskBookingPosterConfirmed, deskBookingPosterNoShowNotYet, deskBookingPosterWithSheets, fakeBookingSheetHandlers, fakeHandler } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { BookingHubActions } from './booking-hub-actions';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(data: BookingView = deskBookingHelperDayOf, onAction = vi.fn(fakeHandler<{ action: Parameters<BookingHubHandlers['onAction']>[0]['action'] }>({ ok: true, code: 'updated' }, 0))) {
  return { onAction, ...render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago"><BookingHubActions data={data} handlers={{ onAction }} sheets={fakeBookingSheetHandlers} /></TimeZoneProvider></NextIntlClientProvider>) };
}

describe('BookingHubActions', () => {
  it('links the supplied rebooking action to the proposal form without calling a mutation', () => {
    const { onAction } = mount({ ...deskBookingHelperConfirmed, actions: [{ id: 'offer_rebook', kind: 'secondary', enabled: true }] });
    const link = screen.getByRole('link', { name: messages.actions.offer_rebook });
    expect(link).toHaveAttribute('href', routes.app.bookingRebook(deskBookingHelperConfirmed.id));
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps disabled rebooking visible with its reason and no destination', () => {
    mount({ ...deskBookingHelperConfirmed, actions: [{ id: 'offer_rebook', kind: 'secondary', enabled: false, disabledReason: { code: 'not_allowed' } }] });
    const link = screen.getByRole('link', { name: messages.actions.offer_rebook });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAccessibleDescription(messages.actionReasons.not_allowed);
  });

  it('links the supplied book-again action with the helper and past booking id', () => {
    const { onAction } = mount({ ...deskBookingPosterConfirmed, actions: [{ id: 'book_again', kind: 'secondary', enabled: true }] });
    const link = screen.getByRole('link', { name: messages.actions.book_again });
    expect(link).toHaveAttribute('href', routes.app.requestHelper(deskBookingPosterConfirmed.helper.handle, { fromBookingId: deskBookingPosterConfirmed.id }));
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('preserves the disabled book-again reason without enabling navigation', () => {
    mount({ ...deskBookingPosterConfirmed, actions: [{ id: 'book_again', kind: 'secondary', enabled: false, disabledReason: { code: 'not_allowed' } }] });
    const link = screen.getByRole('link', { name: messages.actions.book_again });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAccessibleDescription(messages.actionReasons.not_allowed);
  });

  it('links the supplied propose-change action to the form without calling a mutation', () => {
    const { onAction } = mount({ ...deskBookingPosterConfirmed, actions: [{ id: 'propose_change', kind: 'secondary', enabled: true }] });
    const link = screen.getByRole('link', { name: messages.actions.propose_change });
    expect(link).toHaveAttribute('href', routes.app.bookingProposeChange(deskBookingPosterConfirmed.id));
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('preserves a disabled proposal and its reason without enabling navigation', () => {
    mount({ ...deskBookingPosterConfirmed, actions: [{ id: 'propose_change', kind: 'secondary', enabled: false, disabledReason: { code: 'not_allowed' } }] });
    const link = screen.getByRole('link', { name: messages.actions.propose_change });
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAccessibleDescription(messages.actionReasons.not_allowed);
  });

  it.each(['cancel', 'running_late', 'report_no_show', 'cant_access', 'safety_report'] as const)('opens %s as a sheet without calling the single-tap handler', async (id) => {
    const { onAction } = mount({ ...deskBookingPosterWithSheets, actions: [{ id, kind: 'secondary', enabled: true }] });
    await userEvent.click(screen.getByRole('button', { name: messages.actions[id] }));
    expect(screen.queryByRole('dialog') ?? screen.queryByRole('alertdialog')).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps im_here a single tap and places the supplied response deadline beside it', async () => {
    const { onAction } = mount(deskBookingPosterCantAccessReported);
    const action = screen.getByRole('button', { name: messages.actions.im_here });
    const bar = action.closest('[role="group"]')!.parentElement!;
    expect(bar).toHaveTextContent('Answer by 11:20 am or the booking is canceled');
    await userEvent.click(action);
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ action: 'im_here' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Updated')).toBeVisible();
  });

  it('uses an alert dialog when a sheet action descriptor requires confirmation and restores focus on close', async () => {
    const { onAction } = mount({ ...deskBookingHelperDayOf, actions: [{ id: 'running_late', kind: 'secondary', enabled: true, confirm: true }] });
    const trigger = screen.getByRole('button', { name: messages.actions.running_late });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: messages.bookingSheets.back }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('does not open a no-show sheet before the supplied availability time', async () => {
    const { onAction } = mount(deskBookingPosterNoShowNotYet);
    const action = screen.getByRole('button', { name: messages.actions.report_no_show });
    expect(action).toBeDisabled();
    expect(action).toHaveAccessibleDescription('Available at 11:00 am');
    await userEvent.click(action);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('reserves the measured mobile bar height and releases it on unmount', () => {
    let notifyResize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyResize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 100 } as DOMRect);
    const onAction = vi.fn(fakeHandler<Parameters<BookingHubHandlers['onAction']>[0]>({ ok: true, code: 'updated' }, 0));
    const { container, unmount } = render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago"><div data-booking-hub><BookingHubActions data={deskBookingHelperDayOf} handlers={{ onAction }} sheets={fakeBookingSheetHandlers} /></div></TimeZoneProvider></NextIntlClientProvider>);
    const page = container.querySelector<HTMLElement>('[data-booking-hub]')!;
    expect(page.style.getPropertyValue('--booking-actions-height')).toBe('100px');
    bounds.mockReturnValue({ height: 240 } as DOMRect);
    act(notifyResize);
    expect(page.style.getPropertyValue('--booking-actions-height')).toBe('240px');
    expect(onAction).not.toHaveBeenCalled();
    unmount();
    expect(page.style.getPropertyValue('--booking-actions-height')).toBe('');
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('runs the supplied action and refreshes an updated booking', async () => {
    const { onAction } = mount();
    await userEvent.click(screen.getByRole('button', { name: messages.actions.arrived }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ action: 'arrived' });
    expect(await screen.findByText('Updated')).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledExactlyOnceWith();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('navigates to redirectTo without also refreshing', async () => {
    const destination = routes.app.booking(deskBookingHelperDayOf.id);
    mount(undefined, vi.fn(fakeHandler({ ok: true, code: 'updated', redirectTo: destination }, 0)));
    await userEvent.click(screen.getByRole('button', { name: messages.actions.arrived }));
    expect(await screen.findByText('Updated')).toBeVisible();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(destination);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('requires confirmation, restores focus on cancel, and submits only after confirming', async () => {
    const { onAction } = mount(deskBookingPosterCompletionSubmitted);
    const approve = screen.getByRole('button', { name: 'Approve task' });
    await userEvent.click(approve);
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Go back' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(approve).toHaveFocus();
    await userEvent.click(approve);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith({ action: 'approve' });
  });

  it('keeps disabled actions visible with their reason', async () => {
    const { onAction } = mount(deskBookingHelperConfirmed);
    const action = screen.getByRole('button', { name: messages.actions.on_my_way });
    expect(action).toBeDisabled();
    expect(action).toHaveAccessibleDescription('Available at 8:30 am');
    await userEvent.click(action);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders the calendar as a download in its given order, without calling onAction', () => {
    const { onAction, container } = mount(deskBookingPosterConfirmed);
    const calendar = screen.getByRole('link', { name: 'Add to calendar' });
    expect(calendar).toHaveAttribute('href', routes.app.bookingCalendar(deskBookingPosterConfirmed.id));
    expect(calendar).toHaveAttribute('download');
    calendar.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(calendar);
    expect(onAction).not.toHaveBeenCalled();
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (node) => node.getAttribute('data-action-id'))).toEqual(deskBookingPosterConfirmed.actions.map((action) => action.id));
  });

  it('respects a confirmation on a calendar link', async () => {
    const { onAction } = mount({ ...deskBookingPosterConfirmed, actions: [{ id: 'add_to_calendar', kind: 'secondary', enabled: true, confirm: true }] });
    await userEvent.click(screen.getByRole('link', { name: 'Add to calendar' }));
    expect(onAction).not.toHaveBeenCalled();
    const confirmation = within(screen.getByRole('alertdialog')).getByRole('link', { name: 'Confirm' });
    expect(confirmation).toHaveAttribute('href', routes.app.bookingCalendar(deskBookingPosterConfirmed.id));
    expect(confirmation).toHaveAttribute('download');
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('disables the entire bar, including calendar downloads, while pending and prevents duplicate requests', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onAction = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount({ ...deskBookingHelperDayOf, actions: [...deskBookingHelperDayOf.actions, { id: 'add_to_calendar', kind: 'secondary', enabled: true }] }, onAction);
    const arrived = screen.getByRole('button', { name: messages.actions.arrived });
    fireEvent.click(arrived);
    fireEvent.click(arrived);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(arrived).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('group', { name: 'Available actions' })).toHaveAttribute('aria-busy', 'true');
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    const calendar = screen.getByRole('link', { name: 'Add to calendar' });
    expect(calendar).toHaveAttribute('aria-disabled', 'true');
    expect(calendar).not.toHaveAttribute('href');
    fireEvent.click(calendar);
    expect(onAction).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(arrived).toBeEnabled();
    expect(calendar).toHaveAttribute('href', routes.app.bookingCalendar(deskBookingHelperDayOf.id));
  });

  it.each(['not_allowed', 'version_conflict'] as const)('offers a reload for %s', async (code) => {
    mount(undefined, vi.fn(fakeHandler({ ok: false, code }, 0)));
    await userEvent.click(screen.getByRole('button', { name: messages.actions.arrived }));
    const reload = await screen.findByRole('button', { name: 'Reload booking' });
    expect(navigation.refresh).not.toHaveBeenCalled();
    await userEvent.click(reload);
    expect(navigation.refresh).toHaveBeenCalledExactlyOnceWith();
  });

  it('shows retryAt in Central time after a rate limit', async () => {
    mount(undefined, vi.fn(fakeHandler({ ok: false, code: 'rate_limited', retryAt: '2026-11-21T16:05:00.000Z' }, 0)));
    await userEvent.click(screen.getByRole('button', { name: messages.actions.arrived }));
    expect(await screen.findByText(/Try again after Sat, Nov 21.*10:05 am.*Central time/)).toBeVisible();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('provides inline friendly feedback for %s', async (code) => {
    mount(undefined, vi.fn(fakeHandler({ ok: false, code }, 0)));
    await userEvent.click(screen.getByRole('button', { name: messages.actions.arrived }));
    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent(code === 'not_allowed' ? 'This booking changed.' : messages.feedback.error[code]);
    expect(within(feedback).getByRole('link', { name: 'Visit the help center' })).toHaveAttribute('href', routes.help());
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('recovers from a rejected handler promise', async () => {
    mount(undefined, vi.fn(async (): Promise<ActionResult> => { throw new Error('Offline'); }));
    await userEvent.click(screen.getByRole('button', { name: messages.actions.arrived }));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('button', { name: messages.actions.arrived })).toBeEnabled();
  });
});
