/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { OFFER_BLOCKED_REASONS, routes, type ActionResult, type FindWorkHandlers, type FindWorkPageData } from '@/contracts';
import { fakeFindWorkHandlers, findWorkByPayData, findWorkEmptyData, findWorkMapViewData, findWorkNotBookableData, findWorkPageData, findWorkSavedData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import findWork from '../../../../messages/en/ui/findWork.json';
import { FindWorkScreen } from './find-work-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = '2026-11-17T15:00:00.000Z';
function renderWork(data: FindWorkPageData = findWorkPageData, handlers: FindWorkHandlers | null = fakeFindWorkHandlers) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, findWork }}><FindWorkScreen data={data} now={now} handlers={handlers ?? undefined} liveMap={false} /></NextIntlClientProvider>);
}
const list = () => screen.getByRole('region', { name: findWork.resultsLabel });

describe('FindWorkScreen', () => {
  it('lists tasks by day with the pay, what the helper earns, the area, and the offer status', () => {
    renderWork();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const desk = findWorkPageData.cards[0]!;
    expect(within(list()).getByRole('link', { name: desk.task.title })).toHaveAttribute('href', routes.app.findWorkTask(desk.task.id));
    // Sat Nov 21 is the first day (not today or tomorrow from Tue Nov 17).
    const days = within(list()).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(days).toHaveLength(5);
    expect(days[0]).toMatch(/Nov 21/);
    expect(within(list()).getByText("You'd earn $54.00")).toBeVisible();
    expect(within(list()).getByText("You'd earn $31.50/h")).toBeVisible();
    expect(within(list()).getAllByText('New')).toHaveLength(4);
    expect(within(list()).getByText('You made an offer')).toBeVisible();
    expect(within(list()).getAllByText(/About 2 miles away/).length).toBeGreaterThan(0);
  });

  it('labels today and tomorrow', () => {
    const today = findWorkPageData.cards[1]!;
    renderWork({ ...findWorkPageData, cards: [{ ...findWorkPageData.cards[0]!, startDay: '2026-11-17' }, { ...today, startDay: '2026-11-18' }] });
    const days = within(list()).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(days).toEqual(['Today', 'Tomorrow']);
  });

  it('drops day groups when the list goes by pay', () => {
    renderWork(findWorkByPayData);
    expect(within(list()).queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    // The move's whole cap ($126 earned) beats the yard ($108).
    expect(within(list()).getAllByRole('article')[0]).toHaveTextContent('Help loading a moving truck');
  });

  it('keeps the filters in the URL: categories, sort, saved, and the filter sheet', async () => {
    renderWork({ ...findWorkPageData, query: { ...findWorkPageData.query, page: 2, distance: 'within_10_mi', when: 'this_week' }, pageCount: 3 });
    const categories = screen.getByRole('navigation', { name: findWork.category });
    expect(within(categories).getByRole('link', { name: 'Moving help' })).toHaveAttribute('href', '/app/find-work?category=moving-help&when=this_week&distance=within_10_mi');
    expect(screen.getByRole('link', { name: /Saved/ })).toHaveAttribute('href', '/app/find-work?when=this_week&distance=within_10_mi&saved=1');
    // Active filters remove themselves.
    expect(screen.getByRole('link', { name: 'Remove the filter: Within 10 miles' })).toHaveAttribute('href', '/app/find-work?when=this_week');
    expect(screen.getByRole('link', { name: 'Remove the filter: This week' })).toHaveAttribute('href', '/app/find-work?distance=within_10_mi');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: findWork.sort }), 'pay');
    expect(navigation.push).toHaveBeenCalledWith('/app/find-work?when=this_week&sort=pay&distance=within_10_mi');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/app/find-work?when=this_week&page=3&distance=within_10_mi');
    await userEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const sheet = await screen.findByRole('dialog', { name: findWork.filtersTitle });
    expect(within(sheet).getByRole('link', { name: 'Within 5 miles' })).toHaveAttribute('href', '/app/find-work?when=this_week&distance=within_5_mi');
  });

  it('offers nearest only when the helper has an area', () => {
    renderWork(findWorkNotBookableData);
    expect(within(screen.getByRole('combobox', { name: findWork.sort })).queryByRole('option', { name: 'Nearest' })).toBeNull();
    cleanup();
    renderWork();
    expect(within(screen.getByRole('combobox', { name: findWork.sort })).getByRole('option', { name: 'Nearest' })).toBeInTheDocument();
  });

  it('saves a task and hides another, with Undo', async () => {
    const onSaveTask = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    const onHideTask = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    renderWork(findWorkPageData, { onSaveTask, onHideTask });
    const moving = findWorkPageData.cards[1]!.task;
    await userEvent.click(screen.getByRole('button', { name: `Save ${moving.title} for later` }));
    expect(onSaveTask).toHaveBeenCalledWith({ taskId: moving.id, saved: true });
    expect(screen.getByRole('button', { name: `Remove ${moving.title} from saved` })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: `Not interested in ${moving.title}: hide it` }));
    expect(onHideTask).toHaveBeenCalledWith({ taskId: moving.id, hidden: true });
    expect(within(list()).queryByRole('link', { name: moving.title })).toBeNull();
    expect(screen.getByText(`Hidden: ${moving.title}.`)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onHideTask).toHaveBeenLastCalledWith({ taskId: moving.id, hidden: false });
    expect(within(list()).getByRole('link', { name: moving.title })).toBeVisible();
  });

  it('sends Undo even while the hide is still on its way, and keeps the row in its place', async () => {
    let finishHide: (result: ActionResult) => void = () => {};
    const onHideTask = vi.fn((input: { taskId: string; hidden: boolean }) => (input.hidden
      ? new Promise<ActionResult>((resolve) => { finishHide = resolve; })
      : Promise.resolve<ActionResult>({ ok: true, code: 'updated' })));
    const handlers = { ...fakeFindWorkHandlers, onHideTask };
    const view = renderWork(findWorkPageData, handlers);
    const moving = findWorkPageData.cards[1]!.task;
    await userEvent.click(screen.getByRole('button', { name: `Not interested in ${moving.title}: hide it` }));
    // Undo before the hide is answered: the row is back at once, and the request waits its turn.
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onHideTask).toHaveBeenCalledTimes(1);
    expect(within(list()).getByRole('link', { name: moving.title })).toBeVisible();
    // The hide's answer brings a list without the row: it stays where it was.
    finishHide({ ok: true, code: 'updated' });
    const without: FindWorkPageData = { ...findWorkPageData, cards: findWorkPageData.cards.filter((card) => card.task.id !== moving.id) };
    view.rerender(<NextIntlClientProvider locale="en" messages={{ ...messages, findWork }}><FindWorkScreen data={without} now={now} handlers={handlers} liveMap={false} /></NextIntlClientProvider>);
    await vi.waitFor(() => expect(onHideTask).toHaveBeenLastCalledWith({ taskId: moving.id, hidden: false }));
    const links = within(list()).getAllByRole('link').map((link) => link.textContent);
    expect(links.indexOf(moving.title)).toBe(1);
  });

  it('never drops a tap on another row while a save is on its way', async () => {
    let finishSave: (result: ActionResult) => void = () => {};
    const onSaveTask = vi.fn(() => new Promise<ActionResult>((resolve) => { finishSave = resolve; }));
    const onHideTask = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    renderWork(findWorkPageData, { ...fakeFindWorkHandlers, onSaveTask, onHideTask });
    const [desk, moving] = [findWorkPageData.cards[0]!.task, findWorkPageData.cards[1]!.task];
    await userEvent.click(screen.getByRole('button', { name: `Save ${desk.title} for later` }));
    await userEvent.click(screen.getByRole('button', { name: `Not interested in ${moving.title}: hide it` }));
    expect(onHideTask).toHaveBeenCalledWith({ taskId: moving.id, hidden: true });
    finishSave({ ok: true, code: 'updated' });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: `Remove ${desk.title} from saved` })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('puts a refused save back and says so', async () => {
    const onSaveTask = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'not_found' }));
    renderWork(findWorkPageData, { ...fakeFindWorkHandlers, onSaveTask });
    const desk = findWorkPageData.cards[0]!.task;
    await userEvent.click(screen.getByRole('button', { name: `Save ${desk.title} for later` }));
    expect(await screen.findByText(findWork.markFailed)).toBeVisible();
    expect(screen.getByRole('button', { name: `Save ${desk.title} for later` })).toHaveAttribute('aria-pressed', 'false');
  });

  it('draws the general areas on the map, never an address, and lights a row from its marker', async () => {
    const { container } = renderWork();
    const map = screen.getByRole('complementary', { name: findWork.mapLabel });
    expect(within(map).getByRole('img', { name: findWork.mapLabel })).toBeInTheDocument();
    // Four local tasks (the laptop is remote); markers in the same spot would group.
    expect(within(map).getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    expect(within(map).getByText(/1 remote task is in the list only/)).toBeVisible();
    expect(container.innerHTML).not.toContain('Example Lane');
    const desk = findWorkPageData.cards[0]!.task;
    await userEvent.hover(within(map).getByRole('button', { name: new RegExp(desk.title.replace(/[()]/g, '.')) }));
    expect(within(list()).getAllByRole('article')[0]!.className).toContain('border-primary');
  });

  it('shows the map on phones in map view, and the list otherwise', () => {
    renderWork(findWorkMapViewData);
    expect(list().className).toContain('hidden lg:block');
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('href', '/app/find-work?distance=within_10_mi');
  });

  it('says when nothing is saved yet', () => {
    renderWork({ ...findWorkSavedData, cards: [], totalCount: 0 });
    expect(screen.getByText(findWork.savedEmptyTitle)).toBeVisible();
  });

  it.each(OFFER_BLOCKED_REASONS)('shows the supplied %s reason without deciding eligibility', (blockedReason) => {
    renderWork({ ...findWorkPageData, cards: [{ ...findWorkPageData.cards[1]!, blockedReason }] });
    expect(screen.getByText(findWork.blockedReasons[blockedReason])).toBeVisible();
  });

  it('links the setup banner to the supplied identity step', () => {
    renderWork(findWorkNotBookableData);
    expect(screen.getByRole('heading', { name: 'Finish setting up to send offers' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
  });

  it('clears every filter from the empty state', () => {
    renderWork(findWorkEmptyData);
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', routes.app.findWork());
  });

  it('shows no save or hide buttons without handlers', () => {
    renderWork(findWorkPageData, null);
    expect(screen.queryByRole('button', { name: /for later/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Not interested/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Offer \$/ })).toBeNull();
  });

  it('offers at the poster\'s price in one tap only where the domain allows it, with Undo', async () => {
    const user = userEvent.setup();
    const onQuickOffer = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent' }));
    const onUndoQuickOffer = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    renderWork(findWorkPageData, { ...fakeFindWorkHandlers, onQuickOffer, onUndoQuickOffer });
    const yard = findWorkPageData.cards.find((card) => card.quickOffer)!;
    // Only the yard task has one: the desk already has his offer, the move is hourly, two are in categories he doesn't offer.
    const buttons = within(list()).getAllByRole('button', { name: /^Offer \$/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(`Offer $120.00 for ${yard.task.title}, starting at 9:00 am`);
    await user.click(buttons[0]!);
    expect(onQuickOffer).toHaveBeenCalledWith({ taskId: yard.task.id });
    expect(await within(list()).findByText('Offer sent')).toBeVisible();
    expect(screen.getByText(`You offered $120.00 for “${yard.task.title}”. They see your profile and can book you.`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndoQuickOffer).toHaveBeenCalledWith({ taskId: yard.task.id });
    expect(await screen.findByText(`Your offer for “${yard.task.title}” is withdrawn.`)).toBeVisible();
    expect(within(list()).getByRole('button', { name: /^Offer \$120\.00/ })).toBeEnabled();
  });

  it('says why a one-tap offer didn\'t go through', async () => {
    const user = userEvent.setup();
    const onQuickOffer = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'limit_reached' }));
    renderWork(findWorkPageData, { ...fakeFindWorkHandlers, onQuickOffer });
    await user.click(within(list()).getByRole('button', { name: /^Offer \$/ }));
    expect(await screen.findByText(findWork.quickOfferErrors.limit_reached)).toBeVisible();
    expect(within(list()).getByRole('button', { name: /^Offer \$/ })).toBeEnabled();
  });

  it('keeps marketplace copy within the approved vocabulary', () => {
    expect(JSON.stringify(findWork)).not.toMatch(/\b(bid|bids|job board|gig|gigs|hire|escrow|wallet|guaranteed|cheapest)\b/i);
  });
});
