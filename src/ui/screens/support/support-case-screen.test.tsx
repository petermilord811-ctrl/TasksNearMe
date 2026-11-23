/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASE_STATUSES, routes, type SupportCasePageData } from '@/contracts';
import { closedCasePageData, disputeCasePageData, fakeSupportCaseHandlers, solvedCasePageData, solvedRatedCasePageData } from '@/fixtures';
import { formatDate } from '@/shared/format';
import uiMessages from '../../../../messages/en/ui';
import supportCase from '../../../../messages/en/ui/supportCase.json';
import support from '../../../../messages/en/ui/support.json';
import { SupportCaseScreen } from './support-case-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);
const now = '2026-11-23T18:30:00.000Z';
const messages = { ...uiMessages, supportCase, support };

function mount(data: SupportCasePageData = disputeCasePageData) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><SupportCaseScreen data={data} handlers={fakeSupportCaseHandlers} now={now} /></NextIntlClientProvider>);
}

describe('SupportCaseScreen', () => {
  it('shows one title, supplied case context, Central opening date and booking link', () => {
    mount();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(disputeCasePageData.case.subject);
    expect(screen.getByText(support.kinds.dispute)).toBeInTheDocument();
    expect(screen.getByText(`Opened ${formatDate(disputeCasePageData.case.openedAt, { withYear: true })}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: supportCase.booking })).toHaveAttribute('href', routes.app.booking(disputeCasePageData.case.bookingId!));
    expect(screen.getByRole('form', { name: supportCase.reply })).toBeInTheDocument();
  });

  it('uses canReply as supplied and omits the reply box and booking link on a closed case', () => {
    mount(closedCasePageData);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: supportCase.send })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: supportCase.booking })).not.toBeInTheDocument();
    expect(screen.getByText(supportCase.closed)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: supportCase.newRequest })).toHaveAttribute('href', routes.app.support());
  });

  it('renders supplied oldest-first events, authors and photos that open larger', async () => {
    const user = userEvent.setup();
    mount();
    const log = screen.getByRole('log', { name: supportCase.conversation });
    const articles = within(log).getAllByRole('article');
    expect(articles).toHaveLength(disputeCasePageData.events.length);
    expect(articles[0]).toHaveTextContent(disputeCasePageData.events[0]!.body!);
    expect(articles[0]).toHaveTextContent(supportCase.sender.me);
    expect(articles[2]).toHaveTextContent(supportCase.sender.support);
    expect(articles[2]).toHaveTextContent(disputeCasePageData.events[2]!.body!);
    await user.click(within(log).getByRole('button', { name: /View photo:/ }));
    const dialog = screen.getByRole('dialog', { name: 'Photo 1 of 1' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', disputeCasePageData.events[0]!.photos![0]!.src);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(log).getByRole('button', { name: /View photo:/ })).toHaveFocus();
  });

  it.each(CASE_STATUSES)('shows neutral %s labels without inferring who the viewer is', (status) => {
    mount({ ...disputeCasePageData, case: { ...disputeCasePageData.case, status, viewerRole: undefined }, events: [{ id: status, from: 'system', kind: 'status', status, at: now }] });
    const label = messages.status.case[status];
    expect(label).toBeTruthy();
    expect(screen.getAllByText(label)).toHaveLength(2);
  });

  it.each(['poster', 'helper'] as const)('uses the %s role for the header and timeline status labels', (viewerRole) => {
    const status = viewerRole === 'poster' ? 'awaiting_poster' : 'awaiting_helper';
    const otherStatus = viewerRole === 'poster' ? 'awaiting_helper' : 'awaiting_poster';
    mount({ ...disputeCasePageData, case: { ...disputeCasePageData.case, status, viewerRole }, events: [
      { id: 'other', from: 'system', kind: 'status', status: otherStatus, at: now },
      { id: 'viewer', from: 'system', kind: 'status', status, at: now },
    ] });
    expect(screen.getAllByText(messages.status.case.awaiting_you)).toHaveLength(2);
    expect(within(screen.getByRole('log')).getByText(messages.status.case[otherStatus])).toBeVisible();
  });

  it('hides an empty opening description for the other person while keeping their conversation and reply', () => {
    mount({ ...disputeCasePageData, case: { ...disputeCasePageData.case, description: '', viewerRole: 'helper' }, events: [disputeCasePageData.events[2]!] });
    expect(screen.queryByRole('heading', { name: supportCase.description })).not.toBeInTheDocument();
    expect(screen.queryByText(disputeCasePageData.case.description)).not.toBeInTheDocument();
    expect(screen.getByRole('log')).toHaveTextContent(disputeCasePageData.events[2]!.body!);
    expect(screen.getByRole('form', { name: supportCase.reply })).toBeVisible();
  });

  it('after a live chat: Riley signs their messages, the help can be rated, and the conversation emailed (2026-11-23)', async () => {
    const onRate = vi.fn(async () => ({ ok: true as const, code: 'saved' as const }));
    const onEmailTranscript = vi.fn(async () => ({ ok: true as const, code: 'sent' as const }));
    render(<NextIntlClientProvider locale="en" messages={messages}><SupportCaseScreen data={solvedCasePageData} handlers={{ ...fakeSupportCaseHandlers, onRate, onEmailTranscript }} now={now} /></NextIntlClientProvider>);
    const log = screen.getByRole('log');
    expect(within(log).getByText('Riley')).toBeVisible();
    expect(within(log).getByText('Riley from support joined the live chat.')).toBeVisible();
    expect(screen.getByText("We'll send it to m•••@example.test.")).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: supportCase.feedback.transcript.action }));
    expect(onEmailTranscript).toHaveBeenCalledWith();
    expect(await screen.findByText('Sent to m•••@example.test.')).toBeVisible();
    const card = screen.getByRole('region', { name: supportCase.feedback.rating.title });
    await userEvent.click(within(card).getByRole('button', { name: 'Good' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Send' }));
    expect(onRate).toHaveBeenCalledWith({ rating: 'good' });
    expect(await screen.findByText(supportCase.feedback.rating.thanksGood)).toBeVisible();
  });

  it('shows a rating given, and no rating or email without their handlers', () => {
    const { unmount } = mount(solvedRatedCasePageData);
    expect(screen.getByText('You rated this help bad.')).toBeVisible();
    expect(screen.getByText('It took two days to get an answer.')).toBeVisible();
    unmount();
    render(<NextIntlClientProvider locale="en" messages={messages}><SupportCaseScreen data={solvedCasePageData} handlers={{ onReply: fakeSupportCaseHandlers.onReply }} now={now} /></NextIntlClientProvider>);
    expect(screen.queryByRole('region', { name: supportCase.feedback.rating.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: supportCase.feedback.transcript.action })).not.toBeInTheDocument();
  });
});
