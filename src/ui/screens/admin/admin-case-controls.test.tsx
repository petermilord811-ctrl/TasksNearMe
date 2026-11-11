/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_ERROR_CODES, ADMIN_CASE_ACTIONS, CASE_RESOLUTIONS, routes, type ActionResult, type AdminCaseHandlers, type AdminCasePageData } from '@/contracts';
import { disputeAdminCaseData, fakeAdminCaseHandlers, fakeHandler, reportAdminCaseData, resolvedAdminCaseData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import adminCase from '../../../../messages/en/ui/adminCase.json';
import { AdminCaseControls } from './admin-case-controls';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const messages = { ...uiMessages, adminCase };

function mount(data: AdminCasePageData = disputeAdminCaseData, overrides: Partial<AdminCaseHandlers> = {}) {
  const handlers = {
    ...fakeAdminCaseHandlers,
    onAssign: vi.fn(fakeHandler<{ assign: boolean }>({ ok: true, code: 'updated' }, 0)),
    onSetStatus: vi.fn(fakeHandler<Parameters<AdminCaseHandlers['onSetStatus']>[0]>({ ok: true, code: 'updated' }, 0)),
    onReply: vi.fn(fakeHandler<Parameters<AdminCaseHandlers['onReply']>[0]>({ ok: true, code: 'sent' }, 0)),
    onAddNote: vi.fn(fakeHandler<Parameters<AdminCaseHandlers['onAddNote']>[0]>({ ok: true, code: 'saved' }, 0)),
    onResolve: vi.fn(fakeHandler<Parameters<AdminCaseHandlers['onResolve']>[0]>({ ok: true, code: 'saved' }, 0)),
    onClose: vi.fn(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onReopen: vi.fn(fakeHandler({ ok: true, code: 'updated' }, 0)),
    ...overrides,
  } satisfies AdminCaseHandlers;
  return { handlers, ...render(<NextIntlClientProvider locale="en" messages={messages}><AdminCaseControls data={data} handlers={handlers}><p>{data.case.description}</p></AdminCaseControls></NextIntlClientProvider>) };
}

describe('AdminCaseControls', () => {
  it('has copy for every action and resolution and renders only supplied actions in order', () => {
    ADMIN_CASE_ACTIONS.forEach((id) => expect(adminCase.actions[id]).toBeTruthy());
    CASE_RESOLUTIONS.forEach((id) => expect(adminCase.resolutions[id]).toBeTruthy());
    mount(resolvedAdminCaseData);
    const toolbar = screen.getByRole('group', { name: adminCase.actionsLabel });
    expect(within(toolbar).getAllByRole('button').map((button) => button.textContent)).toEqual(resolvedAdminCaseData.actions.map((id) => adminCase.actions[id]));
    expect(screen.queryByRole('form', { name: adminCase.reply.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: adminCase.actions.resolve })).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: adminCase.note.title })).toBeInTheDocument();
  });

  it('validates reply person and body, offers only messageable people, then trims, clears and refreshes', async () => {
    const user = userEvent.setup();
    const { handlers } = mount(reportAdminCaseData);
    const person = screen.getByRole('combobox', { name: adminCase.reply.person });
    const body = screen.getByRole('textbox', { name: adminCase.reply.body });
    await user.click(screen.getByRole('button', { name: adminCase.reply.send }));
    expect(await screen.findByText(adminCase.reply.personRequired)).toBeInTheDocument();
    expect(screen.getByText(adminCase.reply.bodyRequired)).toBeInTheDocument();
    await waitFor(() => expect(person).toHaveFocus());
    expect(within(person).getAllByRole('option').map((option) => option.textContent)).toEqual([adminCase.reply.choosePerson, reportAdminCaseData.parties[0]!.person.displayName]);
    await user.selectOptions(person, reportAdminCaseData.parties[0]!.person.id);
    fireEvent.change(body, { target: { value: 'x'.repeat(4001) } });
    await user.click(screen.getByRole('button', { name: adminCase.reply.send }));
    expect(await screen.findByText(adminCase.reply.bodyTooLong)).toBeInTheDocument();
    expect(handlers.onReply).not.toHaveBeenCalled();
    fireEvent.change(body, { target: { value: '  We are reviewing your report.  ' } });
    await user.click(screen.getByRole('button', { name: adminCase.reply.send }));
    await waitFor(() => expect(handlers.onReply).toHaveBeenCalledExactlyOnceWith({ partyId: reportAdminCaseData.parties[0]!.person.id, body: 'We are reviewing your report.' }));
    expect(body).toHaveValue('');
    expect(await screen.findByText(adminCase.reply.sent)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('focuses the separate reply and note forms and submits an internal note as body only', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: adminCase.actions.reply }));
    expect(screen.getByRole('combobox', { name: adminCase.reply.person })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: adminCase.actions.add_note }));
    const note = screen.getByRole('textbox', { name: adminCase.note.body });
    expect(note).toHaveFocus();
    await user.click(screen.getByRole('button', { name: adminCase.note.save }));
    expect(await screen.findByText(adminCase.note.bodyRequired)).toBeInTheDocument();
    await waitFor(() => expect(note).toHaveFocus());
    fireEvent.change(note, { target: { value: '  Ask Maya whether Sunday works.  ' } });
    await user.click(screen.getByRole('button', { name: adminCase.note.save }));
    await waitFor(() => expect(handlers.onAddNote).toHaveBeenCalledExactlyOnceWith({ body: 'Ask Maya whether Sunday works.' }));
    expect(note).toHaveValue('');
    expect(screen.getByText(adminCase.note.saved)).toBeInTheDocument();
  });

  it('uses nextStatuses for status options and submits the chosen status', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: adminCase.actions.set_status }));
    const select = screen.getByRole('combobox', { name: adminCase.status.label });
    expect(within(select).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['', ...disputeAdminCaseData.nextStatuses]);
    await user.click(screen.getByRole('button', { name: adminCase.status.save }));
    expect(await screen.findByText(adminCase.status.required)).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveFocus());
    await user.selectOptions(select, 'escalated');
    await user.click(screen.getByRole('button', { name: adminCase.status.save }));
    await waitFor(() => expect(handlers.onSetStatus).toHaveBeenCalledExactlyOnceWith({ status: 'escalated' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(adminCase.updated)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: adminCase.actions.set_status })).toHaveFocus();
  });

  it('requires a supplied resolution and ten-character summary before resolving', async () => {
    const user = userEvent.setup();
    const { handlers } = mount();
    await user.click(screen.getByRole('button', { name: adminCase.actions.resolve }));
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual(disputeAdminCaseData.resolutions);
    await user.click(screen.getByRole('button', { name: adminCase.resolve.save }));
    expect(await screen.findByText(adminCase.resolve.required)).toBeInTheDocument();
    expect(screen.getByText(adminCase.resolve.summaryTooShort)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: adminCase.resolutions.rework }));
    const summary = screen.getByRole('textbox', { name: adminCase.resolve.summary });
    await user.type(summary, 'Too short');
    await user.click(screen.getByRole('button', { name: adminCase.resolve.save }));
    expect(handlers.onResolve).not.toHaveBeenCalled();
    await waitFor(() => expect(summary).toHaveFocus());
    fireEvent.change(summary, { target: { value: '  Jordan will return on Sunday to finish the drawers.  ' } });
    await user.click(screen.getByRole('button', { name: adminCase.resolve.save }));
    await waitFor(() => expect(handlers.onResolve).toHaveBeenCalledExactlyOnceWith({ resolution: 'rework', summary: 'Jordan will return on Sunday to finish the drawers.' }));
    expect(await screen.findByText(adminCase.resolve.saved)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it.each(ACTION_ERROR_CODES)('preserves a reply on %s and shows friendly feedback', async (code) => {
    const user = userEvent.setup();
    mount(disputeAdminCaseData, { onReply: fakeHandler({ ok: false, code, ...(code === 'validation_failed' ? { fieldErrors: { body: ['too_long'] as const } } : {}) }, 0) });
    await user.selectOptions(screen.getByRole('combobox', { name: adminCase.reply.person }), disputeAdminCaseData.parties[0]!.person.id);
    const body = screen.getByRole('textbox', { name: adminCase.reply.body });
    await user.type(body, 'Keep this reply.');
    await user.click(screen.getByRole('button', { name: adminCase.reply.send }));
    const expected = code === 'not_allowed' ? adminCase.notAllowed : code === 'version_conflict' ? adminCase.conflict : messages.forms.actionErrors[code as keyof typeof messages.forms.actionErrors] ?? messages.feedback.error[code];
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(body).toHaveValue('Keep this reply.');
    expect(navigation.refresh).not.toHaveBeenCalled();
    if (code === 'validation_failed') await waitFor(() => expect(body).toHaveFocus());
    if (code === 'version_conflict') {
      await user.click(screen.getByRole('button', { name: adminCase.refresh }));
      expect(navigation.refresh).toHaveBeenCalledOnce();
    }
  });

  it('disables a pending reply, prevents duplicate requests and follows redirectTo', async () => {
    const user = userEvent.setup();
    let finish!: (result: ActionResult) => void;
    const onReply = vi.fn<AdminCaseHandlers['onReply']>(() => new Promise((resolve) => { finish = resolve; }));
    mount(disputeAdminCaseData, { onReply });
    const person = screen.getByRole('combobox', { name: adminCase.reply.person });
    await user.selectOptions(person, disputeAdminCaseData.parties[0]!.person.id);
    const body = screen.getByRole('textbox', { name: adminCase.reply.body });
    await user.type(body, 'Waiting for your reply.');
    await user.click(screen.getByRole('button', { name: adminCase.reply.send }));
    const form = screen.getByRole('form', { name: adminCase.reply.title });
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: adminCase.reply.sending })).toBeDisabled();
    expect(person).toBeDisabled();
    expect(body).toBeDisabled();
    fireEvent.submit(form);
    await act(async () => finish({ ok: true, code: 'sent', redirectTo: routes.admin.cases() }));
    expect(onReply).toHaveBeenCalledOnce();
    expect(navigation.push).toHaveBeenCalledWith(routes.admin.cases());
  });

  it('locks assignment controls while pending and shows a retryable unknown error', async () => {
    const user = userEvent.setup();
    let fail!: (error: Error) => void;
    const onAssign = vi.fn<AdminCaseHandlers['onAssign']>(() => new Promise((_, reject) => { fail = reject; }));
    mount(reportAdminCaseData, { onAssign });
    await user.click(screen.getByRole('button', { name: adminCase.actions.assign_to_me }));
    expect(onAssign).toHaveBeenCalledExactlyOnceWith({ assign: true });
    within(screen.getByRole('group', { name: adminCase.actionsLabel })).getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByRole('button', { name: adminCase.actions.assign_to_me })).toHaveAttribute('aria-busy', 'true');
    await act(async () => fail(new Error('offline')));
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: adminCase.actions.assign_to_me })).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('unassigns, closes and reopens through the supplied handlers', async () => {
    const user = userEvent.setup();
    const { handlers } = mount({ ...resolvedAdminCaseData, actions: ['unassign', 'close', 'reopen'] });
    await user.click(screen.getByRole('button', { name: adminCase.actions.unassign }));
    await waitFor(() => expect(handlers.onAssign).toHaveBeenCalledExactlyOnceWith({ assign: false }));
    await user.click(screen.getByRole('button', { name: adminCase.actions.close }));
    await waitFor(() => expect(handlers.onClose).toHaveBeenCalledExactlyOnceWith(undefined));
    await user.click(screen.getByRole('button', { name: adminCase.actions.reopen }));
    await waitFor(() => expect(handlers.onReopen).toHaveBeenCalledExactlyOnceWith(undefined));
    expect(navigation.refresh).toHaveBeenCalledTimes(3);
  });
});
