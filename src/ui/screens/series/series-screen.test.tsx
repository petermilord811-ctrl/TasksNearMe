/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, SERIES_ACTION_IDS, SERIES_CHARGE_FAILURES, SERIES_SKIPPERS, SERIES_VISIT_ACTION_IDS, SERIES_VISIT_STATES, type ActionResult, type SeriesHandlers, type SeriesPageData } from '@/contracts';
import {
  mayaMastercard,
  mayaVisa,
  SERIES_NOW,
  seriesClientActiveData,
  seriesClientMonthlyData,
  seriesClientNoCardData,
  seriesClientPausedData,
  seriesClientPaymentDueData,
  seriesClientStoppedData,
  seriesHelperActiveData,
  seriesHelperEndedData,
} from '@/fixtures';
import messages from '../../../../messages/en/ui';
import seriesCopy from '../../../../messages/en/ui/series.json';
import { SeriesScreen } from './series-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const ok: ActionResult = { ok: true, code: 'updated' };

function mount(data: SeriesPageData = seriesClientActiveData, overrides: Partial<SeriesHandlers> = {}) {
  const handlers: SeriesHandlers = {
    onSkipVisit: vi.fn(async () => ok),
    onPause: vi.fn(async () => ok),
    onResume: vi.fn(async () => ok),
    onCancel: vi.fn(async () => ok),
    onEnd: vi.fn(async () => ok),
    onChangeCard: vi.fn(async () => ok),
    onMessage: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: routes.app.thread('thr_leaves') })),
    ...overrides,
  };
  const view = render(<NextIntlClientProvider locale="en" messages={messages}><SeriesScreen data={data} handlers={handlers} now={SERIES_NOW} /></NextIntlClientProvider>);
  return { handlers, ...view };
}

const upcoming = () => screen.getByRole('region', { name: seriesCopy.upcoming });
const visitItems = () => within(upcoming()).getAllByRole('listitem');

describe('SeriesScreen', () => {
  it('shows the client how it repeats, the card, the visits and their own actions', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rake and bag the backyard leaves');
    expect(screen.getByText('Every week on Tuesday at 9:00 am')).toBeVisible();
    expect(screen.getByText('Each visit is charged to Visa •••• 1881 2 days before it.')).toBeVisible();
    expect(screen.getByText('With Jordan T.')).toBeVisible();
    const items = visitItems();
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Booked and paid');
    expect(items[1]).toHaveTextContent('On the calendar');
    expect(items[1]).toHaveTextContent('Your card is charged');
    // The booked visit can only be opened; the ones on the calendar can be skipped.
    expect(within(items[0]!).queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(within(items[0]!).getByRole('link', { name: 'View booking' })).toHaveAttribute('href', routes.app.booking('bkg_leaves_4'));
    expect(within(items[1]!).getByRole('button', { name: 'Skip' })).toBeEnabled();
    const actions = screen.getByRole('region', { name: seriesCopy.actionsLabel });
    expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual(['Pause', 'Change card', 'Stop regular visits', 'Message Jordan T.']);
    // Each visit's numbers for the client.
    expect(screen.getByRole('region', { name: seriesCopy.perVisitTotal })).toHaveTextContent('$63.00');
    expect(screen.getByRole('region', { name: seriesCopy.past })).toBeVisible();
  });

  it('asks the client to pay a visit whose charge failed, with the reason and the deadline', () => {
    mount(seriesClientPaymentDueData);
    const due = visitItems()[0]!;
    expect(due).toHaveTextContent('Payment needed');
    expect(due).toHaveTextContent("The card didn't have enough funds.");
    expect(due).toHaveTextContent(/Pay by .*, or it's skipped/);
    expect(within(due).getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', routes.app.booking('bkg_leaves_4'));
  });

  it('warns when there is no card on file', () => {
    mount(seriesClientNoCardData);
    expect(screen.getByRole('status')).toHaveTextContent("There's no card on file");
    expect(visitItems()[0]).toHaveTextContent("There's no card on file.");
  });

  it('shows a paused series with the visits skipped meanwhile and "Start again now"', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(seriesClientPausedData);
    expect(screen.getByText('Paused until Mon, Dec 21')).toBeVisible();
    expect(screen.getByText(/^Paused until Mon, Dec 21. Visits before then are skipped/)).toBeVisible();
    expect(visitItems()[1]).toHaveTextContent('Skipped while paused');
    await user.click(screen.getByRole('button', { name: 'Start again now' }));
    await waitFor(() => expect(handlers.onResume).toHaveBeenCalledOnce());
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalled());
  });

  it('words a monthly series by its weekday in the month', () => {
    mount(seriesClientMonthlyData);
    expect(screen.getByText('Monthly on the third Saturday at 10:00 am')).toBeVisible();
  });

  it('gives the helper what they earn, when the client is charged, and "End regular visits" with its date', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(seriesHelperActiveData);
    expect(screen.queryByText(/Visa/)).not.toBeInTheDocument();
    expect(screen.getByText("Maya R.'s card is charged 2 days before each visit. You'll see the address once a visit is paid.")).toBeVisible();
    expect(screen.getByRole('region', { name: seriesCopy.perVisitEarnings })).toHaveTextContent('$60.00');
    expect(visitItems()[1]).toHaveTextContent("Maya R.'s card is charged");
    const actions = screen.getByRole('region', { name: seriesCopy.actionsLabel });
    expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual(['End regular visits', 'Message Maya R.']);
    await user.click(within(actions).getByRole('button', { name: 'End regular visits' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Visits until Mon, Dec 7 still happen/);
    await user.click(within(dialog).getByRole('button', { name: 'End regular visits' }));
    await waitFor(() => expect(handlers.onEnd).toHaveBeenCalledOnce());
  });

  it('shows an ending series and a stopped one with nothing left to do but talk', () => {
    mount(seriesHelperEndedData);
    expect(screen.getByText(/^Ends after Mon, Dec 7/)).toBeVisible();
    expect(visitItems()[1]).toHaveTextContent('Canceled');
    cleanup();
    mount(seriesClientStoppedData);
    expect(screen.getByText('Stopped')).toBeVisible();
    const actions = screen.getByRole('region', { name: seriesCopy.actionsLabel });
    expect(within(actions).getAllByRole('button').map((button) => button.textContent)).toEqual(['Message Jordan T.']);
  });

  it('skips a visit only after the confirmation', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(within(visitItems()[1]!).getByRole('button', { name: 'Skip' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Nothing is charged for it.');
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(handlers.onSkipVisit).not.toHaveBeenCalled();
    await user.click(within(visitItems()[1]!).getByRole('button', { name: 'Skip' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Skip visit' }));
    await waitFor(() => expect(handlers.onSkipVisit).toHaveBeenCalledExactlyOnceWith({ visitId: 'bkg_leaves_5' }));
  });

  it('says when a skip is no longer possible, with Reload', async () => {
    const user = userEvent.setup();
    mount(seriesClientActiveData, { onSkipVisit: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'not_allowed' })) });
    await user.click(within(visitItems()[1]!).getByRole('button', { name: 'Skip' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Skip visit' }));
    expect(await screen.findByText(seriesCopy.changed)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('pauses until a day within the limits only', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    const sheet = await screen.findByRole('dialog', { name: seriesCopy.pause.title });
    const date = within(sheet).getByLabelText(seriesCopy.pause.date);
    await user.type(date, '2027-06-01');
    await user.click(within(sheet).getByRole('button', { name: 'Pause' }));
    expect(within(sheet).getByText(/^Pick a day from/)).toBeVisible();
    expect(handlers.onPause).not.toHaveBeenCalled();
    await user.clear(date);
    await user.type(date, '2026-12-21');
    await user.click(within(sheet).getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(handlers.onPause).toHaveBeenCalledExactlyOnceWith({ resumeOn: '2026-12-21' }));
  });

  it('shows the server refusing the resume date on the field', async () => {
    const user = userEvent.setup();
    mount(seriesClientActiveData, { onPause: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { resumeOn: ['out_of_range'] } })) });
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    const sheet = await screen.findByRole('dialog', { name: seriesCopy.pause.title });
    await user.type(within(sheet).getByLabelText(seriesCopy.pause.date), '2026-12-21');
    await user.click(within(sheet).getByRole('button', { name: 'Pause' }));
    expect(await within(sheet).findByText(/^Pick a day from/)).toBeVisible();
  });

  it('changes the card to another saved one', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: 'Change card' }));
    const sheet = await screen.findByRole('dialog', { name: seriesCopy.changeCard.title });
    await user.click(within(sheet).getByRole('radio', { name: /Mastercard/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Use this card' }));
    await waitFor(() => expect(handlers.onChangeCard).toHaveBeenCalledExactlyOnceWith({ methodId: 'pm_maya_mc' }));
  });

  it('adds a card right in the Change-card sheet, and chooses it once the page brings it (2026-11-23)', async () => {
    const user = userEvent.setup();
    const added = { ...mayaMastercard, id: 'pm_maya_new', last4: '4242', isDefault: false };
    const onAddCard = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' }));
    const data: SeriesPageData = { ...seriesClientActiveData, newCard: { kind: 'dev', testCards: ['success', 'declined'] } };
    const { handlers, rerender } = mount(data, { onAddCard });
    await user.click(screen.getByRole('button', { name: 'Change card' }));
    const sheet = await screen.findByRole('dialog', { name: seriesCopy.changeCard.title });
    // No trip to the payments page: the form opens in the sheet.
    expect(within(sheet).queryByRole('link', { name: seriesCopy.changeCard.addCard })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: seriesCopy.changeCard.addCard }));
    await user.click(within(sheet).getByRole('button', { name: messages.paymentsPage.add }));
    await waitFor(() => expect(onAddCard).toHaveBeenCalledOnce());
    // The page refreshes with the new card: it's the one chosen.
    rerender(<NextIntlClientProvider locale="en" messages={messages}><SeriesScreen data={{ ...data, cards: [...data.cards!, added] }} handlers={handlers} now={SERIES_NOW} /></NextIntlClientProvider>);
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: seriesCopy.changeCard.title })).getByRole('radio', { name: /4242/ })).toBeChecked());
    expect(screen.getByText(seriesCopy.changeCard.added)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: seriesCopy.changeCard.title })).getByRole('button', { name: 'Use this card' }));
    await waitFor(() => expect(handlers.onChangeCard).toHaveBeenCalledExactlyOnceWith({ methodId: 'pm_maya_new' }));
  });

  it("shows a card that can't be used here disabled, never chooses it, and removes it only when asked (J-AB4)", async () => {
    const user = userEvent.setup();
    const asked: { methodId: string }[] = [];
    // The series' own card, the Visa, is the refused one.
    const { handlers } = mount({ ...seriesClientActiveData, cards: [{ ...mayaVisa, unusable: true }, mayaMastercard] }, { onRemoveCard: async (input) => { asked.push(input); return ok; } });
    await user.click(screen.getByRole('button', { name: 'Change card' }));
    const sheet = await screen.findByRole('dialog', { name: seriesCopy.changeCard.title });
    const refused = within(sheet).getByRole('radio', { name: 'Visa •••• 1881' });
    expect(refused).toBeDisabled();
    expect(refused).toHaveAccessibleDescription("This card can't be used here. Contact support if you think that's wrong.");
    expect(within(sheet).getByRole('radio', { name: /Mastercard/ })).toHaveAttribute('aria-checked', 'true');
    expect(asked).toEqual([]);
    await user.click(within(sheet).getByRole('button', { name: 'Remove' }));
    expect(asked).toEqual([{ methodId: 'pm_maya_visa' }]);
    await waitFor(() => expect(within(sheet).queryByText('Visa •••• 1881')).not.toBeInTheDocument());
    await user.click(within(sheet).getByRole('button', { name: 'Use this card' }));
    await waitFor(() => expect(handlers.onChangeCard).toHaveBeenCalledExactlyOnceWith({ methodId: 'pm_maya_mc' }));
  });

  it('stops after the confirmation, and opens the conversation', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: 'Stop regular visits' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop regular visits' }));
    await waitFor(() => expect(handlers.onCancel).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Message Jordan T.' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.app.thread('thr_leaves')));
  });

  it('has words for every state, skipper, failure and action', () => {
    for (const id of SERIES_ACTION_IDS) expect(seriesCopy.actions[id]).toMatch(/\S/);
    for (const id of SERIES_VISIT_ACTION_IDS) expect(seriesCopy.visitActions[id]).toMatch(/\S/);
    for (const state of SERIES_VISIT_STATES) expect(seriesCopy.state[state]).toMatch(/\S/);
    for (const by of SERIES_SKIPPERS) expect(seriesCopy.skippedBy[by]).toMatch(/\S/);
    for (const failure of SERIES_CHARGE_FAILURES) expect(seriesCopy.failure[failure]).toMatch(/\S/);
    const { container } = mount(seriesClientPaymentDueData);
    expect(container.textContent).not.toMatch(/series\.|\{/);
  });
});
