/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult, AdminCaseHandlers, ResolutionPreviewResult } from '@/contracts';
import { disputeMoneyCaseData, fakeAdminCaseHandlers, fakeHandler, overLimitPreview, releaseFullPreview, settleAt45Preview } from '@/fixtures';
import { formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminCase.json';
import { AdminCaseControls } from './admin-case-controls';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(overrides: Partial<AdminCaseHandlers> = {}) {
  const handlers = {
    ...fakeAdminCaseHandlers,
    onResolve: vi.fn(fakeHandler<Parameters<AdminCaseHandlers['onResolve']>[0]>({ ok: true, code: 'saved' }, 0)),
    onPreviewResolution: vi.fn<AdminCaseHandlers['onPreviewResolution']>().mockResolvedValue({ ok: true, preview: settleAt45Preview }),
    ...overrides,
  };
  render(<NextIntlClientProvider locale="en" messages={messages}><AdminCaseControls data={{ ...disputeMoneyCaseData, resolutions: [...disputeMoneyCaseData.resolutions, 'goodwill_refund'] }} handlers={handlers} initialDialog="resolve"><p>{disputeMoneyCaseData.case.description}</p></AdminCaseControls></NextIntlClientProvider>);
  return handlers;
}

function editSummary() { fireEvent.change(screen.getByRole('textbox', { name: copy.resolve.summary }), { target: { value: '  Both people agreed to settle at a lower price.  ' } }); }
function editAmount(amount: string, goodwill = false) { fireEvent.change(screen.getByRole('textbox', { name: goodwill ? copy.resolve.goodwillAmount : copy.resolve.settlePrice }), { target: { value: amount } }); }

describe('Money resolution form', () => {
  it('previews supplied amounts and sends dollars as cents with the trimmed summary', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    expect(screen.getByRole('alertdialog', { name: copy.resolve.title })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: copy.resolutions.settle }));
    editAmount('45');
    editSummary();
    expect(screen.getByRole('button', { name: copy.resolve.save })).toBeDisabled();
    await waitFor(() => expect(handlers.onPreviewResolution).toHaveBeenCalledExactlyOnceWith({ resolution: 'settle', settlePriceCents: 4500, summary: 'Both people agreed to settle at a lower price.' }));
    expect(await screen.findByText(formatMoney(settleAt45Preview.posterRefundCents))).toBeVisible();
    expect(screen.getByText(formatMoney(settleAt45Preview.helperReceivesCents))).toBeVisible();
    expect(screen.getByText(formatMoney(settleAt45Preview.platformKeepsCents))).toBeVisible();
    await user.click(screen.getByRole('button', { name: copy.resolve.save }));
    await waitFor(() => expect(handlers.onResolve).toHaveBeenCalledExactlyOnceWith({ resolution: 'settle', settlePriceCents: 4500, summary: 'Both people agreed to settle at a lower price.' }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it.each(['60', '61'])('shows a preview field error and prevents a settlement at %s dollars', async (amount) => {
    const user = userEvent.setup();
    const onPreviewResolution = vi.fn<AdminCaseHandlers['onPreviewResolution']>().mockResolvedValue({ ok: false, code: 'validation_failed', fieldErrors: { settlePriceCents: ['invalid'] } });
    const handlers = mount({ onPreviewResolution });
    await user.click(screen.getByRole('radio', { name: copy.resolutions.settle }));
    editAmount(amount);
    editSummary();
    expect(await screen.findByText('Enter a valid price below the agreed $60.00.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: copy.resolve.settlePrice })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: copy.resolve.save })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: copy.resolve.title }));
    expect(handlers.onResolve).not.toHaveBeenCalled();
  });

  it('explains the staff limit and prevents recording an over-limit preview', async () => {
    const user = userEvent.setup();
    const handlers = mount({ onPreviewResolution: vi.fn<AdminCaseHandlers['onPreviewResolution']>().mockResolvedValue({ ok: true, preview: overLimitPreview }) });
    await user.click(screen.getByRole('radio', { name: copy.resolutions.refund_full }));
    editSummary();
    expect(await screen.findByText(copy.resolve.overLimit)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.resolve.save })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: copy.resolve.title }));
    expect(handlers.onResolve).not.toHaveBeenCalled();
  });

  it('invalidates previous money immediately and ignores an obsolete preview response', async () => {
    const user = userEvent.setup();
    const responses: ((value: ResolutionPreviewResult) => void)[] = [];
    const onPreviewResolution = vi.fn<AdminCaseHandlers['onPreviewResolution']>(() => new Promise((resolve) => { responses.push(resolve); }));
    mount({ onPreviewResolution });
    await user.click(screen.getByRole('radio', { name: copy.resolutions.settle }));
    editAmount('45');
    editSummary();
    await waitFor(() => expect(onPreviewResolution).toHaveBeenCalledOnce());
    editAmount('44');
    await waitFor(() => expect(onPreviewResolution).toHaveBeenCalledTimes(2));
    await act(async () => responses[1]!({ ok: true, preview: overLimitPreview }));
    expect(screen.getByText(copy.resolve.overLimit)).toBeVisible();
    await act(async () => responses[0]!({ ok: true, preview: settleAt45Preview }));
    expect(screen.getByText(copy.resolve.overLimit)).toBeVisible();
    expect(screen.queryByText(formatMoney(settleAt45Preview.posterRefundCents))).not.toBeInTheDocument();
    editAmount('43');
    expect(screen.queryByText(copy.resolve.overLimit)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.resolve.save })).toBeDisabled();
  });

  it('drops the old amount when changing from settlement to release in full', async () => {
    const user = userEvent.setup();
    const handlers = mount({ onPreviewResolution: vi.fn<AdminCaseHandlers['onPreviewResolution']>().mockResolvedValue({ ok: true, preview: releaseFullPreview }) });
    await user.click(screen.getByRole('radio', { name: copy.resolutions.settle }));
    editAmount('45');
    editSummary();
    await user.click(screen.getByRole('radio', { name: copy.resolutions.release_full }));
    await waitFor(() => expect(screen.getByRole('button', { name: copy.resolve.save })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: copy.resolve.save }));
    await waitFor(() => expect(handlers.onResolve).toHaveBeenCalledExactlyOnceWith({ resolution: 'release_full', summary: 'Both people agreed to settle at a lower price.' }));
  });

  it('converts a goodwill input to cents and locks pending recording', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onResolve = vi.fn<AdminCaseHandlers['onResolve']>(() => new Promise((resolve) => { finish = resolve; }));
    mount({ onResolve });
    await user.click(screen.getByRole('radio', { name: copy.resolutions.goodwill_refund }));
    editAmount('16.50', true);
    editSummary();
    await waitFor(() => expect(screen.getByRole('button', { name: copy.resolve.save })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: copy.resolve.save }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledExactlyOnceWith({ resolution: 'goodwill_refund', goodwillCents: 1650, summary: 'Both people agreed to settle at a lower price.' }));
    expect(screen.getByRole('form', { name: copy.resolve.title })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: copy.resolve.goodwillAmount })).toBeDisabled();
    expect(screen.getByRole('button', { name: copy.cancel })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: copy.resolve.title }));
    await act(async () => finish({ ok: false, code: 'unknown' }));
    expect(onResolve).toHaveBeenCalledOnce();
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
  });

  it('shows rejected preview feedback and retries without recording money', async () => {
    const user = userEvent.setup();
    const onPreviewResolution = vi.fn<AdminCaseHandlers['onPreviewResolution']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, preview: releaseFullPreview });
    const handlers = mount({ onPreviewResolution });
    await user.click(screen.getByRole('radio', { name: copy.resolutions.release_full }));
    editSummary();
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.resolve.save })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: copy.resolve.retryPreview }));
    await waitFor(() => expect(screen.getByRole('button', { name: copy.resolve.save })).toBeEnabled());
    expect(onPreviewResolution).toHaveBeenCalledTimes(2);
    expect(handlers.onResolve).not.toHaveBeenCalled();
  });
});
