/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_REWARD_FILTERS,
  REWARD_PROGRAM_CODES,
  REWARD_RISK_SIGNALS,
  REWARD_STATUSES,
  routes,
  type ActionResult,
  type AdminRewardsHandlers,
  type AdminRewardsPageData,
  type StaffRewardActionId,
} from '@/contracts';
import { ADMIN_NOW, adminRewardsEmptyData, adminRewardsFailedData, adminRewardsReviewData } from '@/fixtures';
import { formatDateTime, formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminRewards.json';
import { AdminRewardList } from './admin-reward-list';
import { AdminRewardsScreen } from './admin-rewards-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const note = 'Checked the booking and account signals.';
const rewardActions: StaffRewardActionId[] = ['approve_review', 'reject_review', 'void', 'reissue'];

function mount(data: AdminRewardsPageData = adminRewardsReviewData, onDecide: AdminRewardsHandlers['onDecide'] = vi.fn().mockResolvedValue({ ok: true, code: 'updated' })) {
  return { onDecide, ...render(<NextIntlClientProvider locale="en" messages={messages}><AdminRewardsScreen data={data} handlers={{ onDecide }} now={ADMIN_NOW} /></NextIntlClientProvider>) };
}

function decisionData(action: StaffRewardActionId): AdminRewardsPageData {
  const data = action === 'reissue' ? adminRewardsFailedData : adminRewardsReviewData;
  return { ...data, rows: [{ ...data.rows[0], actions: [action] }] };
}

async function openDecision(user: ReturnType<typeof userEvent.setup>, action: StaffRewardActionId = 'approve_review') {
  const trigger = screen.getAllByRole('button', { name: copy.actions[action] })[0];
  await user.click(trigger);
  const dialog = screen.getByRole('alertdialog', { name: copy.decision.titles[action] });
  return {
    trigger,
    dialog,
    input: within(dialog).getByRole('textbox', { name: copy.decision.note }),
    submit: within(dialog).getByRole('button', { name: copy.actions[action] }),
  };
}

describe('AdminRewardsScreen', () => {
  it('shows filter counts, booking context, supplied money, hold time and every supplied signal', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
    const filters = screen.getByRole('navigation', { name: copy.filtersLabel });
    for (const filter of ADMIN_REWARD_FILTERS) {
      const link = within(filters).getByRole('link', { name: `${copy.filters[filter]} ${adminRewardsReviewData.counts[filter]}` });
      expect(link).toHaveAttribute('href', routes.admin.rewards(filter));
      if (filter === adminRewardsReviewData.filter) expect(link).toHaveAttribute('aria-current', 'page');
      else expect(link).not.toHaveAttribute('aria-current');
    }
    const row = adminRewardsReviewData.rows[0];
    const list = screen.getByRole('list', { name: copy.results });
    const card = list.children[0] as HTMLElement;
    expect(within(card).getByText(formatMoney(row.amountCents))).toBeVisible();
    expect(within(card).getByRole('link', { name: row.helper.displayName })).toHaveAttribute('href', routes.admin.user(row.helper.id));
    expect(within(card).getByRole('link', { name: row.booking!.client.displayName })).toHaveAttribute('href', routes.admin.user(row.booking!.client.id));
    expect(within(card).getByRole('link', { name: row.booking!.title })).toHaveAttribute('href', routes.admin.booking(row.booking!.id));
    expect(within(card).getByText(copy.price.replace('{amount}', formatMoney(row.booking!.priceCents)))).toBeVisible();
    expect(within(card).getByText(copy.completed.replace('{at}', formatDateTime(row.booking!.completedAt!)))).toBeVisible();
    expect(card.querySelector(`time[datetime="${row.holdUntil}"]`)).not.toBeNull();
    const signals = within(card).getByRole('list', { name: copy.signalsLabel });
    expect(within(signals).getAllByRole('listitem').map((item) => item.textContent)).toEqual(row.signals.map((signal) => copy.signals[signal]));
  });

  it('displays committed and delivered amounts against the supplied budget and omits unset meters', () => {
    mount();
    const section = screen.getByRole('region', { name: copy.budgets.title });
    const capped = adminRewardsReviewData.budgets[0];
    const meters = within(section).getAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(meters[0]).toHaveAttribute('value', String(capped.committedCents));
    expect(meters[1]).toHaveAttribute('value', String(capped.deliveredCents));
    for (const meter of meters) expect(meter).toHaveAttribute('max', String(capped.budgetCents));
    for (const budget of adminRewardsReviewData.budgets) {
      const card = within(section).getByRole('heading', { name: copy.programs[budget.program] }).closest('li')!;
      expect(within(card).getByText(formatMoney(budget.committedCents))).toBeVisible();
      expect(within(card).getByText(formatMoney(budget.deliveredCents))).toBeVisible();
      if (budget.budgetCents === undefined) {
        expect(within(card).queryByRole('meter')).not.toBeInTheDocument();
        expect(within(card).getByText(copy.budgets.unset)).toBeVisible();
      }
    }
  });

  it('renders exactly the supplied action order and none when the row has no actions', () => {
    const row = { ...adminRewardsReviewData.rows[0], actions: ['void', 'approve_review'] as StaffRewardActionId[] };
    const view = mount({ ...adminRewardsReviewData, rows: [row] });
    const groups = screen.getAllByRole('group', { name: copy.actionsLabel.replace('{name}', row.helper.displayName) });
    for (const group of groups) expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(row.actions.map((action) => copy.actions[action]));
    expect(screen.queryByRole('button', { name: copy.actions.reject_review })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.actions.reissue })).not.toBeInTheDocument();
    view.unmount();
    mount({ ...adminRewardsReviewData, rows: [{ ...row, actions: [] }] });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    for (const message of screen.getAllByText(copy.noActions)) expect(message).toBeVisible();
  });

  it('keeps person-page reward rows read-only even when their fixture supplies actions', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><AdminRewardList rows={adminRewardsReviewData.rows} now={ADMIN_NOW} /></NextIntlClientProvider>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: copy.columns.actions })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: adminRewardsReviewData.rows[0].helper.displayName })) expect(link).toHaveAttribute('href', routes.admin.user(adminRewardsReviewData.rows[0].helper.id));
  });

  it('shows the empty state with an all-rewards route and covers every contract copy value', () => {
    mount(adminRewardsEmptyData);
    expect(screen.getByRole('heading', { name: copy.emptyTitle })).toBeVisible();
    expect(screen.getByRole('link', { name: copy.viewAll })).toHaveAttribute('href', routes.admin.rewards('all'));
    for (const signal of REWARD_RISK_SIGNALS) expect(copy.signals[signal]).toBeTruthy();
    for (const filter of ADMIN_REWARD_FILTERS) expect(copy.filters[filter]).toBeTruthy();
    for (const program of REWARD_PROGRAM_CODES) expect(copy.programs[program]).toBeTruthy();
    for (const status of REWARD_STATUSES) expect(messages.status.reward[status]).toBeTruthy();
    for (const action of rewardActions) {
      expect(copy.actions[action]).toBeTruthy();
      expect(copy.decision.titles[action]).toBeTruthy();
      expect(copy.decision.descriptions[action]).toBeTruthy();
    }
  });

  it.each(rewardActions)('requires a trimmed ten-character note for %s and sends only the schema fields', async (action) => {
    const user = userEvent.setup();
    const data = decisionData(action);
    const { onDecide } = mount(data);
    const { input, submit, dialog } = await openDecision(user, action);
    expect(dialog).toHaveAccessibleDescription(copy.decision.descriptions[action]);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: copy.decision.cancel })).toHaveFocus());
    if (action === 'reject_review' || action === 'void') expect(dialog).toHaveTextContent("The helper won't get this gift card.");
    fireEvent.change(input, { target: { value: ' 123456789 ' } });
    await user.click(submit);
    expect(await screen.findByText(copy.decision.tooShort)).toBeVisible();
    expect(onDecide).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: ' 1234567890 ' } });
    await user.click(submit);
    await waitFor(() => expect(onDecide).toHaveBeenCalledExactlyOnceWith({ grantId: data.rows[0].id, action, note: '1234567890' }));
    expect(await screen.findByText(copy.decision.updated)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toContainElement(screen.getByText(copy.decision.updated)));
  });

  it('preserves the success confirmation and focus when refresh removes the last reward', async () => {
    const user = userEvent.setup();
    const { onDecide, rerender } = mount(decisionData('approve_review'));
    const { input, submit } = await openDecision(user);
    fireEvent.change(input, { target: { value: note } });
    await user.click(submit);
    expect(await screen.findByText(copy.decision.updated)).toBeVisible();
    await waitFor(() => expect(document.activeElement).toContainElement(screen.getByText(copy.decision.updated)));
    const confirmation = document.activeElement;
    rerender(<NextIntlClientProvider locale="en" messages={messages}><AdminRewardsScreen data={adminRewardsEmptyData} handlers={{ onDecide }} now={ADMIN_NOW} /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: copy.emptyTitle })).toBeVisible();
    expect(screen.getByText(copy.decision.updated)).toBeVisible();
    expect(confirmation).toHaveFocus();
    expect(confirmation).toContainElement(screen.getByText(copy.decision.updated));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onDecide).toHaveBeenCalledOnce();
  });

  it('returns focus to the action trigger when the decision is canceled', async () => {
    const user = userEvent.setup();
    const { onDecide } = mount(decisionData('approve_review'));
    const { dialog, trigger } = await openDecision(user);
    await user.click(within(dialog).getByRole('button', { name: copy.decision.cancel }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onDecide).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('rejects empty and overlong notes before calling the handler', async () => {
    const user = userEvent.setup();
    const { onDecide } = mount(decisionData('approve_review'));
    const { input, submit } = await openDecision(user);
    await user.click(submit);
    expect(await screen.findByText(copy.decision.tooShort)).toBeVisible();
    fireEvent.change(input, { target: { value: 'x'.repeat(1001) } });
    await user.click(submit);
    expect(await screen.findByText(copy.decision.tooLong)).toBeVisible();
    expect(onDecide).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(['validation_failed', 'not_allowed', 'unknown'] as const)('keeps the note and shows friendly feedback for %s', async (code) => {
    const user = userEvent.setup();
    mount(decisionData('approve_review'), vi.fn().mockResolvedValue({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { note: ['too_short'] } } : {}) }));
    const { input, submit } = await openDecision(user);
    fireEvent.change(input, { target: { value: note } });
    await user.click(submit);
    const expected = code === 'not_allowed' ? copy.decision.notAllowed : messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeVisible();
    expect(input).toHaveValue(note);
    expect(input).toBeEnabled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(navigation.refresh).not.toHaveBeenCalled();
    if (code === 'validation_failed') {
      expect(await screen.findByText(copy.decision.tooShort)).toBeVisible();
      await waitFor(() => expect(input).toHaveFocus());
    }
    if (code === 'not_allowed') {
      await user.click(screen.getByRole('button', { name: copy.decision.refresh }));
      expect(navigation.refresh).toHaveBeenCalledOnce();
    }
  });

  it('locks pending decisions, prevents duplicate requests and follows the supplied redirect', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onDecide = vi.fn<AdminRewardsHandlers['onDecide']>(() => new Promise((resolve) => { finish = resolve; }));
    mount(decisionData('approve_review'), onDecide);
    const { input, submit } = await openDecision(user);
    fireEvent.change(input, { target: { value: note } });
    await user.click(submit);
    const form = screen.getByRole('form', { name: copy.decision.titles.approve_review });
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.decision.working })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.decision.cancel })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.submit(form);
    await act(async () => finish({ ok: true, code: 'updated', redirectTo: routes.admin.rewards('all') }));
    expect(onDecide).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.admin.rewards('all'));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('recovers from a thrown handler failure without losing the note', async () => {
    const user = userEvent.setup();
    mount(decisionData('approve_review'), vi.fn().mockRejectedValue(new Error('offline')));
    const { input, submit } = await openDecision(user);
    fireEvent.change(input, { target: { value: note } });
    await user.click(submit);
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(input).toHaveValue(note);
    expect(input).toBeEnabled();
    expect(submit).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
