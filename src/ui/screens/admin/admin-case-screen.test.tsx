/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type AdminCaseHandlers, type AdminCasePageData } from '@/contracts';
import { ADMIN_NOW, disputeAdminCaseData, fakeAdminCaseHandlers, reportAdminCaseData, reportedConversation, resolvedAdminCaseData, reviewHiddenAdminCaseData, reviewReportAdminCaseData, reviewReportAgentCaseData } from '@/fixtures';
import { formatDateTime, formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import adminCase from '../../../../messages/en/ui/adminCase.json';
import adminCases from '../../../../messages/en/ui/adminCases.json';
import { AdminCaseScreen } from './admin-case-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function content(data: AdminCasePageData, handlers: AdminCaseHandlers = fakeAdminCaseHandlers) {
  // A missing message fails the test (next-intl only logs it and renders the key, which no screenshot check catches).
  return <NextIntlClientProvider locale="en" messages={{ ...messages, adminCase, adminCases }} onError={(error) => { throw error; }}><AdminCaseScreen data={data} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>;
}

function section(title: string) { return within(screen.getByRole('heading', { name: title, level: 2 }).closest('section')!); }

describe('AdminCaseScreen', () => {
  it('shows one title, supplied case metadata, people, opening and formatted booking linked to its staff page', () => {
    render(content(disputeAdminCaseData));
    const data = disputeAdminCaseData;
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(data.case.subject);
    expect(screen.getByText(adminCases.types.dispute)).toBeVisible();
    expect(screen.getByText(adminCases.priorities.high)).toBeVisible();
    expect(screen.getByText(adminCase.details.newReply)).toBeVisible();
    expect(screen.getByText('Past due 1 h')).toBeVisible();
    expect(screen.getByText(adminCases.columns.response)).toBeVisible();
    expect(section(adminCase.details.opening).getByText(data.case.description)).toBeVisible();
    expect(section(adminCase.details.opening).getByText(`Reason: ${adminCase.details.reasons.incomplete}`)).toBeVisible();
    const people = section(adminCase.details.people);
    for (const party of data.parties) {
      expect(people.getByText(party.person.displayName)).toBeVisible();
      expect(people.getByText(adminCase.details.roles[party.role])).toBeVisible();
    }
    expect(people.getByText(adminCase.details.roles.opener)).toBeVisible();
    const booking = section(adminCase.details.booking);
    expect(booking.getByText(data.booking!.title)).toBeVisible();
    expect(booking.getByText(formatDateTime(data.booking!.start))).toBeVisible();
    expect(booking.getByText(formatMoney(data.booking!.priceCents))).toBeVisible();
    expect(booking.getByText(messages.status.booking.staff.disputed)).toBeVisible();
    expect(booking.getByRole('link', { name: data.booking!.title })).toHaveAttribute('href', routes.admin.booking(data.booking!.id));
  });

  it('keeps the supplied timeline order and distinguishes each person’s messages, assignments and internal notes', () => {
    render(content(disputeAdminCaseData));
    const articles = within(screen.getByRole('list', { name: adminCase.details.timeline })).getAllByRole('article');
    expect(articles).toHaveLength(disputeAdminCaseData.events.length);
    disputeAdminCaseData.events.forEach((event, index) => {
      expect(articles[index]).toHaveTextContent(formatDateTime(event.at));
      if (event.body) expect(articles[index]).toHaveTextContent(event.body);
    });
    expect(articles[1]).toHaveTextContent(`Assigned to ${disputeAdminCaseData.case.assignee!.displayName}`);
    expect(articles[2]).toHaveTextContent('To Jordan T.');
    expect(articles[4]).toHaveTextContent('From Jordan T.');
    expect(articles[6]).toHaveTextContent(adminCase.details.internalNote);
    expect(articles[3]).toHaveTextContent(messages.status.case.awaiting_helper);
  });

  it('renders only supplied actions in their supplied order and adds no reply or note forms when absent', () => {
    const data = { ...disputeAdminCaseData, actions: ['reopen', 'assign_to_me'] as const };
    const view = render(content({ ...data, actions: [...data.actions] }));
    const actions = within(screen.getByRole('group', { name: adminCase.actionsLabel }));
    expect(actions.getAllByRole('button').map((button) => button.textContent)).toEqual(data.actions.map((action) => adminCase.actions[action]));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    view.rerender(content({ ...disputeAdminCaseData, actions: [] }));
    expect(screen.queryByRole('group', { name: adminCase.actionsLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a recorded resolution and keeps the resolved case’s supplied actions', () => {
    render(content(resolvedAdminCaseData));
    const resolution = section(adminCase.details.resolution);
    const value = resolvedAdminCaseData.case.resolution!;
    expect(resolution.getByText(adminCase.resolutions[value.type])).toBeVisible();
    expect(resolution.getByText(value.summary)).toBeVisible();
    expect(resolution.getByText(formatDateTime(value.at))).toBeVisible();
    const actions = within(screen.getByRole('group', { name: adminCase.actionsLabel }));
    expect(actions.getAllByRole('button').map((button) => button.textContent)).toEqual(resolvedAdminCaseData.actions.map((action) => adminCase.actions[action]));
    expect(screen.queryByRole('form', { name: adminCase.reply.title })).not.toBeInTheDocument();
  });

  it('opens the supplied photo in the shared viewer and returns focus when dismissed', async () => {
    const user = userEvent.setup();
    render(content(disputeAdminCaseData));
    const trigger = section(adminCase.details.opening).getByRole('button', { name: /View photo:/ });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Photo 1 of 1' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', disputeAdminCaseData.case.photos[0]!.src);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('shows report context and roles, clearing revealed content when the case identity changes', async () => {
    const user = userEvent.setup();
    const onRevealConversation = vi.fn<AdminCaseHandlers['onRevealConversation']>().mockResolvedValue({ ok: true, conversation: reportedConversation });
    const handlers = { ...fakeAdminCaseHandlers, onRevealConversation };
    const view = render(content(reportAdminCaseData, handlers));
    expect(screen.queryByRole('heading', { name: adminCase.details.booking })).not.toBeInTheDocument();
    expect(section(adminCase.details.people).getByText(adminCase.details.roles.reported)).toBeVisible();
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: adminCase.conversation.open }));
    fireEvent.change(screen.getByRole('textbox', { name: adminCase.conversation.reason }), { target: { value: 'Review the payment report.' } });
    await user.click(screen.getByRole('button', { name: adminCase.conversation.submit }));
    expect(await screen.findByText(reportedConversation.messages[1]!.body)).toBeVisible();
    view.rerender(content({ ...reportAdminCaseData, case: { ...reportAdminCaseData.case, id: 'case_another_report' } }, handlers));
    expect(screen.queryByText(reportedConversation.messages[1]!.body)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: adminCase.conversation.open })).toBeVisible();
    expect(onRevealConversation).toHaveBeenCalledOnce();
  });
});

describe('a review report', () => {
  it('shows the reported review and who it is about', () => {
    render(content(reviewReportAdminCaseData));
    const panel = section(adminCase.review.title);
    expect(panel.getByText(reviewReportAdminCaseData.review!.review.body!)).toBeVisible();
    expect(panel.getByText(adminCase.review.statuses.published)).toBeVisible();
    expect(panel.getByText(adminCase.review.about.replace('{name}', 'Sam K.'))).toBeVisible();
  });

  it('hides it with a reason, after asking', async () => {
    const onModerateReview = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    render(content(reviewReportAdminCaseData, { ...fakeAdminCaseHandlers, onModerateReview }));
    await userEvent.click(screen.getByRole('button', { name: adminCase.review.hide }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: adminCase.review.dialog.hideSubmit }));
    expect(await within(dialog).findByText(adminCase.review.dialog.required)).toBeVisible();
    expect(onModerateReview).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(adminCase.review.dialog.reason), 'Comments on the person, not the work.');
    await userEvent.click(within(dialog).getByRole('button', { name: adminCase.review.dialog.hideSubmit }));
    expect(onModerateReview).toHaveBeenCalledExactlyOnceWith({ visible: false, reason: 'Comments on the person, not the work.' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('offers to show a hidden review again, with the step on the timeline', () => {
    render(content(reviewHiddenAdminCaseData));
    expect(screen.getByRole('button', { name: adminCase.review.show })).toBeVisible();
    expect(screen.getByText(adminCase.review.statuses.hidden)).toBeVisible();
    expect(screen.getByText(adminCase.details.events.reviewHidden)).toBeVisible();
  });

  it("tells an agent who can hide it instead of offering the button", () => {
    render(content(reviewReportAgentCaseData));
    expect(screen.queryByRole('button', { name: adminCase.review.hide })).toBeNull();
    expect(screen.getByText(adminCase.review.whoCan)).toBeVisible();
  });
});

