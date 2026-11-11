/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, TASK_CANCEL_REASONS, routes, type ActionResult, type TaskOwnerHandlers, type TaskOwnerView } from '@/contracts';
import { deskOwnerBookedView, deskOwnerNoOffersView, deskOwnerView, remoteOwnerView } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import taskManage from '../../../../messages/en/ui/taskManage.json';
import offers from '../../../../messages/en/ui/offers.json';
import myTasks from '../../../../messages/en/ui/myTasks.json';
import feedback from '../../../../messages/en/ui/feedback.json';
import actionReasons from '../../../../messages/en/ui/actionReasons.json';
import { TaskManageScreen, type TaskManageScreenProps } from './task-manage-screen';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = '2026-11-17T15:00:00.000Z';
function ownerHandlers(overrides: Partial<TaskOwnerHandlers> = {}): TaskOwnerHandlers {
  return {
    onTaskAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    onOfferAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    onCancelTask: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'canceled' })),
    ...overrides,
  };
}
function show(data: TaskOwnerView = deskOwnerView, handlers = ownerHandlers(), extras: Partial<Pick<TaskManageScreenProps, 'initialCancelOpen' | 'initialSelectedOfferIds'>> = {}) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, taskManage, offers, myTasks }}><TaskManageScreen data={data} handlers={handlers} now={now} {...extras} /></NextIntlClientProvider>);
}

describe('TaskManageScreen actions', () => {
  it('requires a cancellation reason and submits it only after confirmation', async () => {
    const user = userEvent.setup();
    const handlers = ownerHandlers();
    show(deskOwnerView, handlers);
    const trigger = screen.getByRole('button', { name: 'Cancel task' });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this task?' });
    expect(within(dialog).getByRole('radio', { name: taskManage.cancel.reasons.no_longer_needed })).toHaveFocus();
    const submit = within(dialog).getByRole('button', { name: 'Cancel task' });
    expect(submit).toBeDisabled();
    expect(handlers.onCancelTask).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('radio', { name: taskManage.cancel.reasons.no_longer_needed }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(handlers.onCancelTask).toHaveBeenCalledExactlyOnceWith({ reason: 'no_longer_needed' });
    expect(handlers.onTaskAction).not.toHaveBeenCalled();
    expect(await screen.findByText(feedback.success.canceled)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps the task when the cancellation sheet is dismissed', async () => {
    const user = userEvent.setup();
    const handlers = ownerHandlers();
    show(deskOwnerView, handlers, { initialCancelOpen: true });
    await user.click(screen.getByRole('button', { name: 'Keep task' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(handlers.onCancelTask).not.toHaveBeenCalled();
  });

  it('closes the More sheet for cancellation and restores More focus when dismissed', async () => {
    const user = userEvent.setup();
    const handlers = ownerHandlers();
    show(deskOwnerNoOffersView, handlers);
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    const sheet = screen.getByRole('dialog', { name: 'More actions' });
    const trigger = within(sheet).getByRole('button', { name: 'Cancel task' });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this task?' });
    expect(sheet).not.toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: taskManage.cancel.reasons.no_longer_needed })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Keep task' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(handlers.onCancelTask).not.toHaveBeenCalled();
  });

  it('shows cancellation success after the More sheet closes and returns focus to More', async () => {
    const user = userEvent.setup();
    const handlers = ownerHandlers();
    show(deskOwnerNoOffersView, handlers);
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    const sheet = screen.getByRole('dialog', { name: 'More actions' });
    await user.click(within(sheet).getByRole('button', { name: 'Cancel task' }));
    expect(sheet).not.toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this task?' });
    await user.click(within(dialog).getByRole('radio', { name: taskManage.cancel.reasons.no_longer_needed }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel task' }));
    const confirmation = await screen.findByText(feedback.success.canceled);
    expect(confirmation).toBeVisible();
    expect(confirmation.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    expect(confirmation.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'More actions' })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(handlers.onCancelTask).toHaveBeenCalledExactlyOnceWith({ reason: 'no_longer_needed' });
  });

  it('calls invite_helpers and follows the supplied redirect', async () => {
    const user = userEvent.setup();
    const destination = routes.app.helpers();
    const handlers = ownerHandlers({ onTaskAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: destination })) });
    show(deskOwnerView, handlers);
    await user.click(screen.getByRole('button', { name: 'Invite helpers' }));
    expect(handlers.onTaskAction).toHaveBeenCalledExactlyOnceWith({ action: 'invite_helpers' });
    expect(push).toHaveBeenCalledExactlyOnceWith(destination);
  });

  it('preserves task action order, disabled reasons, and requested confirmation', async () => {
    const user = userEvent.setup();
    const handlers = ownerHandlers();
    const { container } = show({ ...deskOwnerNoOffersView, actions: [
      { id: 'edit_task', kind: 'secondary', enabled: false, disabledReason: { code: 'not_allowed' } },
      { id: 'post_again', kind: 'primary', enabled: true, confirm: true },
      { id: 'invite_helpers', kind: 'secondary', enabled: true },
    ] }, handlers);
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (button) => button.getAttribute('data-action-id'))).toEqual(['edit_task', 'post_again', 'invite_helpers']);
    const edit = screen.getByRole('button', { name: 'Edit task' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription(actionReasons.not_allowed);
    await user.click(edit);
    expect(handlers.onTaskAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Post again' }));
    expect(handlers.onTaskAction).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }));
    expect(handlers.onTaskAction).toHaveBeenCalledExactlyOnceWith({ action: 'post_again' });
  });

  it('locks the cancellation form while pending and prevents duplicate submission', async () => {
    const user = userEvent.setup();
    let finish: (result: ActionResult) => void = () => {};
    const handlers = ownerHandlers({ onCancelTask: vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; })) });
    show(deskOwnerView, handlers, { initialCancelOpen: true });
    await user.click(screen.getByRole('radio', { name: taskManage.cancel.reasons.other }));
    await user.dblClick(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel task' }));
    const pending = screen.getByRole('button', { name: /Canceling task/ });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending.closest('form')).toHaveAttribute('aria-busy', 'true');
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep task' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(handlers.onCancelTask).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'canceled' }));
    expect(await screen.findByText(feedback.success.canceled)).toBeVisible();
  });

  it.each(ACTION_ERROR_CODES)('keeps the cancellation reason and announces %s errors', async (code) => {
    const user = userEvent.setup();
    const handlers = ownerHandlers({ onCancelTask: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code })) });
    show(deskOwnerView, handlers, { initialCancelOpen: true });
    await user.click(screen.getByRole('radio', { name: taskManage.cancel.reasons.found_help_elsewhere }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel task' }));
    expect(await screen.findByText(feedback.error[code])).toBeVisible();
    expect(screen.getByRole('radio', { name: taskManage.cancel.reasons.found_help_elsewhere })).toBeChecked();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel task' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('focuses the reason group when the handler returns a field error', async () => {
    const user = userEvent.setup();
    const handlers = ownerHandlers({ onCancelTask: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['required'] } })) });
    show(deskOwnerView, handlers, { initialCancelOpen: true });
    await user.click(screen.getByRole('radio', { name: taskManage.cancel.reasons.other }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel task' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: taskManage.cancel.reasons.no_longer_needed })).toHaveFocus());
    expect(screen.getByRole('group', { name: taskManage.cancel.reason })).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('TaskManageScreen offers and task details', () => {
  it('shows a comparison after two selections with the supplied poster totals', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('checkbox', { name: "Compare Jordan T.'s offer" }));
    expect(screen.queryByRole('table', { name: 'Compare offers' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: "Compare Sam K.'s offer" }));
    const table = screen.getByRole('table', { name: 'Compare offers' });
    expect(within(table).getByText('$66.00')).toBeVisible();
    expect(within(table).getByText('$60.50')).toBeVisible();
    expect(screen.getByText('2 offers selected')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('table', { name: 'Compare offers' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);
  });

  it('sorts lowest price first without changing the original offer order', async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getAllByRole('checkbox').map((checkbox) => checkbox.closest('label')?.textContent)).toEqual(deskOwnerView.offers.map((offer) => `Compare ${offer.helper.displayName}'s offer`));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort offers' }), 'lowest');
    expect(screen.getAllByRole('checkbox')[0].closest('label')).toHaveTextContent("Compare Lee M.'s offer");
    expect(deskOwnerView.offers[0].id).toBe('off_jordan');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort offers' }), 'newest');
    expect(screen.getAllByRole('checkbox')[0].closest('label')).toHaveTextContent("Compare Jordan T.'s offer");
  });

  it('limits comparison to three offers and allows another selection after one is cleared', async () => {
    const user = userEvent.setup();
    show({ ...deskOwnerView, offers: [...deskOwnerView.offers, { ...deskOwnerView.offers[0], id: 'off_fourth' }] });
    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) await user.click(checkbox);
    expect(checkboxes.slice(0, 3).every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    expect(checkboxes[3]).not.toBeChecked();
    expect(screen.getByText(taskManage.compareLimit)).toBeVisible();
    await user.click(checkboxes[0]);
    await user.click(checkboxes[3]);
    expect(checkboxes[3]).toBeChecked();
    expect(screen.getByText('3 offers selected')).toBeVisible();
  });

  it('shows the address only inside Your task and labels the supplied details', () => {
    show();
    const details = screen.getByRole('region', { name: 'Your task' });
    expect(within(details).getByText('1234 Example Lane')).toBeVisible();
    expect(screen.getAllByText('1234 Example Lane')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: '3 offers' })).queryByText(/1234 Example Lane/)).not.toBeInTheDocument();
    expect(within(details).getByText(deskOwnerView.description)).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('links the booked notice to the supplied booking', () => {
    show(deskOwnerBookedView);
    expect(screen.getByRole('link', { name: 'View booking' })).toHaveAttribute('href', routes.app.booking('bkg_desk'));
    expect(screen.queryByRole('button', { name: 'Cancel task' })).not.toBeInTheDocument();
  });

  it('explains the local no-offer state using the supplied area', () => {
    show(deskOwnerNoOffersView);
    expect(screen.getByRole('heading', { name: 'No offers yet' })).toBeVisible();
    expect(screen.getByText("We've let helpers near Mueller know. Offers will appear here when helpers respond.")).toBeVisible();
  });

  it('explains a remote task without rendering an address', () => {
    show(remoteOwnerView);
    expect(screen.getByText(taskManage.remoteAddress)).toBeVisible();
    expect(screen.queryByText(/1234 Example Lane/)).not.toBeInTheDocument();
  });
});

describe('task-management copy', () => {
  it('covers each cancellation reason and avoids banned terms', () => {
    for (const reason of TASK_CANCEL_REASONS) expect(taskManage.cancel.reasons).toHaveProperty(reason, expect.any(String));
    expect(JSON.stringify({ taskManage, myTasks, offers })).not.toMatch(/\b(hire|bid|wages)\b/i);
  });
});
