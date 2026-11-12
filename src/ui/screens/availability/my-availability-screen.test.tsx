/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVAILABILITY_ACTION_IDS, AVAILABILITY_STATUSES, routes, type ActionResult, type AvailabilityHandlers, type AvailabilityPostInput, type MyAvailabilityPageData } from '@/contracts';
import { fakeHandler, movingPostBooked, myAvailabilityAtLimitData, myAvailabilityData, myAvailabilityEmptyData, myAvailabilityNotBookableData, sundayPostHeld, yardPostActive } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { MyAvailabilityScreen } from './my-availability-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = '2026-12-08T16:00:00.000Z';
const copy = messages.availability;
const service = () => screen.getByRole('combobox', { name: copy.category });
const date = () => screen.getByLabelText(copy.date);
const start = () => screen.getByRole('combobox', { name: copy.startTime });
const end = () => screen.getByRole('combobox', { name: copy.endTime });
const submit = () => screen.getByRole('button', { name: copy.create });
const form = () => screen.getByRole('form', { name: copy.newSlot });

function mount(data: MyAvailabilityPageData = myAvailabilityEmptyData, overrides: Partial<AvailabilityHandlers> = {}) {
  const handlers: AvailabilityHandlers = {
    onCreate: vi.fn(fakeHandler<AvailabilityPostInput>({ ok: true, code: 'saved' }, 0)),
    onCancel: vi.fn(fakeHandler<{ postId: string }>({ ok: true, code: 'canceled' }, 0)),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><MyAvailabilityScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

function fillSchedule(day = '2026-12-12') {
  fireEvent.change(date(), { target: { value: day } });
  fireEvent.change(start(), { target: { value: '09:00' } });
  fireEvent.change(end(), { target: { value: '13:00' } });
}

describe('MyAvailabilityScreen', () => {
  it('uses bookable categories, pre-fills their prices, and submits cents with market-local strings', async () => {
    const { handlers } = mount();
    expect(within(service()).getAllByRole('option').map((option) => (option as HTMLOptionElement).value)).toEqual(['', ...myAvailabilityEmptyData.setup.bookableCategories]);
    expect(screen.getByRole('textbox', { name: copy.price })).toHaveValue('45');
    fireEvent.change(service(), { target: { value: 'moving-help' } });
    expect(screen.getByRole('textbox', { name: copy.rate })).toHaveValue('35');
    expect(screen.getByRole('spinbutton', { name: copy.estimatedHours })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: copy.hoursCap })).toHaveValue(2);
    fireEvent.change(service(), { target: { value: 'yard-cleanup' } });
    expect(screen.getByRole('textbox', { name: copy.rate })).toHaveValue('30');
    fireEvent.change(screen.getByRole('textbox', { name: copy.rate }), { target: { value: '30.25' } });
    fillSchedule();
    fireEvent.submit(form());
    await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledExactlyOnceWith({
      categorySlug: 'yard-cleanup', date: '2026-12-12', startTime: '09:00', endTime: '13:00',
      pricing: { type: 'hourly', rateCents: 3025, estimatedHours: 2, hoursCap: 2 },
    }));
    expect(await screen.findByText(copy.created)).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(date()).toHaveValue('');
    expect(start()).toHaveValue('');
    expect(end()).toHaveValue('');
  });

  it('restores the listed fixed price when returning to its category and follows redirects', async () => {
    const redirectTo = routes.app.availability();
    const { handlers } = mount(myAvailabilityEmptyData, { onCreate: vi.fn(fakeHandler<AvailabilityPostInput>({ ok: true, code: 'saved', redirectTo }, 0)) });
    fireEvent.change(service(), { target: { value: 'moving-help' } });
    fireEvent.change(service(), { target: { value: 'furniture-assembly' } });
    expect(screen.getByRole('textbox', { name: copy.price })).toHaveValue('45');
    expect(screen.queryByRole('spinbutton', { name: copy.hoursCap })).not.toBeInTheDocument();
    fillSchedule();
    fireEvent.submit(form());
    await waitFor(() => expect(handlers.onCreate).toHaveBeenCalledExactlyOnceWith({
      categorySlug: 'furniture-assembly', date: '2026-12-12', startTime: '09:00', endTime: '13:00', pricing: { type: 'fixed', priceCents: 4500 },
    }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('limits dates to the supplied range and rejects an end before the start', async () => {
    const { handlers } = mount();
    expect(date()).toHaveAttribute('min', myAvailabilityEmptyData.limits.firstDate);
    expect(date()).toHaveAttribute('max', myAvailabilityEmptyData.limits.lastDate);
    fillSchedule('2026-12-23');
    fireEvent.submit(form());
    expect(await screen.findByText(copy.errors.date)).toBeVisible();
    expect(handlers.onCreate).not.toHaveBeenCalled();
    fillSchedule();
    fireEvent.change(end(), { target: { value: '08:30' } });
    fireEvent.submit(form());
    expect(await screen.findByText('Choose an end after the start, no more than 12 h later.')).toBeVisible();
    expect(handlers.onCreate).not.toHaveBeenCalled();
  });

  it('places server errors on their fields and focuses the first invalid control', async () => {
    mount(myAvailabilityEmptyData, { onCreate: fakeHandler({ ok: false, code: 'validation_failed', fieldErrors: {
      categorySlug: ['invalid'], date: ['out_of_range'], startTime: ['out_of_range'], endTime: ['out_of_range'], 'pricing.priceCents': ['invalid'],
    } }, 0) });
    fillSchedule();
    fireEvent.submit(form());
    await waitFor(() => expect(service()).toHaveFocus());
    const fields = [
      [service(), copy.errors.category], [date(), copy.errors.date], [start(), copy.errors.startTime],
      [end(), 'Choose an end after the start, no more than 12 h later.'],
      [screen.getByRole('textbox', { name: copy.price }), messages.forms.fieldErrors.invalid],
    ] as const;
    for (const [control, error] of fields) {
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(control).toHaveAccessibleDescription(expect.stringContaining(error));
    }
  });

  it('locks controls during create, prevents duplicate submissions, and permits retry after an unexpected failure', async () => {
    let reject!: (error: Error) => void;
    const onCreate = vi.fn<AvailabilityHandlers['onCreate']>()
      .mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }))
      .mockImplementation(fakeHandler({ ok: true, code: 'saved' }, 0));
    mount(myAvailabilityEmptyData, { onCreate });
    fillSchedule();
    fireEvent.submit(form());
    fireEvent.submit(form());
    const pending = await screen.findByRole('button', { name: copy.creating });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(form()).toHaveAttribute('aria-busy', 'true');
    for (const control of [service(), date(), start(), end(), screen.getByRole('textbox', { name: copy.price })]) expect(control).toBeDisabled();
    expect(onCreate).toHaveBeenCalledOnce();
    await act(async () => reject(new Error('offline')));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(submit()).toBeEnabled();
    expect(date()).toHaveValue('2026-12-12');
    fireEvent.submit(form());
    expect(await screen.findByText(copy.created)).toBeVisible();
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it.each(['limit_reached', 'not_allowed'] as const)('shows useful copy for create result %s', async (code) => {
    mount(myAvailabilityEmptyData, { onCreate: fakeHandler({ ok: false, code }, 0) });
    fillSchedule();
    fireEvent.submit(form());
    expect(await screen.findByText(code === 'limit_reached' ? 'You have 10 open times. Cancel one to add another.' : copy.errors.createNotAllowed)).toBeVisible();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('renders posts in supplied order with complete status labels, exact prices, and contract routes', () => {
    mount(myAvailabilityData);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(myAvailabilityData.posts.length);
    for (const [index, post] of myAvailabilityData.posts.entries()) expect(within(cards[index]).getByText(copy.status[post.status])).toBeVisible();
    expect(screen.getAllByText('$30.00/h · about 3 h, up to 4 h')).toHaveLength(3);
    expect(screen.getByRole('link', { name: "View Maya R.'s request" })).toHaveAttribute('href', routes.app.offers(sundayPostHeld.request!.inviteId));
    expect(screen.getByRole('link', { name: 'View booking with Chris D.' })).toHaveAttribute('href', routes.app.booking(movingPostBooked.bookingId!));
    for (const status of AVAILABILITY_STATUSES) expect(copy.status[status]).toBeTruthy();
    for (const action of AVAILABILITY_ACTION_IDS) expect(messages.actions[action]).toBeTruthy();
  });

  it('renders only supplied post actions and confirms canceling a held post before declining its request', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ ...myAvailabilityEmptyData, posts: [{ ...yardPostActive, actions: [] }, sundayPostHeld] });
    const cards = screen.getAllByRole('article');
    expect(within(cards[0]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(cards[1]).getAllByRole('button').map((button) => button.textContent)).toEqual(['Cancel']);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = screen.getByRole('alertdialog', { name: copy.cancelTitle });
    expect(within(dialog).getByText("Maya R.'s request will be declined and the hold on their card will be released. This opening will be removed from your profile.")).toBeVisible();
    expect(handlers.onCancel).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: copy.keep }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.cancelConfirm }));
    await waitFor(() => expect(handlers.onCancel).toHaveBeenCalledExactlyOnceWith({ postId: sundayPostHeld.id }));
    expect(await screen.findByText(copy.canceled)).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('locks cancellation while pending and retains its dialog for a failed retry', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onCancel = vi.fn<AvailabilityHandlers['onCancel']>()
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockImplementation(fakeHandler({ ok: true, code: 'canceled', redirectTo: routes.app.availability() }, 0));
    mount({ ...myAvailabilityEmptyData, posts: [yardPostActive] }, { onCancel });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: copy.cancelConfirm }));
    const pending = within(dialog).getByRole('button', { name: copy.canceling });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: copy.keep })).toBeDisabled();
    await act(async () => finish({ ok: false, code: 'not_allowed' }));
    expect(within(dialog).getByText(copy.errors.cancelNotAllowed)).toBeVisible();
    expect(navigation.refresh).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: copy.cancelConfirm }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.app.availability()));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('replaces the form at the supplied limit while keeping posts available', () => {
    mount(myAvailabilityAtLimitData);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByText('You have 10 open times. Cancel one to add another.')).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(myAvailabilityAtLimitData.posts.length);
  });

  it('shows the supplied onboarding step and empty guidance when setup is incomplete', () => {
    mount(myAvailabilityNotBookableData);
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.setupTitle })).toBeVisible();
    expect(screen.getByRole('link', { name: messages.findWork.finishSetup })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
    expect(screen.getByRole('heading', { name: copy.emptyTitle })).toBeVisible();
    expect(screen.getByText(copy.emptySetupBody)).toBeVisible();
  });
});
