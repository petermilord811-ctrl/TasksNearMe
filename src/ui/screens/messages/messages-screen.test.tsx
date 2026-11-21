/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type InboxPageData, type MessageView, type ThreadPageData, type ThreadSubject } from '@/contracts';
import {
  blockedThreadPageData, closedThreadPageData, deskBookingThreadPageData, deskOfferThreadPageData, expiredOfferThreadPageData,
  fakeThreadHandlers, inboxEmptyData, maskedEmailMessage, mayaInboxPageData, taskCanceledOfferThreadPageData, taskCanceledThreadForHelperPageData,
} from '@/fixtures';
import { formatDate, formatRelative, formatTime } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { InboxScreen, ThreadScreen } from './index';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
const now = '2026-11-21T16:05:00.000Z';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function inbox(data: InboxPageData = mayaInboxPageData) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><InboxScreen data={data} now={now} /></NextIntlClientProvider>);
}

function threadView(data: ThreadPageData) {
  return <NextIntlClientProvider locale="en" messages={messages}><ThreadScreen data={data} handlers={fakeThreadHandlers} now={now} /></NextIntlClientProvider>;
}

function thread(data: ThreadPageData = deskOfferThreadPageData) {
  return render(threadView(data));
}

describe('InboxScreen', () => {
  it('shows one heading, supplied people, kind, unread count, time and route-built thread links', () => {
    inbox();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Messages');
    const links = screen.getAllByRole('link');
    for (const row of mayaInboxPageData.threads) {
      const link = links.find((item) => item.getAttribute('href') === routes.app.thread(row.id));
      expect(link).toBeDefined();
      expect(link).toHaveTextContent(row.otherParty.displayName);
      expect(link).toHaveTextContent(row.title);
      expect(link).toHaveTextContent(formatRelative(row.lastMessage!.createdAt, now));
    }
    expect(screen.getByText('Booking')).toBeVisible();
    expect(screen.getByText('Offer')).toBeVisible();
    expect(screen.getByText(/1 unread/)).toBeVisible();
  });

  it('renders masked phone and email previews without reconstructing contact details', () => {
    const offer = deskOfferThreadPageData.thread;
    const { container } = inbox({ threads: [offer, {
      ...offer, id: 'thread-email-preview',
      lastMessage: { ...offer.lastMessage!, preview: maskedEmailMessage },
    }] });
    expect(screen.getByText('•••-•••-0134 (hidden until booking)')).toBeVisible();
    expect(screen.getByText('•••@••• (hidden until booking)')).toBeVisible();
    expect(container.textContent).not.toContain('512-555-0134');
  });

  it('uses timeline copy for status and system previews with empty segments', () => {
    const booking = deskBookingThreadPageData.thread;
    const offerMessage = deskOfferThreadPageData.messages[0]!;
    inbox({ threads: [booking, {
      ...deskOfferThreadPageData.thread,
      lastMessage: { ...offerMessage, preview: [] },
    }, {
      ...booking, id: 'running-late-preview',
      lastMessage: { ...booking.lastMessage!, sender: 'me', event: { type: 'running_late', params: { minutes: 20 } } },
    }] });
    expect(screen.getByText('On the way')).toBeVisible();
    expect(screen.getByText('Offer received · $50.00')).toBeVisible();
    expect(screen.getByText('Running 20 minutes late')).toBeVisible();
    expect(screen.queryByText('You:')).not.toBeInTheDocument();
  });

  it('offers both route-built next steps when no conversations exist', () => {
    inbox(inboxEmptyData);
    expect(screen.getByRole('heading', { name: 'No messages yet' })).toBeVisible();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(routes.app.tasks());
    expect(hrefs).toContain(routes.app.findWork());
  });
});

describe('ThreadScreen', () => {
  it('says why a closed conversation closed and links the way on (audit L13)', () => {
    thread(expiredOfferThreadPageData);
    const status = screen.getAllByRole('status').find((element) => element.textContent?.includes('closed'))!;
    expect(status).toHaveTextContent("Lee M.'s offer expired, so this conversation closed.");
    expect(within(status).getByRole('link', { name: 'Open the offer to request them again' })).toHaveAttribute('href', routes.app.offer('tsk_desk', 'off_lee'));
    expect(screen.queryByRole('form', { name: 'Message' })).not.toBeInTheDocument();
  });

  it('offers Reply only where a reply can be sent: not in a closed or blocked conversation', () => {
    const open = thread(deskOfferThreadPageData);
    expect(screen.getAllByRole('button', { name: 'Reply' }).length).toBeGreaterThan(0);
    open.unmount();
    for (const data of [expiredOfferThreadPageData, taskCanceledOfferThreadPageData, blockedThreadPageData]) {
      const view = thread(data);
      expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: /^Reply or react to/ })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('says the task was canceled, to the client and to the helper, never "declined" or "chose another offer" (sweep D9)', () => {
    for (const [data, wayOn, href] of [
      [taskCanceledOfferThreadPageData, 'Open the offer to request them again', routes.app.offer('tsk_desk', 'off_lee')],
      [taskCanceledThreadForHelperPageData, 'Open the task', routes.app.findWorkTask('tsk_moving')],
    ] as const) {
      const view = thread(data);
      const status = screen.getAllByRole('status').find((element) => element.textContent?.includes('closed'))!;
      expect(status).toHaveTextContent('This task was canceled, so this conversation closed.');
      expect(status).not.toHaveTextContent(/declined|chose another/);
      expect(within(status).getByRole('link', { name: wayOn })).toHaveAttribute('href', href);
      view.unmount();
    }
  });

  it('keeps contact segments masked and uses timeline copy inside the message log, which announces nothing itself', () => {
    const { container } = thread();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const log = screen.getByRole('log');
    // New messages are announced by their own polite line (sweep MN11): the log's implicit live region is off.
    expect(log).toHaveAttribute('aria-live', 'off');
    expect(within(log).getByText('•••-•••-0134 (hidden until booking)')).toBeVisible();
    expect(within(log).getByText('•••@••• (hidden until booking)')).toBeVisible();
    expect(log).toHaveTextContent('Offer received · $50.00');
    expect(container.textContent).not.toContain('512-555-0134');
    expect(screen.getByText(/Phone numbers, emails, links and usernames.*hidden until the booking is confirmed/)).toBeVisible();
    const phoneMessage = deskOfferThreadPageData.messages[1]!;
    expect(log.querySelector(`time[datetime="${phoneMessage.createdAt}"]`)).toHaveTextContent(formatTime(phoneMessage.createdAt));
    expect(log).toHaveTextContent(deskOfferThreadPageData.thread.otherParty.displayName);
  });

  it('preserves allowed post-booking text and shows booking status copy', () => {
    thread(deskBookingThreadPageData);
    expect(screen.getByRole('log')).toHaveTextContent('512-555-0101');
    expect(screen.getByRole('log')).toHaveTextContent('On the way');
    expect(screen.queryByText(/Phone numbers, emails, links and usernames.*hidden until the booking is confirmed/)).not.toBeInTheDocument();
  });

  it('keeps the photo label in its accessible name and restores focus after viewing the larger image', async () => {
    const user = userEvent.setup();
    thread(deskBookingThreadPageData);
    const photo = deskBookingThreadPageData.messages.flatMap((message) => message.attachments)[0]!;
    const trigger = screen.getByRole('button', { name: `View photo: ${photo.alt}` });
    expect(trigger).toHaveTextContent('View photo');
    expect(trigger).toHaveAccessibleName(expect.stringContaining(trigger.textContent!));
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Photo 1 of 1' });
    expect(within(dialog).getByRole('img', { name: photo.alt })).toHaveAttribute('src', photo.src);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    [closedThreadPageData, 'This conversation is closed'],
    [blockedThreadPageData, "You can't message each other"],
  ] as const)('keeps disabled conversations readable and explains why sending is unavailable', (data, reason) => {
    thread(data);
    expect(screen.getByRole('log')).toHaveTextContent('0134');
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^send/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  const subjects: Array<{ subject: ThreadSubject; href: string }> = [
    { subject: { kind: 'offer_for_client', taskId: 'task with spaces', offerId: 'offer/encoded' }, href: routes.app.offer('task with spaces', 'offer/encoded') },
    { subject: { kind: 'task_for_helper', taskId: 'task with spaces' }, href: routes.app.findWorkTask('task with spaces') },
    { subject: { kind: 'booking', bookingId: 'booking/encoded' }, href: routes.app.booking('booking/encoded') },
    { subject: { kind: 'series', seriesId: 'series/encoded' }, href: routes.app.series('series/encoded') },
  ];
  it.each(subjects)('links subject $subject.kind through the matching route builder', ({ subject, href }) => {
    thread({ ...closedThreadPageData, thread: { ...closedThreadPageData.thread, subject } });
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === href)).toBe(true);
  });

  it('groups dates in the market time zone across UTC midnight', () => {
    const entries: MessageView[] = [
      { id: 'day-one', sender: 'them', kind: 'text', segments: [{ kind: 'text', text: 'Before UTC midnight' }], attachments: [], createdAt: '2026-11-21T23:30:00.000Z' },
      { id: 'same-market-day', sender: 'me', kind: 'text', segments: [{ kind: 'text', text: 'Same Austin day' }], attachments: [], createdAt: '2026-11-22T01:30:00.000Z' },
      { id: 'day-two', sender: 'them', kind: 'text', segments: [{ kind: 'text', text: 'Next Austin day' }], attachments: [], createdAt: '2026-11-22T06:30:00.000Z' },
    ];
    thread({ ...closedThreadPageData, messages: entries });
    const log = screen.getByRole('log');
    expect(within(log).getAllByText(formatDate(entries[0]!.createdAt, { withYear: true }))).toHaveLength(1);
    expect(within(log).getAllByText(formatDate(entries[2]!.createdAt, { withYear: true }))).toHaveLength(1);
    const times = Array.from(log.querySelectorAll('time[datetime]')).map((element) => element.getAttribute('datetime'));
    expect(times.filter((value) => entries.some((entry) => entry.createdAt === value))).toEqual(entries.map((entry) => entry.createdAt));
  });

  it('separates days with headings that stay in place, so they never cover a photo while scrolling (UI-021)', () => {
    thread();
    for (const heading of within(screen.getByRole('log')).getAllByRole('heading', { level: 2 })) {
      expect(heading.className).not.toMatch(/\b(sticky|fixed|absolute)\b/);
    }
  });

  it('refreshes every 15 seconds only while visible and on focus, then cleans up', () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const view = thread(closedThreadPageData);
    navigation.refresh.mockClear();
    act(() => vi.advanceTimersByTime(14_999));
    expect(navigation.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.focus(window);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    visibility = 'visible';
    fireEvent.focus(window);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
    view.unmount();
    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.focus(window);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
  });

  it('offers "Load earlier messages" by a route-built link, and keeps the reader in place as they come in (sweep MN11)', () => {
    let height = 900;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const latest = { ...deskBookingThreadPageData, messages: deskBookingThreadPageData.messages.slice(2), earlier: { from: 'msg_1' } };
    const view = thread(latest);
    expect(screen.getByRole('link', { name: 'Load earlier messages' })).toHaveAttribute('href', routes.app.thread(latest.thread.id, { from: 'msg_1' }));
    // The reader scrolls up to it, and the earlier messages come in above what they were reading.
    const log = screen.getByRole('log');
    log.scrollTop = 0;
    fireEvent.scroll(log);
    height = 1300;
    view.rerender(threadView(deskBookingThreadPageData));
    expect(log.scrollTop).toBe(400);
    expect(screen.queryByRole('link', { name: 'Load earlier messages' })).toBeNull();
  });

  it('keeps the reader in place even when their last scroll hasn’t been heard yet (MN11’s flake under load)', () => {
    let height = 900;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const latest = { ...deskBookingThreadPageData, messages: deskBookingThreadPageData.messages.slice(2), earlier: { from: 'msg_1' } };
    const view = thread(latest);
    const log = screen.getByRole('log');
    // Opened at the bottom, and that scroll was heard.
    log.scrollTop = 600;
    fireEvent.scroll(log);
    // The reader goes up to "Load earlier messages", but the earlier ones render before that scroll's event arrives.
    log.scrollTop = 0;
    height = 1300;
    view.rerender(threadView(deskBookingThreadPageData));
    expect(log.scrollTop).toBe(400);
  });

  it('doesn’t pull a reader who just scrolled up back down when a message arrives before that scroll is heard', () => {
    let height = 900;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const view = thread(closedThreadPageData);
    const log = screen.getByRole('log');
    log.scrollTop = 600;
    fireEvent.scroll(log);
    log.scrollTop = 100;
    height = 1100;
    view.rerender(threadView({ ...closedThreadPageData, messages: [...closedThreadPageData.messages, { ...closedThreadPageData.messages[1]!, id: 'new-message-unheard' }] }));
    expect(log.scrollTop).toBe(100);
  });

  it('announces earlier messages loaded above as one line, and new ones from the other person as they come (sweep MN11)', () => {
    // Every live region on the page and what it says (a log or status without aria-live is polite by default).
    const live = () => [...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="log"]:not([aria-live]), [role="status"]:not([aria-live]), [role="alert"]:not([aria-live])')].map((region) => region.textContent ?? '');
    const added = (before: string[], after: string[]) => {
      expect(after).toHaveLength(before.length);
      return after.flatMap((text, index) => (text === before[index] ? [] : [text.startsWith(before[index]!) ? text.slice(before[index]!.length) : text]));
    };
    const latest = { ...deskBookingThreadPageData, messages: deskBookingThreadPageData.messages.slice(2), earlier: { from: 'msg_1' } };
    const view = thread(latest);
    const opened = live();
    // Opening it says none of its messages.
    expect(opened.join(' ')).not.toContain('Here is the desk');
    // Two earlier messages come in above: one line, and none of their words.
    view.rerender(threadView(deskBookingThreadPageData));
    const loaded = live();
    expect(added(opened, loaded)).toEqual(['Loaded 2 earlier messages']);
    // A new message from Jordan is read out, with his name; your own isn't.
    const theirs: MessageView = { id: 'msg_new_theirs', sender: 'them', kind: 'text', segments: [{ kind: 'text', text: 'Parking in the driveway?' }], attachments: [], createdAt: '2026-11-21T16:01:00.000Z' };
    const mine: MessageView = { ...theirs, id: 'msg_new_mine', sender: 'me', segments: [{ kind: 'text', text: 'Yes, go ahead.' }], createdAt: '2026-11-21T16:02:00.000Z' };
    view.rerender(threadView({ ...deskBookingThreadPageData, messages: [...deskBookingThreadPageData.messages, theirs, mine] }));
    expect(added(loaded, live())).toEqual(['Jordan T.: Parking in the driveway?']);
  });

  it('opens at the latest message and follows new messages only when already at the bottom', () => {
    let height = 900;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    const view = thread(closedThreadPageData);
    const log = screen.getByRole('log');
    expect(log.scrollTop).toBeGreaterThanOrEqual(600);
    log.scrollTop = 100;
    fireEvent.scroll(log);
    const first: MessageView = { ...closedThreadPageData.messages[1]!, id: 'new-message-one' };
    height = 1100;
    const next = { ...closedThreadPageData, messages: [...closedThreadPageData.messages, first] };
    view.rerender(threadView(next));
    expect(log.scrollTop).toBe(100);
    log.scrollTop = 800;
    fireEvent.scroll(log);
    height = 1300;
    view.rerender(threadView({ ...next, messages: [...next.messages, { ...first, id: 'new-message-two' }] }));
    expect(log.scrollTop).toBeGreaterThanOrEqual(1000);
  });
});
