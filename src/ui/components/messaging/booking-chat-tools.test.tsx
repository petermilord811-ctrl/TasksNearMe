/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { BOOKING_CHAT_ACTION_IDS, routes, type ActionResult, type BookingChatActionInput, type ShareTimesInput } from '@/contracts';
import {
  agreementRemoteHourlyThreadPageData, agreementThreadPageData, chatDayOfThreadData, chatInboxData, chatSharedTimesHelperThreadData, chatSharedTimesThreadData, dayOfBeforeThreadPageData, dayOfImHereThreadPageData,
  dayOfOnTheWayThreadPageData, dayOfWorkingThreadPageData, deskAgreementForClient, deskAgreementForHelper, emptyTranscript, fakeChatThreadHandlers, fakeConversationHandlers, fakeHelpChatHandlers, fakeNewChatHandlers,
  fakeThreadHandlers, sharedTimesForHelperPageData, sharedTimesThreadPageData, shareTimesInOfferThreadPageData,
} from '@/fixtures';
import { formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { ThreadScreen } from '@/ui/screens/messages';
import { AgreementCard, BookingDayChips, agreementStorageKey } from './booking-chat-tools';
import { ChatWindow } from './chat-window';
import { ConversationActionsMenu } from './conversation-actions';
import { SharedTimesCardView } from './conversation-cards';

/** A booking's conversation and shared times, 2026-11-24 (owner: "implement others all one by one"). */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/app/messages', useSearchParams: () => new URLSearchParams() }));
beforeEach(() => {
  // Radix's popper measures its anchor.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>);
const now = '2026-11-21T16:05:00.000Z';

describe('copy', () => {
  it('has a chip label and a done line for every day-of action, in English and Spanish', () => {
    for (const catalog of [messages, esMessages]) {
      for (const id of BOOKING_CHAT_ACTION_IDS) {
        expect(catalog.thread.dayOf.labels).toHaveProperty(id);
        expect(catalog.thread.dayOf.done).toHaveProperty(id);
      }
      expect(catalog.timeline).toHaveProperty('client_present');
      expect(catalog.timeline).toHaveProperty('times_shared');
    }
  });
});

describe('day-of chips', () => {
  it('shows the actions as given, in order, and runs one with a tap', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async (_input: BookingChatActionInput): Promise<ActionResult> => ({ ok: true, code: 'on_the_way' }));
    const onDone = vi.fn();
    wrap(<BookingDayChips actions={dayOfBeforeThreadPageData.bookingActions!} bookingId="bkg_desk" onAction={onAction} onDone={onDone} />);
    const group = screen.getByRole('group', { name: 'Booking updates' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['On my way', 'Running late']);
    await user.click(screen.getByRole('button', { name: 'On my way' }));
    await waitFor(() => expect(onAction).toHaveBeenCalledExactlyOnceWith({ action: 'on_my_way' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it('asks by how many minutes before saying running late', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async (_input: BookingChatActionInput): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    wrap(<BookingDayChips actions={dayOfBeforeThreadPageData.bookingActions!} bookingId="bkg_desk" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'Running late' }));
    const send = await screen.findByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '20 min' }));
    await user.click(send);
    await waitFor(() => expect(onAction).toHaveBeenCalledExactlyOnceWith({ action: 'running_late', minutes: 20 }));
    await waitFor(() => expect(screen.queryByRole('radio', { name: '20 min' })).not.toBeInTheDocument());
  });

  it('says why an update didn\'t go', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'version_conflict' }));
    wrap(<BookingDayChips actions={dayOfBeforeThreadPageData.bookingActions!} bookingId="bkg_desk" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'On my way' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This booking moved on');
  });

  it('opens the completion form over the page for Finish the job', () => {
    wrap(<BookingDayChips actions={dayOfWorkingThreadPageData.bookingActions!} bookingId="bkg_desk" />);
    expect(screen.getByRole('link', { name: 'Finish the job' })).toHaveAttribute('href', routes.app.bookingComplete('bkg_desk'));
  });

  it('shows nothing without actions', () => {
    const { container } = wrap(<BookingDayChips actions={[]} bookingId="bkg_desk" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('What we agreed', () => {
  it('shows the client their total, never the helper\'s earnings, and the category\'s checklist', () => {
    wrap(<AgreementCard agreement={deskAgreementForClient} threadId="thr_a1" canProposeChange />);
    expect(screen.getByRole('button', { name: /What we agreed/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Your total')).toBeInTheDocument();
    expect(screen.getByText(formatMoney(6300))).toBeInTheDocument();
    expect(screen.queryByText(formatMoney(6000), { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('It stands level and stable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Propose a change' })).toHaveAttribute('href', routes.app.bookingProposeChange('bkg_desk'));
  });

  it('shows the helper their earnings, never the client\'s total', () => {
    wrap(<AgreementCard agreement={deskAgreementForHelper} threadId="thr_a2" />);
    expect(screen.getByText('You earn')).toBeInTheDocument();
    expect(screen.getByText(formatMoney(6000))).toBeInTheDocument();
    expect(screen.queryByText(formatMoney(6300), { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Propose a change' })).not.toBeInTheDocument();
  });

  it('folds, and remembers it for the conversation', async () => {
    const user = userEvent.setup();
    const first = wrap(<AgreementCard agreement={deskAgreementForClient} threadId="thr_a3" />);
    await user.click(screen.getByRole('button', { name: /What we agreed/ }));
    expect(screen.getByRole('button', { name: /What we agreed/ })).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem(agreementStorageKey('thr_a3'))).toBe('closed');
    first.unmount();
    wrap(<AgreementCard agreement={deskAgreementForClient} threadId="thr_a3" />);
    expect(screen.getByRole('button', { name: /What we agreed/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts folded in the chat window', () => {
    wrap(<AgreementCard agreement={deskAgreementForClient} threadId="thr_a4" compact />);
    expect(screen.getByRole('button', { name: /What we agreed/ })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('shared open times', () => {
  it('lets the client pick an open time: the request dialog with that slot', () => {
    const card = sharedTimesThreadPageData.cards!.sharedTimes!.msg_t2!;
    wrap(<SharedTimesCardView card={card} name="Jordan" createdAt={now} />);
    expect(screen.getByText('Jordan shared open times')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      routes.app.requestHelper('jordan-t', { slotId: 'avl_jordan_sat' }),
      routes.app.requestHelper('jordan-t', { slotId: 'avl_jordan_sun' }),
    ]);
    expect(screen.getByText('Taken')).toBeInTheDocument();
  });

  it('shows the helper where their times stand, with nothing to pick', () => {
    const card = sharedTimesForHelperPageData.cards!.sharedTimes!.msg_t2!;
    wrap(<SharedTimesCardView card={card} name="Maya" createdAt={now} />);
    expect(screen.getByText('You shared open times')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Past')).toBeInTheDocument();
    expect(screen.getByText('No longer offered')).toBeInTheDocument();
  });

  it('shares two or three of the helper\'s open times from the "+"', async () => {
    const user = userEvent.setup();
    const onShareTimes = vi.fn(async (_input: ShareTimesInput): Promise<ActionResult> => ({ ok: true, code: 'sent' }));
    wrap(<ConversationActionsMenu options={sharedTimesForHelperPageData.requestOptions!} name="Maya" onShareTimes={onShareTimes} />);
    await user.click(screen.getByRole('button', { name: 'More ways to work with Maya' }));
    await user.click(screen.getByRole('menuitem', { name: /Share times/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Share times with Maya' });
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, false, false]);
    await user.click(boxes[2]!);
    // Three at most: the fourth waits until one is taken off.
    expect(boxes[3]).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(onShareTimes).toHaveBeenCalledExactlyOnceWith({ slotIds: ['avl_jordan_sat', 'avl_jordan_sun', 'avl_jordan_tue'] }));
  });

  it('says so when a time was taken meanwhile', async () => {
    const user = userEvent.setup();
    const onShareTimes = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { slotIds: ['invalid'] } }));
    wrap(<ConversationActionsMenu options={sharedTimesForHelperPageData.requestOptions!} name="Maya" onShareTimes={onShareTimes} />);
    await user.click(screen.getByRole('button', { name: 'More ways to work with Maya' }));
    await user.click(screen.getByRole('menuitem', { name: /Share times/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Share times with Maya' });
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("One of those times isn't open any more");
  });
});

describe('every new state renders with all its copy, in English and Spanish', () => {
  // next-intl renders a missing key silently: here it fails the test.
  const strict = (locale: 'en' | 'es', node: React.ReactNode) => render(
    <NextIntlClientProvider locale={locale} timeZone="America/Chicago" messages={locale === 'en' ? messages : esMessages} onError={(error) => { throw error; }}>{node}</NextIntlClientProvider>,
  );
  const pages = { agreementThreadPageData, agreementRemoteHourlyThreadPageData, dayOfBeforeThreadPageData, dayOfOnTheWayThreadPageData, dayOfWorkingThreadPageData, dayOfImHereThreadPageData, sharedTimesThreadPageData, sharedTimesForHelperPageData, shareTimesInOfferThreadPageData };
  for (const locale of ['en', 'es'] as const) {
    for (const [name, data] of Object.entries(pages)) {
      it(`the conversation page: ${name} (${locale})`, () => {
        strict(locale, <ThreadScreen data={data} handlers={{ ...fakeThreadHandlers, ...fakeConversationHandlers }} now={now} />);
        if (data.agreement) expect(document.querySelector('[data-agreement]')).not.toBeNull();
        for (const action of data.bookingActions ?? []) expect(document.querySelector(`[data-day-of="${action.id}"]`)).not.toBeNull();
        if (data.cards?.sharedTimes) expect(document.querySelector('[data-shared-times]')).not.toBeNull();
        cleanup();
      });
    }
    for (const [name, thread] of Object.entries({ chatDayOfThreadData, chatSharedTimesThreadData, chatSharedTimesHelperThreadData })) {
      it(`the chat window: ${name} (${locale})`, () => {
        strict(locale, <ChatWindow state="open" view={{ kind: 'thread', threadId: thread.data.thread.id }} unread={0} inbox={{ status: 'ready', data: chatInboxData }} thread={{ status: 'ready', data: thread }} help={{ status: 'idle' }} start={{ status: 'idle' }} transcript={emptyTranscript} now={now}
          threadHandlers={fakeChatThreadHandlers} helpHandlers={fakeHelpChatHandlers} newChatHandlers={fakeNewChatHandlers} listHandlers={{ onFlag: fakeChatThreadHandlers.onFlag, onAccept: fakeChatThreadHandlers.onAccept }}
          onJump={() => undefined} onShow={() => undefined} onStarted={() => undefined} onMinimize={() => undefined} onRestore={() => undefined} onClose={() => undefined} onRetry={() => undefined} onRefreshThread={() => undefined} onLoadEarlier={async () => undefined} fullPageHref={routes.app.messages()} onFullPage={() => undefined} />);
        // Folded in the window: one line until it's opened.
        if (thread.data.agreement) expect(document.querySelector('[data-agreement]')?.getAttribute('data-agreement')).toBe('closed');
        for (const action of thread.data.bookingActions ?? []) expect(document.querySelector(`[data-day-of="${action.id}"]`)).not.toBeNull();
        cleanup();
      });
    }
  }
});
