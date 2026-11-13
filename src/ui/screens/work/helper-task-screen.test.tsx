/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, OFFER_ACTION_IDS, routes, type ActionResult, type HelperTaskView, type HelperWorkHandlers } from '@/contracts';
import { deskBreakdown, deskOfferMessageDraft, helperComputerBlocked, helperDeskStaleOffer, helperDeskWithOffer, helperMovingHourly } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import helperTask from '../../../../messages/en/ui/helperTask.json';
import findWork from '../../../../messages/en/ui/findWork.json';
import actions from '../../../../messages/en/ui/actions.json';
import feedback from '../../../../messages/en/ui/feedback.json';
import actionReasons from '../../../../messages/en/ui/actionReasons.json';
import { HelperTaskScreen } from './helper-task-screen';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = '2026-11-17T15:00:00.000Z';
function makeHandlers(overrides: Partial<HelperWorkHandlers> = {}): HelperWorkHandlers {
  return {
    onQuote: vi.fn(async () => deskBreakdown),
    onDraftOfferMessage: vi.fn(async () => ({ ok: true as const, message: deskOfferMessageDraft })),
    onSubmitOffer: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent' })),
    onReviseOffer: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    onOfferAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    ...overrides,
  };
}
function show(data: HelperTaskView = helperDeskWithOffer, handlers = makeHandlers()) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, helperTask, findWork }}><HelperTaskScreen data={data} handlers={handlers} now={now} /></NextIntlClientProvider>);
}

describe('HelperTaskScreen', () => {
  it.each([helperDeskWithOffer, helperDeskStaleOffer])('keeps the desk address private, showing only its area and supplied details', (data) => {
    const { container } = show(data);
    expect(container).not.toHaveTextContent('1234 Example Lane');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(data.description)).toBeVisible();
    expect(screen.getByText('About 2 miles away')).toBeVisible();
    expect(screen.getByText(helperTask.privacy)).toBeVisible();
    expect(screen.getByRole('region', { name: helperTask.earnings })).toHaveTextContent('$54.00');
  });

  it('opens each task photo in an accessible dialog', async () => {
    const user = userEvent.setup();
    show();
    const trigger = screen.getByRole('button', { name: 'Open photo 1 of 2' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Photo 1 of 2' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('shows the blocked reason without an offer form and links unfinished setup to the supplied step', () => {
    const { rerender } = show(helperComputerBlocked);
    expect(screen.getByText(findWork.blockedReasons.category_not_offered)).toBeVisible();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    const data: HelperTaskView = { ...helperComputerBlocked, blockedReason: 'not_bookable', setup: { bookable: false, bookableCategories: [], nextOnboardingStep: 'identity' } };
    rerender(<NextIntlClientProvider locale="en" messages={{ ...messages, helperTask, findWork }}><HelperTaskScreen data={data} handlers={makeHandlers()} now={now} /></NextIntlClientProvider>);
    expect(screen.getByRole('link', { name: helperTask.finishSetup })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
  });

  it('shows hourly expense allowance without recalculating any amounts', () => {
    show({ ...helperMovingHourly, blockedReason: 'task_closed' });
    expect(screen.getByText('$20.00')).toBeVisible();
    expect(screen.getByText(helperMovingHourly.expenseAllowance!.description)).toBeVisible();
  });

  it('opens the revision form with the offer values and submits to onReviseOffer', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    show(helperDeskWithOffer, handlers);
    await user.click(screen.getByRole('button', { name: actions.revise_offer }));
    expect(screen.getByDisplayValue('60')).toBeVisible();
    expect(screen.getByDisplayValue(helperDeskWithOffer.myOffer!.message)).toBeVisible();
    expect(screen.getByRole('combobox')).toHaveValue('10:00');
    const form = screen.getByDisplayValue('60').closest('form')!;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await user.click(submit);
    expect(handlers.onReviseOffer).toHaveBeenCalledExactlyOnceWith({ pricing: helperDeskWithOffer.myOffer!.pricing, startTime: '10:00', message: helperDeskWithOffer.myOffer!.message, brings: helperDeskWithOffer.myOffer!.brings });
    expect(handlers.onSubmitOffer).not.toHaveBeenCalled();
  });

  it('requires confirmation to withdraw, then passes the offer id and action', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    show(helperDeskWithOffer, handlers);
    await user.click(screen.getByRole('button', { name: actions.withdraw_offer }));
    expect(handlers.onOfferAction).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(actions.withdraw_offer);
    await user.click(within(dialog).getByRole('button', { name: feedback.confirm }));
    expect(handlers.onOfferAction).toHaveBeenCalledExactlyOnceWith({ offerId: 'off_jordan', action: 'withdraw_offer' });
    expect(await screen.findByText(feedback.success.updated)).toBeVisible();
  });

  it('can cancel a revision opened from More and return focus to More', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    show(helperDeskStaleOffer, handlers);
    await user.click(screen.getByRole('button', { name: feedback.more }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: actions.revise_offer }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: helperTask.form.cancel }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: feedback.more })).toHaveFocus();
    expect(handlers.onReviseOffer).not.toHaveBeenCalled();
  });

  it('confirms a stale offer and follows its supplied redirect', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers({ onOfferAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: routes.app.offers() })) });
    show(helperDeskStaleOffer, handlers);
    await user.click(screen.getByRole('button', { name: actions.reconfirm_offer }));
    expect(handlers.onOfferAction).toHaveBeenCalledExactlyOnceWith({ offerId: 'off_sam', action: 'reconfirm_offer' });
    expect(push).toHaveBeenCalledExactlyOnceWith(routes.app.offers());
  });

  it.each(['message_poster', 'withdraw_offer'] as const)('passes %s to the offer handler and follows the supplied redirect', async (action) => {
    const user = userEvent.setup();
    const redirectTo = routes.app.thread('thr_off_jordan');
    const handlers = makeHandlers({ onOfferAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo })) });
    show({ ...helperDeskWithOffer, myOffer: { ...helperDeskWithOffer.myOffer!, actions: [{ id: action, kind: 'secondary', enabled: true }] } }, handlers);
    await user.click(screen.getByRole('button', { name: actions[action] }));
    expect(handlers.onOfferAction).toHaveBeenCalledExactlyOnceWith({ offerId: helperDeskWithOffer.myOffer!.id, action });
    expect(push).toHaveBeenCalledExactlyOnceWith(redirectTo);
  });

  it('preserves supplied action order, disabled reasons, and confirmation for revision', async () => {
    const user = userEvent.setup();
    const data: HelperTaskView = { ...helperDeskWithOffer, myOffer: { ...helperDeskWithOffer.myOffer!, actions: [
      { id: 'withdraw_offer', kind: 'destructive', enabled: false, disabledReason: { code: 'not_allowed' } },
      { id: 'revise_offer', kind: 'primary', enabled: true, confirm: true },
    ] } };
    const { container } = show(data);
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (node) => node.getAttribute('data-action-id'))).toEqual(['withdraw_offer', 'revise_offer']);
    expect(screen.getByRole('button', { name: actions.withdraw_offer })).toBeDisabled();
    expect(screen.getByRole('button', { name: actions.withdraw_offer })).toHaveAccessibleDescription(actionReasons.not_allowed);
    await user.click(screen.getByRole('button', { name: actions.revise_offer }));
    expect(screen.queryByDisplayValue('60')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: feedback.confirm }));
    expect(screen.getByDisplayValue('60')).toBeVisible();
  });

  it('locks actions and announces an async result', async () => {
    const user = userEvent.setup();
    let finish: (result: ActionResult) => void = () => {};
    const handlers = makeHandlers({ onOfferAction: vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; })) });
    show(helperDeskStaleOffer, handlers);
    await user.click(screen.getByRole('button', { name: actions.reconfirm_offer }));
    const pending = screen.getByRole('button', { name: actions.reconfirm_offer });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish({ ok: false, code: 'not_allowed' }));
    expect(await screen.findByText(feedback.error.not_allowed)).toBeVisible();
    expect(screen.getByText(feedback.error.not_allowed).closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it.each(ACTION_ERROR_CODES)('maps the %s action error to friendly copy', async (code) => {
    const user = userEvent.setup();
    show(helperDeskStaleOffer, makeHandlers({ onOfferAction: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code })) }));
    await user.click(screen.getByRole('button', { name: actions.reconfirm_offer }));
    await waitFor(() => expect(screen.getByText(feedback.error[code])).toBeVisible());
    expect(push).not.toHaveBeenCalled();
  });

  it('labels every offer action and keeps screen copy free of banned words', () => {
    for (const action of OFFER_ACTION_IDS) expect(actions[action]).toBeTruthy();
    expect(JSON.stringify(helperTask)).not.toMatch(/\b(?:bid|job board|gig|hire)\b/i);
  });
});
