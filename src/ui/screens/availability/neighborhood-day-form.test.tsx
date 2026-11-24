/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult, AvailabilityHandlers, AvailabilityPostInput, MyAvailabilityPageData, NeighborhoodDayInput } from '@/contracts';
import { fakeHandler, myAvailabilityData, myAvailabilityWithDaysData, neighborhoodDayFilling } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { MyAvailabilityScreen } from './my-availability-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
// The Radix checkbox measures itself.
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-12-08T16:00:00.000Z';
const copy = messages.neighborhoodDays;

function mount(data: MyAvailabilityPageData = myAvailabilityWithDaysData, overrides: Partial<AvailabilityHandlers> = {}) {
  const handlers: AvailabilityHandlers = {
    onCreate: vi.fn(fakeHandler<AvailabilityPostInput>({ ok: true, code: 'saved' }, 0)),
    onCancel: vi.fn(fakeHandler<{ postId: string }>({ ok: true, code: 'canceled' }, 0)),
    onCreateDay: vi.fn(fakeHandler<NeighborhoodDayInput>({ ok: true, code: 'saved' }, 0)),
    onCancelDay: vi.fn(fakeHandler<{ dayId: string }>({ ok: true, code: 'canceled' }, 0)),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago"><MyAvailabilityScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

function fill(form: HTMLElement) {
  const box = within(form);
  fireEvent.change(box.getByRole('combobox', { name: copy.form.area }), { target: { value: 'hyde-park' } });
  fireEvent.change(box.getByRole('combobox', { name: copy.form.category }), { target: { value: 'furniture-assembly' } });
  fireEvent.change(box.getByLabelText(copy.form.date), { target: { value: '2026-12-12' } });
  const starts = box.getAllByRole('combobox', { name: copy.form.start });
  const ends = box.getAllByRole('combobox', { name: copy.form.end });
  fireEvent.change(starts[0]!, { target: { value: '09:00' } });
  fireEvent.change(ends[0]!, { target: { value: '10:00' } });
  fireEvent.change(starts[1]!, { target: { value: '10:30' } });
  fireEvent.change(ends[1]!, { target: { value: '11:30' } });
}

describe('Neighborhood day form', () => {
  it('opens a day with the usual price pre-filled and a neighbor price only when the helper offers one', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const form = screen.getByRole('form', { name: copy.form.title });
    fill(form);
    expect(within(form).getByRole('textbox', { name: copy.form.price })).toHaveValue('45');
    expect(within(form).queryByRole('textbox', { name: copy.form.neighborPrice })).toBeNull();
    await user.click(within(form).getByRole('checkbox', { name: copy.form.neighborToggle }));
    await user.type(within(form).getByRole('textbox', { name: copy.form.neighborPrice }), '35');
    await user.click(within(form).getByRole('button', { name: copy.form.create }));
    await waitFor(() => expect(handlers.onCreateDay).toHaveBeenCalledTimes(1));
    expect(handlers.onCreateDay).toHaveBeenCalledWith({
      areaSlug: 'hyde-park', categorySlug: 'furniture-assembly', date: '2026-12-12',
      visits: [{ startTime: '09:00', endTime: '10:00' }, { startTime: '10:30', endTime: '11:30' }],
      priceCents: 4500, neighborPriceCents: 3500,
    });
    expect(await screen.findByText(copy.form.created)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('adds visits up to eight and shows the server rules on the right fields', async () => {
    const user = userEvent.setup();
    const result: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { 'visits.1.startTime': ['out_of_range'], areaSlug: ['invalid'] } };
    const { handlers } = mount(myAvailabilityWithDaysData, { onCreateDay: vi.fn(fakeHandler<NeighborhoodDayInput>(result, 0)) });
    const form = screen.getByRole('form', { name: copy.form.title });
    for (let count = 2; count < 8; count += 1) await user.click(within(form).getByRole('button', { name: copy.form.addVisit }));
    expect(within(form).getAllByRole('combobox', { name: copy.form.start })).toHaveLength(8);
    expect(within(form).queryByRole('button', { name: copy.form.addVisit })).toBeNull();
    for (let index = 8; index > 2; index -= 1) await user.click(within(form).getByRole('button', { name: `Remove visit ${index}` }));
    fill(form);
    await user.click(within(form).getByRole('button', { name: copy.form.create }));
    await waitFor(() => expect(handlers.onCreateDay).toHaveBeenCalledTimes(1));
    expect(await within(form).findByText(copy.errors.area)).toBeInTheDocument();
    expect(within(form).getByText('Start at least 3 hours from now, without overlapping another visit or open time.')).toBeInTheDocument();
  });

  it("lists the helper's days and cancels the open visits of one", async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const days = screen.getByRole('region', { name: copy.manage.title });
    const cards = within(days).getAllByRole('article');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).queryAllByRole('link')).toHaveLength(0);
    expect(within(cards[1]!).queryByRole('button', { name: copy.manage.cancel })).toBeNull();
    await user.click(within(cards[0]!).getByRole('button', { name: copy.manage.cancel }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.manage.cancelConfirm }));
    await waitFor(() => expect(handlers.onCancelDay).toHaveBeenCalledWith({ dayId: neighborhoodDayFilling.id }));
    expect(await screen.findByText(copy.manage.canceled)).toBeInTheDocument();
  });

  it('is absent without day handlers or neighborhoods', () => {
    mount(myAvailabilityData);
    expect(screen.queryByRole('form', { name: copy.form.title })).toBeNull();
  });
});
