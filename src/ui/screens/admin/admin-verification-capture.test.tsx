/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY_CAPTURE_REJECTION_REASONS, IDENTITY_PROVIDER_OUTCOMES, LIVENESS_PROMPTS, type ActionResult, type AdminVerificationHandlers, type IdentityCaptureRevealResult } from '@/contracts';
import { ADMIN_NOW, adminVerificationsIdentityData, anaDoubleCheckVerification, fakeAdminVerificationHandlers, identityCaptureRevealed, jordanVerification, rosaReadOnlyVerification, rosaVerification } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminVerification.json';
import { AdminVerificationSection } from './admin-verification-section';
import { AdminVerificationsScreen } from './admin-verifications-screen';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const c = copy.capture;

function show(verification = rosaVerification, handlers: Partial<AdminVerificationHandlers> = {}) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminVerificationSection userId="usr_rosa" verification={verification} handlers={{ ...fakeAdminVerificationHandlers, ...handlers }} now={ADMIN_NOW} /></NextIntlClientProvider>);
}

describe('staff review of our ID photos', () => {
  it('lists each try with its prompt, reading, decision and what is stored, and only the waiting one can be reviewed', () => {
    show();
    // The ID check's own badge says where our check stands while it's the step that matters.
    expect(screen.getByText(uiMessages.verification.capture.statuses.in_review)).toBeVisible();
    const tries = [...screen.getByRole('list', { name: c.title }).querySelectorAll<HTMLElement>(':scope > li')];
    expect(tries).toHaveLength(2);
    expect(within(tries[0]!).getByText(c.statuses.submitted)).toBeVisible();
    expect(within(tries[0]!).getByText('Selfie prompt: look to their left')).toBeVisible();
    expect(within(tries[0]!).getByRole('list', { name: c.autoCheck.title })).toHaveTextContent('Name matches: yes18 or older: yesNot expired: yesExpires 4/2029');
    expect(within(tries[0]!).getByRole('button', { name: c.decide.open })).toBeVisible();
    expect(within(tries[1]!).getByText('Turned down: the selfie didn\'t follow its prompt')).toBeVisible();
    expect(within(tries[1]!).getByText(/Selfie shows no hand/)).toBeVisible();
    expect(within(tries[1]!).queryByRole('button', { name: c.decide.open })).not.toBeInTheDocument();
    expect(within(tries[1]!).getByRole('button', { name: c.reveal.open })).toBeVisible();
    // The capture actions have their own buttons, never the generic row.
    expect(screen.queryByRole('group', { name: copy.actionsLabel })).not.toBeInTheDocument();
  });

  it('opens the photos only with a reason, then shows them with the prompt and the link time', async () => {
    const onRevealIdentityCapture = vi.fn(async (): Promise<IdentityCaptureRevealResult> => identityCaptureRevealed);
    show(rosaVerification, { onRevealIdentityCapture });
    await userEvent.click(screen.getAllByRole('button', { name: c.reveal.open })[0]!);
    const dialog = screen.getByRole('dialog', { name: c.reveal.title });
    await userEvent.type(within(dialog).getByLabelText(c.reveal.reason), 'short');
    await userEvent.click(within(dialog).getByRole('button', { name: c.reveal.submit }));
    expect(within(dialog).getByText(c.reveal.reasonRequired)).toBeVisible();
    expect(onRevealIdentityCapture).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(c.reveal.reason), ' — comparing the photos sent today');
    await userEvent.click(within(dialog).getByRole('button', { name: c.reveal.submit }));
    expect(onRevealIdentityCapture).toHaveBeenCalledExactlyOnceWith({ captureId: 'idc_rosa', reason: 'short — comparing the photos sent today' });
    expect(await screen.findByText(c.reveal.logged)).toBeVisible();
    for (const kind of ['front', 'back', 'selfie'] as const) expect(screen.getByRole('img', { name: c.reveal.alt[kind] })).toHaveAttribute('src', identityCaptureRevealed.photos.find((photo) => photo.kind === kind)!.url);
    expect(screen.getByText(c.promptHint)).toBeVisible();
  });

  it('needs a reason the helper sees to turn photos down, and a note for the log', async () => {
    const onDecideIdentityCapture = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show(rosaVerification, { onDecideIdentityCapture });
    await userEvent.click(screen.getByRole('button', { name: c.decide.open }));
    const dialog = screen.getByRole('dialog', { name: c.decide.title });
    await userEvent.click(within(dialog).getByRole('radio', { name: c.decide.reject }));
    await userEvent.click(within(dialog).getByRole('button', { name: c.decide.submitReject }));
    expect(within(dialog).getByText(c.decide.reasonRequired)).toBeVisible();
    expect(within(dialog).getByText(c.decide.noteRequired)).toBeVisible();
    expect(onDecideIdentityCapture).not.toHaveBeenCalled();
    await userEvent.selectOptions(within(dialog).getByLabelText(c.decide.reason), 'selfie_mismatch');
    await userEvent.type(within(dialog).getByLabelText(c.decide.note), 'The selfie is someone else.');
    await userEvent.click(within(dialog).getByRole('button', { name: c.decide.submitReject }));
    expect(onDecideIdentityCapture).toHaveBeenCalledExactlyOnceWith({ captureId: 'idc_rosa', decision: 'reject', reason: 'selfie_mismatch', note: 'The selfie is someone else.' });
    expect(await screen.findByText(copy.updated)).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the photos to those who can only read, without opening or deciding', () => {
    show(rosaReadOnlyVerification);
    expect(screen.getByRole('list', { name: c.title })).toBeVisible();
    expect(screen.queryByRole('button', { name: c.reveal.open })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: c.decide.open })).not.toBeInTheDocument();
  });

  it('shows nothing of our photos for someone who never sent any', () => {
    show(jordanVerification);
    expect(screen.queryByRole('list', { name: c.title })).not.toBeInTheDocument();
  });

  it('marks the photos to compare in the identity queue, with the reading in a word', () => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminVerificationsScreen data={adminVerificationsIdentityData} now={ADMIN_NOW} /></NextIntlClientProvider>);
    const omar = screen.getByRole('link', { name: /Omar H\./ });
    expect(omar).toHaveTextContent(`${copy.queues.identityKinds.capture} · ${c.documentTypes.state_id}`);
    expect(omar).toHaveTextContent(copy.queues.idAutoCheckFlag);
    expect(omar).toHaveTextContent(copy.queues.overdue);
    expect(screen.getByRole('link', { name: /Rosa T\./ })).toHaveTextContent(copy.queues.idAutoAllMatch);
  });

  it("shows both results of a double check that didn't confirm our approval, with staff's two decisions", async () => {
    const onVerificationAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show(anaDoubleCheckVerification, { onVerificationAction });
    expect(screen.getByText(copy.identityBlocked.double_check_review)).toBeVisible();
    expect(screen.getByText(copy.providerOutcome.replace('{outcome}', copy.providerOutcomes.declined))).toBeVisible();
    const [approved] = screen.getByRole('list', { name: c.title }).querySelectorAll<HTMLElement>(':scope > li');
    expect(within(approved!).getByText(c.statuses.approved)).toBeVisible();
    const actions = screen.getByRole('group', { name: copy.actionsLabel });
    expect(within(actions).queryByRole('button', { name: copy.actions.allow_identity_retry })).not.toBeInTheDocument();
    await userEvent.click(within(actions).getByRole('button', { name: copy.actions.reject_double_check }));
    const dialog = screen.getByRole('dialog', { name: copy.actions.reject_double_check });
    expect(dialog).toHaveTextContent(copy.actionHints.reject_double_check);
    await userEvent.type(within(dialog).getByRole('textbox'), 'The ID number fails the state check.');
    await userEvent.click(within(dialog).getByRole('button', { name: copy.actions.reject_double_check }));
    expect(onVerificationAction).toHaveBeenCalledExactlyOnceWith({ userId: 'usr_rosa', action: 'reject_double_check', note: 'The ID number fails the state check.' });
  });

  it("marks a double check that didn't confirm our approval in the identity queue, with both dates", () => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminVerificationsScreen data={adminVerificationsIdentityData} now={ADMIN_NOW} /></NextIntlClientProvider>);
    const ana = screen.getByRole('link', { name: /Ana V\./ });
    expect(ana).toHaveTextContent(copy.queues.identityKinds.double_check);
    expect(ana).toHaveTextContent(`${copy.providerOutcomes.declined}`);
  });

  it('has copy for every prompt and reason', () => {
    for (const prompt of LIVENESS_PROMPTS) expect(c.prompts[prompt]).toBeTruthy();
    for (const reason of IDENTITY_CAPTURE_REJECTION_REASONS) expect(c.rejectionReasons[reason]).toBeTruthy();
    for (const outcome of IDENTITY_PROVIDER_OUTCOMES) expect(copy.providerOutcomes[outcome]).toBeTruthy();
  });
});
