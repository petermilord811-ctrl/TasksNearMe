/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type ActionResult, type AskForOfferInput, type MessageReaction, type PhotoUploadResult } from '@/contracts';
import { chatRequestCardThreadData, chatRequestThreadData, chatThreadData, deskBookingThreadPageData, fakeChatThreadHandlers, fakeThreadHandlers, plusMenuForHelperPageData, plusMenuThreadPageData, requestThreadPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { MessageComposerContent } from '@/ui/screens/messages/message-composer';
import { MessageLog } from '@/ui/screens/messages/message-log';
import { ReplyProvider } from '@/ui/screens/messages/reply-context';
import { DockedChats } from './chat-window';
import { ConversationActionsMenu } from './conversation-actions';
import { OfferAskCardView } from './conversation-cards';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  // jsdom has neither: the dock watches the chat window's size, and the drop overlay waits a frame.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const now = '2026-11-21T16:05:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}>{node}</NextIntlClientProvider>);
const photo = (name = 'desk.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const uploaded = (id: string): PhotoUploadResult => ({ ok: true, photo: { id, src: '/samples/work-desk.svg', alt: '', width: 800, height: 600 } });

/** The owner's chat feedback, 2026-11-23: photos, reactions, docked windows and the conversation's "+". */

describe('photos in a message', () => {
  it('uploads a photo dropped on the conversation and shows it above the message', async () => {
    const onUploadPhoto = vi.fn(async () => uploaded('ph_drop'));
    wrap(<ReplyProvider><div data-drop-photos="" data-testid="panel" className="relative"><MessageComposerContent rules={requestThreadPageData.composer} handlers={{ ...fakeThreadHandlers, onUploadPhoto }} /></div></ReplyProvider>);
    const panel = screen.getByTestId('panel');
    const dataTransfer = { types: ['Files'], files: [photo()], dropEffect: 'none' };
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    fireEvent.dragEnter(panel, { dataTransfer });
    expect(await screen.findByText('Drop photos to send')).toBeInTheDocument();
    fireEvent.drop(panel, { dataTransfer });
    await waitFor(() => expect(onUploadPhoto).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('list', { name: 'Photos to send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument();
    expect(screen.queryByText('Drop photos to send')).toBeNull();
  });

  it("attaches a photo pasted into the message, and refuses a file that isn't a photo", async () => {
    const onUploadPhoto = vi.fn(async () => uploaded('ph_paste'));
    wrap(<ReplyProvider><MessageComposerContent rules={requestThreadPageData.composer} handlers={{ ...fakeThreadHandlers, onUploadPhoto }} /></ReplyProvider>);
    const box = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.paste(box, { clipboardData: { files: [photo('screen.png')] } });
    await waitFor(() => expect(onUploadPhoto).toHaveBeenCalledTimes(1));
    // The paperclip opens the picker at once (a hidden input), which only takes photos.
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG|PNG|WebP|HEIC|photo/i);
    expect(onUploadPhoto).toHaveBeenCalledTimes(1);
  });
});

describe('reactions', () => {
  const data = chatThreadData.data;
  const theirs = data.messages.find((message) => message.kind === 'text' && message.sender === 'them')!;

  it('opens the picker from React, shows seven then all ten, and reacts with the one chosen', async () => {
    const user = userEvent.setup();
    // The server's answer waits, so the reaction shown is the one from the tap.
    let answer!: (result: ActionResult) => void;
    const onReact = vi.fn((_input: { messageId: string; emoji: MessageReaction; on: boolean }) => new Promise<ActionResult>((resolve) => { answer = resolve; }));
    wrap(<ReplyProvider><MessageLog messages={[theirs]} otherParty={data.thread.otherParty} now={now} onReact={onReact} canReply /></ReplyProvider>);
    await user.click(screen.getByRole('button', { name: 'React' }));
    const picker = await screen.findByRole('toolbar');
    expect(within(picker).getAllByRole('button', { pressed: false })).toHaveLength(7);
    await user.click(within(picker).getByRole('button', { name: 'More reactions' }));
    expect(within(screen.getByRole('toolbar')).getAllByRole('button')).toHaveLength(10);
    await user.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Fire' }));
    expect(onReact).toHaveBeenCalledExactlyOnceWith({ messageId: theirs.id, emoji: 'fire', on: true });
    // The pill shows at once, before the server answers; the picker has closed.
    expect(screen.getByRole('list', { name: 'Reactions' })).toHaveTextContent('🔥');
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    await act(async () => { answer({ ok: true, code: 'updated' }); });
  });

  it("keeps a tapped reaction while the server answers and until the conversation's data shows it", async () => {
    // The owner, 2026-11-24: "emoji is reacted and disappeared and reacted again". The chat window reads the
    // conversation again only after the action answers, so in between the old data didn't have the reaction yet.
    const user = userEvent.setup();
    const onReact = vi.fn(async (_input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    const log = (message: typeof theirs) => <NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}><ReplyProvider><MessageLog messages={[message]} otherParty={data.thread.otherParty} now={now} onReact={onReact} canReply /></ReplyProvider></NextIntlClientProvider>;
    const view = render(log(theirs));
    await user.click(screen.getByRole('button', { name: 'React' }));
    await user.click(within(await screen.findByRole('toolbar')).getByRole('button', { name: 'Fire' }));
    await waitFor(() => expect(onReact).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    // The action has answered; the conversation hasn't been read again yet: the pill stays.
    expect(screen.getByRole('list', { name: 'Reactions' })).toHaveTextContent(/^🔥\s*Fire\s*1$/);
    // The conversation read again, with the reaction: still one pill, one count.
    const withFire = { ...theirs, reactions: [{ emoji: 'fire' as const, count: 1, mine: true }] };
    view.rerender(log(withFire));
    expect(screen.getByRole('list', { name: 'Reactions' })).toHaveTextContent(/^🔥\s*Fire\s*1$/);
    // Settled: what the data says from now on (here, taken back on another device).
    view.rerender(log({ ...theirs, reactions: [] }));
    expect(screen.queryByRole('list', { name: 'Reactions' })).toBeNull();
  });

  it('takes a tapped reaction back when the server refuses it', async () => {
    const user = userEvent.setup();
    const onReact = vi.fn(async (_input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult> => ({ ok: false, code: 'rate_limited' }));
    wrap(<ReplyProvider><MessageLog messages={[theirs]} otherParty={data.thread.otherParty} now={now} onReact={onReact} canReply /></ReplyProvider>);
    await user.click(screen.getByRole('button', { name: 'React' }));
    await user.click(within(await screen.findByRole('toolbar')).getByRole('button', { name: 'Fire' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Reactions' })).toBeNull());
  });

  it('opens the picker with Reply and Copy on a long press, and a double tap sends a heart', async () => {
    vi.useFakeTimers();
    const onReact = vi.fn(async (_input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    wrap(<ReplyProvider><MessageLog messages={[theirs]} otherParty={data.thread.otherParty} now={now} onReact={onReact} canReply /></ReplyProvider>);
    const bubble = document.querySelector(`[data-message-id="${theirs.id}"] article`)!;
    fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 });
    await act(async () => { vi.advanceTimersByTime(500); });
    // The picker, with the message's actions under the emoji (on a phone there's no row beside the bubble).
    const picker = screen.getByRole('dialog', { name: /^Reactions to / });
    expect(within(picker).getAllByRole('button', { pressed: false })).toHaveLength(7);
    expect(within(picker).getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await act(async () => { vi.advanceTimersByTime(50); });
    // Two quick taps: a heart.
    for (let tap = 0; tap < 2; tap += 1) {
      fireEvent.pointerDown(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 });
      fireEvent.pointerUp(bubble, { pointerType: 'touch', clientX: 10, clientY: 10 });
      await act(async () => { vi.advanceTimersByTime(80); });
    }
    expect(onReact).toHaveBeenCalledWith({ messageId: theirs.id, emoji: 'heart', on: true });
  });
});

describe('conversations side by side', () => {
  it('shows as many windows as fit and the rest as heads beside the chat window', async () => {
    const onRestore = vi.fn();
    const docked = [
      { threadId: chatRequestCardThreadData.data.thread.id, minimized: false },
      { threadId: chatRequestThreadData.data.thread.id, minimized: false },
      { threadId: chatThreadData.data.thread.id, minimized: false },
    ];
    // Room for two windows beside the chat window: the third waits as a head.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    wrap(<DockedChats docked={docked} mainKey="open" now={now} handlers={fakeChatThreadHandlers}
      loads={{ [docked[0]!.threadId]: { status: 'ready', data: chatRequestCardThreadData }, [docked[1]!.threadId]: { status: 'ready', data: chatRequestThreadData }, [docked[2]!.threadId]: { status: 'ready', data: chatThreadData } }}
      onMinimize={vi.fn()} onRestore={onRestore} onClose={vi.fn()} onRefresh={vi.fn()} onLoadEarlier={async () => undefined} onShowInWindow={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));
    const heads = screen.getByRole('list', { name: 'Conversations waiting beside the chat window' });
    expect(within(heads).getAllByRole('listitem').length).toBeGreaterThan(0);
    fireEvent.click(within(heads).getAllByRole('button', { name: /: open$/ })[0]!);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});

describe('the conversation\'s "+"', () => {
  it('asks the helper for an offer on one of your open tasks', async () => {
    const user = userEvent.setup();
    const onAskForOffer = vi.fn(async (_input: AskForOfferInput): Promise<ActionResult> => ({ ok: true, code: 'sent' }));
    wrap(<ConversationActionsMenu options={plusMenuThreadPageData.requestOptions!} name="Jordan" onAskForOffer={onAskForOffer} />);
    await user.click(screen.getByRole('button', { name: 'More ways to work with Jordan' }));
    expect(screen.getByRole('menuitem', { name: /Request a task/ })).toHaveAttribute('href', routes.app.requestHelper('jordan-t'));
    await user.click(screen.getByRole('menuitem', { name: /Ask for an offer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Ask Jordan for an offer' });
    await user.click(within(dialog).getByRole('radio', { name: 'Clear leaves from the backyard' }));
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onAskForOffer).toHaveBeenCalledExactlyOnceWith({ taskId: 'tsk_leaves' }));
  });

  it("lists the other person's open tasks for a helper, each opening the offer form", async () => {
    const user = userEvent.setup();
    wrap(<ConversationActionsMenu options={plusMenuForHelperPageData.requestOptions!} name="Maya" />);
    await user.click(screen.getByRole('button', { name: 'More ways to work with Maya' }));
    await user.click(screen.getByRole('menuitem', { name: /Make an offer to Maya/ }));
    const dialog = await screen.findByRole('dialog', { name: "Maya's open tasks" });
    expect(within(dialog).getByRole('link', { name: /Hang three shelves/ })).toHaveAttribute('href', routes.app.findWorkOffer('tsk_shelves'));
  });

  it('shows the ask as a card: Make an offer for the helper', () => {
    wrap(<OfferAskCardView card={plusMenuForHelperPageData.cards!.offerAsks!.msg_d7!} name="Maya" createdAt={now} />);
    expect(screen.getByText('Maya asked you for an offer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make an offer' })).toHaveAttribute('href', '/app/find-work/tsk_shelves/offer');
  });
});

describe('ticks on your own messages', () => {
  it('shows one tick on a sent message and two once the other person has read it', () => {
    const data = deskBookingThreadPageData;
    const read = data.messages.find((message) => message.sender === 'me' && message.kind === 'text')!;
    const sent = { ...read, id: 'msg_after', createdAt: '2026-11-21T16:00:00.000Z' };
    const theirs = data.messages.find((message) => message.sender === 'them')!;
    wrap(<ReplyProvider><MessageLog messages={[read, theirs, sent]} otherParty={data.thread.otherParty} now={now} readUpTo={data.readUpTo} /></ReplyProvider>);
    expect(screen.getAllByRole('img', { name: 'Read' })).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: 'Sent' })).toHaveLength(1);
    // Theirs carry none, and "Seen" is gone.
    expect(screen.queryByText('Seen')).toBeNull();
  });

  it('shows one tick on every message while read receipts are off (no readUpTo)', () => {
    const data = deskBookingThreadPageData;
    const mine = data.messages.filter((message) => message.sender === 'me');
    wrap(<ReplyProvider><MessageLog messages={mine} otherParty={data.thread.otherParty} now={now} /></ReplyProvider>);
    expect(screen.queryAllByRole('img', { name: 'Read' })).toHaveLength(0);
    expect(screen.getAllByRole('img', { name: 'Sent' })).toHaveLength(mine.length);
  });
});
