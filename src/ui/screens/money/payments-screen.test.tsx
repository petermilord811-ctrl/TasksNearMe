/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, DEV_TEST_CARDS, routes, type ActionResult, type PaymentMethodHandlers, type PaymentsPageData } from '@/contracts';
import { mayaPaymentsHistoryData, mayaPaymentsPageData, paymentsEmptyData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PaymentsScreen } from './payments-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const now = '2026-11-30T18:00:00.000Z';
const copy = messages.paymentsPage;
const addButton = () => screen.getByRole('button', { name: copy.add });
const addForm = () => screen.getByRole('form', { name: copy.addTitle });
const defaultCheckbox = () => screen.getByRole('checkbox', { name: copy.makeThisDefault });
const visa = () => screen.getByRole('listitem', { name: 'Visa •••• 1881' });
const mastercard = () => screen.getByRole('listitem', { name: 'Mastercard •••• 4444' });

function mount(data: PaymentsPageData = mayaPaymentsPageData, overrides: Partial<PaymentMethodHandlers> = {}) {
  const handlers: PaymentMethodHandlers = {
    onAddCard: vi.fn().mockResolvedValue({ ok: true, code: 'saved' }),
    onRemoveCard: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }),
    onMakeDefault: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }),
    ...overrides,
  };
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><PaymentsScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>) };
}

/** With cards saved, the add-card form sits behind "Add a card" (audit M36). */
function mountAdding(data: PaymentsPageData = mayaPaymentsPageData, overrides: Partial<PaymentMethodHandlers> = {}) {
  const mounted = mount(data, overrides);
  fireEvent.click(screen.getByRole('button', { name: copy.addTitle }));
  return mounted;
}

describe('PaymentsScreen', () => {
  it('shows each supplied receipt amount, helper, paid date, status, and receipt link', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const row = (title: string) => within(screen.getByRole('link', { name: title }).closest('li')!);
    const [allowance, desk, yard] = mayaPaymentsPageData.receipts;
    // What the client paid, and a refund only when there was one (audit L30).
    expect(row(allowance!.title).getByText('Charged $83.00 · Refunded $12.00')).toBeVisible();
    expect(row(allowance!.title).getAllByText('$71.00').length).toBeGreaterThan(0);
    expect(row(desk!.title).getAllByText('$63.00').length).toBeGreaterThan(0);
    expect(row(desk!.title).queryByText(/Refunded/)).not.toBeInTheDocument();
    expect(row(yard!.title).getByText('Charged $94.50 · Refunded $94.50')).toBeVisible();
    expect(row(yard!.title).getAllByText('$0.00').length).toBeGreaterThan(0);
    for (const receipt of mayaPaymentsPageData.receipts) {
      const link = screen.getByRole('link', { name: receipt.title });
      expect(link).toHaveAttribute('href', routes.app.receipt(receipt.bookingId));
      const item = within(link.closest('li')!);
      expect(item.getByText(`Helper: ${receipt.helper.displayName}`)).toBeVisible();
      expect(item.getByText(messages.status.payment[receipt.status])).toBeVisible();
      expect(item.getAllByText(copy.youPaid).length).toBeGreaterThan(0);
      expect(link.closest('li')!.querySelector('time')).toHaveAttribute('dateTime', receipt.paidAt);
    }
  });

  it('renders the supplied net even when a synthetic row does not balance', () => {
    const receipt = { ...mayaPaymentsPageData.receipts[0]!, netCents: 6600 };
    mount({ ...mayaPaymentsPageData, receipts: [receipt] });
    expect(screen.getByText('Charged $83.00 · Refunded $12.00')).toBeVisible();
    expect(screen.getAllByText('$66.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$71.00')).not.toBeInTheDocument();
  });

  it('puts the saved cards before the receipts and groups receipts by month, the older ones folded', () => {
    const { container } = mount(mayaPaymentsHistoryData);
    const cards = screen.getByRole('heading', { name: copy.cards, level: 2 });
    const receipts = screen.getByRole('heading', { name: copy.receipts, level: 2 });
    expect(cards.compareDocumentPosition(receipts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Each month once, folded or not: the newest five end in September, so the rest of September shows with them
    // rather than under its own second "Sep 2026" behind "Show older receipts" (sweep).
    for (const month of ['Nov 2026', 'Oct 2026', 'Sep 2026', 'Aug 2026']) expect(screen.getAllByRole('heading', { level: 3, name: month, hidden: true })).toHaveLength(1);
    // Six show; the other two (August) are behind "Show 2 older receipts".
    const details = container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('Show 2 older receipts')).toBeInTheDocument();
    for (const receipt of mayaPaymentsHistoryData.receipts.slice(6)) expect(details).toContainElement(screen.getByRole('link', { name: receipt.title, hidden: true }));
    for (const receipt of mayaPaymentsHistoryData.receipts.slice(0, 6)) expect(details).not.toContainElement(screen.getByRole('link', { name: receipt.title }));
  });

  it('folds nothing when the newest month alone runs past five, and keeps a month that starts after the fifth folded whole', () => {
    const november = mayaPaymentsHistoryData.receipts.slice(0, 2);
    const many = Array.from({ length: 6 }, (_, index) => ({ ...november[index % 2]!, bookingId: `bkg_nov_${index}`, title: `November job ${index + 1}`, paidAt: `2026-11-${String(20 - index).padStart(2, '0')}T15:00:00.000Z` }));
    const { container, unmount } = mount({ ...mayaPaymentsHistoryData, receipts: many });
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 3, name: 'Nov 2026' })).toHaveLength(1);
    unmount();
    // Five in November and October, then September: the cut stays at five.
    const atBoundary = [...mayaPaymentsHistoryData.receipts.slice(0, 4), { ...mayaPaymentsHistoryData.receipts[3]!, bookingId: 'bkg_oct_extra', title: 'October extra', paidAt: '2026-10-02T15:00:00.000Z' }, ...mayaPaymentsHistoryData.receipts.slice(4)];
    const second = mount({ ...mayaPaymentsHistoryData, receipts: atBoundary });
    expect(within(second.container.querySelector('details')!).getByText(`Show ${atBoundary.length - 5} older receipts`)).toBeInTheDocument();
    for (const month of ['Nov 2026', 'Oct 2026', 'Sep 2026', 'Aug 2026']) expect(screen.getAllByRole('heading', { level: 3, name: month, hidden: true })).toHaveLength(1);
  });

  it('keeps the add-card form a tap away when cards are saved, and moves focus to it', () => {
    mount();
    expect(screen.queryByRole('form', { name: copy.addTitle })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.addTitle }));
    expect(addForm()).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: copy.addTitle })).toHaveFocus();
  });

  it('explains empty receipts and cards and offers the task route', () => {
    mount(paymentsEmptyData);
    expect(screen.getByText(copy.emptyTitle)).toBeVisible();
    expect(screen.getByText(copy.noCards)).toBeVisible();
    expect(screen.getByRole('link', { name: copy.postTask })).toHaveAttribute('href', routes.app.newTask());
    expect(screen.queryByRole('button', { name: copy.remove })).not.toBeInTheDocument();
    expect(addForm()).toBeVisible();
  });

  it('shows masked cards, expiry, and the supplied default', () => {
    mountAdding();
    expect(within(visa()).getByText('Expires 08/28')).toBeVisible();
    expect(within(visa()).getByText(messages.payments.picker.default)).toBeVisible();
    // The default card says so and has no "Make default".
    expect(within(visa()).queryByRole('button', { name: copy.makeDefault })).not.toBeInTheDocument();
    expect(within(mastercard()).getByText('Expires 03/27')).toBeVisible();
    expect(within(mastercard()).getByRole('button', { name: copy.makeDefault })).toBeEnabled();
    for (const card of DEV_TEST_CARDS) expect(screen.getByRole('radio', { name: messages.payments.testCards[card] })).toBeVisible();
    expect(screen.getByText(copy.development)).toBeVisible();
  });

  it("says when a card can't be used here, offers no Make default for it, and keeps Remove (J-AB4)", () => {
    mount({ ...mayaPaymentsPageData, methods: mayaPaymentsPageData.methods.map((method) => (method.id === 'pm_maya_mc' ? { ...method, unusable: true as const } : method)) });
    expect(within(mastercard()).getByText(messages.payments.picker.unusable)).toBeVisible();
    expect(within(mastercard()).queryByRole('button', { name: copy.makeDefault })).not.toBeInTheDocument();
    expect(within(mastercard()).getByRole('button', { name: copy.remove })).toBeEnabled();
    expect(within(visa()).queryByText(messages.payments.picker.unusable)).not.toBeInTheDocument();
  });

  it('asks before removal and returns focus when the person keeps the card', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    const trigger = within(visa()).getByRole('button', { name: copy.remove });
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog', { name: copy.removeTitle });
    expect(within(dialog).getByText('Visa •••• 1881')).toBeVisible();
    expect(handlers.onRemoveCard).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: copy.keepCard }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(handlers.onRemoveCard).not.toHaveBeenCalled();
  });

  it('explains a card used for a booking and keeps confirmation open until canceled', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(undefined, { onRemoveCard: vi.fn().mockResolvedValue({ ok: false, code: 'not_allowed' }) });
    const trigger = within(visa()).getByRole('button', { name: copy.remove });
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: copy.confirmRemove }));
    const feedback = await within(dialog).findByText(copy.removeNotAllowed);
    expect(feedback.closest('[aria-live]')).not.toBeNull();
    expect(handlers.onRemoveCard).toHaveBeenCalledExactlyOnceWith({ methodId: mayaPaymentsPageData.methods[0]!.id });
    expect(dialog).toBeVisible();
    expect(navigation.refresh).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: copy.keepCard }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByText(copy.removeNotAllowed)).toBeVisible();
  });

  it('removes only the selected card, refreshes, and follows redirectTo', async () => {
    const user = userEvent.setup();
    const redirectTo = routes.app.payments();
    const { handlers } = mount(undefined, { onRemoveCard: vi.fn().mockResolvedValue({ ok: true, code: 'updated', redirectTo }) });
    await user.click(within(mastercard()).getByRole('button', { name: copy.remove }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: copy.confirmRemove }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(handlers.onRemoveCard).toHaveBeenCalledExactlyOnceWith({ methodId: mayaPaymentsPageData.methods[1]!.id });
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
    expect(screen.getByText(copy.removed)).toBeVisible();
  });

  it('sends the selected card id to make default and refreshes the saved result', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(within(mastercard()).getByRole('button', { name: copy.makeDefault }));
    expect(await screen.findByText(copy.defaultUpdated)).toBeVisible();
    expect(handlers.onMakeDefault).toHaveBeenCalledExactlyOnceWith({ methodId: mayaPaymentsPageData.methods[1]!.id });
    expect(handlers.onRemoveCard).not.toHaveBeenCalled();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('preserves removal confirmation and focus after refreshed data drops the removed card', async () => {
    const user = userEvent.setup();
    const { handlers, rerender } = mount();
    await user.click(within(mastercard()).getByRole('button', { name: copy.remove }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: copy.confirmRemove }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());

    const data = { ...mayaPaymentsPageData, methods: [mayaPaymentsPageData.methods[0]!] };
    rerender(<NextIntlClientProvider locale="en" messages={messages}><PaymentsScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>);

    expect(screen.queryByRole('listitem', { name: 'Mastercard •••• 4444' })).not.toBeInTheDocument();
    expect(screen.getByText(copy.removed)).toBeVisible();
    expect(screen.getByText(copy.removed).closest('[aria-live]')).not.toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: copy.cards, level: 2 })).toHaveFocus());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('disables removal and cancellation while one removal request is pending', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onRemoveCard = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount(undefined, { onRemoveCard });
    await user.click(within(visa()).getByRole('button', { name: copy.remove }));
    const dialog = await screen.findByRole('alertdialog');
    const remove = within(dialog).getByRole('button', { name: copy.confirmRemove });
    fireEvent.click(remove);
    fireEvent.click(remove);
    expect(onRemoveCard).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole('button', { name: copy.removing })).toBeDisabled();
    expect(remove).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: copy.keepCard })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(dialog).toBeVisible();
    await act(async () => finish({ ok: false, code: 'unknown' }));
    expect(await within(dialog).findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: copy.confirmRemove })).toBeEnabled();
  });

  it('blocks duplicate default requests and restores the card controls after failure', async () => {
    let finish!: (result: ActionResult) => void;
    const onMakeDefault = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mount(undefined, { onMakeDefault });
    const card = mastercard();
    const makeDefault = within(card).getByRole('button', { name: copy.makeDefault });
    fireEvent.click(makeDefault);
    fireEvent.click(makeDefault);
    expect(onMakeDefault).toHaveBeenCalledOnce();
    expect(makeDefault).toBeDisabled();
    expect(makeDefault).toHaveAttribute('aria-busy', 'true');
    expect(within(card).getByRole('button', { name: copy.remove })).toBeDisabled();
    await act(async () => finish({ ok: false, code: 'not_found' }));
    expect(await within(card).findByText(messages.feedback.error.not_found)).toBeVisible();
    expect(makeDefault).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('sends the chosen test card and default choice, preserving both after a decline', async () => {
    const user = userEvent.setup();
    const { handlers } = mountAdding(undefined, { onAddCard: vi.fn().mockResolvedValue({ ok: false, code: 'payment_declined' }) });
    const declined = screen.getByRole('radio', { name: messages.payments.testCards.declined });
    await user.click(declined);
    await user.click(defaultCheckbox());
    await user.click(addButton());
    expect(await screen.findByText(copy.declined)).toBeVisible();
    expect(handlers.onAddCard).toHaveBeenCalledExactlyOnceWith({ card: 'declined', makeDefault: true });
    expect(declined).toBeChecked();
    expect(defaultCheckbox()).toBeChecked();
    expect(addForm()).toBeVisible();
    expect(addButton()).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('refreshes after adding and follows a supplied redirect', async () => {
    const user = userEvent.setup();
    const redirectTo = routes.app.payments();
    const { handlers } = mountAdding(undefined, { onAddCard: vi.fn().mockResolvedValue({ ok: true, code: 'saved', redirectTo }) });
    await user.click(addButton());
    expect(await screen.findByText(copy.saved)).toBeVisible();
    expect(handlers.onAddCard).toHaveBeenCalledExactlyOnceWith({ card: 'success', makeDefault: false });
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(redirectTo);
  });

  it('locks all add-card controls and ignores duplicate submission while pending', async () => {
    let finish!: (result: ActionResult) => void;
    const onAddCard = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    mountAdding(undefined, { onAddCard });
    fireEvent.submit(addForm());
    fireEvent.submit(addForm());
    const pending = await screen.findByRole('button', { name: copy.adding });
    expect(onAddCard).toHaveBeenCalledOnce();
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(addForm()).toHaveAttribute('aria-busy', 'true');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(defaultCheckbox()).toBeDisabled();
    fireEvent.submit(addForm());
    expect(onAddCard).toHaveBeenCalledOnce();
    await act(async () => finish({ ok: false, code: 'rate_limited' }));
    expect(await screen.findByText(messages.forms.actionErrors.rate_limited)).toBeVisible();
    expect(addButton()).toBeEnabled();
    expect(defaultCheckbox()).toBeEnabled();
  });

  it.each(['card', 'makeDefault'] as const)('focuses the %s field after server validation fails', async (field) => {
    const user = userEvent.setup();
    mountAdding(undefined, { onAddCard: vi.fn().mockResolvedValue({ ok: false, code: 'validation_failed', fieldErrors: { [field]: ['invalid'] } }) });
    await user.click(addButton());
    expect(await screen.findByText(messages.forms.fieldErrors.invalid)).toBeVisible();
    const control = field === 'card' ? screen.getByRole('radio', { name: messages.payments.testCards.success }) : defaultCheckbox();
    await waitFor(() => expect(control).toHaveFocus());
    expect(addButton()).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(ACTION_ERROR_CODES)('announces friendly add-card feedback for %s', async (code) => {
    const user = userEvent.setup();
    mountAdding(undefined, { onAddCard: vi.fn().mockResolvedValue({ ok: false, code }) });
    await user.click(addButton());
    const expected = code === 'payment_declined' ? copy.declined
      : code in messages.forms.actionErrors ? messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors]
        : messages.feedback.error[code];
    const feedback = await screen.findByText(expected);
    expect(feedback).toBeVisible();
    expect(feedback.closest('[aria-live]')).not.toBeNull();
    expect(addButton()).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('handles rejected add-card requests without losing the current selection', async () => {
    const user = userEvent.setup();
    mountAdding(undefined, { onAddCard: vi.fn().mockRejectedValue(new Error('offline')) });
    await user.click(screen.getByRole('radio', { name: messages.payments.testCards.insufficient_funds }));
    await user.click(addButton());
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('radio', { name: messages.payments.testCards.insufficient_funds })).toBeChecked();
    expect(addButton()).toBeEnabled();
  });
});
