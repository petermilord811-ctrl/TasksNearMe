/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/contracts/routes';
import { chatInboxData, chatInboxEmptyData, chatThreadData, emptyTranscript, fakeChatThreadHandlers, fakeHelpChatHandlers, fakeNewChatHandlers, helpChatAssistantData, newDirectMessageData, newDirectMessageSampleData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { ChatWindow, type ChatWindowProps } from './chat-window';
import { ChatLauncher } from './chat-launcher';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);
const now = '2026-11-17T16:00:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>);

const base: ChatWindowProps = {
  state: 'open',
  view: { kind: 'list' },
  unread: 3,
  inbox: { status: 'ready', data: chatInboxData },
  thread: { status: 'idle' },
  help: { status: 'idle' },
  start: { status: 'idle' },
  transcript: emptyTranscript,
  now,
  threadHandlers: fakeChatThreadHandlers,
  helpHandlers: fakeHelpChatHandlers,
  newChatHandlers: fakeNewChatHandlers,
  onShow: () => undefined,
  onStarted: () => undefined,
  onMinimize: () => undefined,
  onRestore: () => undefined,
  onClose: () => undefined,
  onRetry: () => undefined,
  onRefreshThread: () => undefined,
  onLoadEarlier: async () => undefined,
  fullPageHref: routes.app.messages(),
  onFullPage: () => undefined,
};

describe('ChatWindow', () => {
  it('is a non-modal dialog with Help pinned over the conversations, and opens them in place', () => {
    const onShow = vi.fn();
    wrap(<ChatWindow {...base} onShow={onShow} />);
    const dialog = screen.getByRole('dialog', { name: 'Messages' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(within(dialog).getByText('3 unread')).toBeDefined();
    const help = within(dialog).getByRole('link', { name: /TasksNearMe Help/ });
    expect(help.getAttribute('href')).toBe(routes.app.helpChat());
    expect(within(help).getByText('Support replied')).toBeDefined();
    fireEvent.click(help);
    expect(onShow).toHaveBeenCalledWith({ kind: 'help' });
    const conversations = within(dialog).getByRole('list', { name: 'Conversations' });
    const first = within(conversations).getAllByRole('link')[0]!;
    fireEvent.click(first);
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'thread', threadId: chatInboxData.threads[0]!.id });
  });

  it('minimizes on Esc, and has Open full page, Minimize and Close', () => {
    const onMinimize = vi.fn();
    const onClose = vi.fn();
    const onFullPage = vi.fn();
    wrap(<ChatWindow {...base} onMinimize={onMinimize} onClose={onClose} onFullPage={onFullPage} />);
    const dialog = screen.getByRole('dialog', { name: 'Messages' });
    fireEvent.keyDown(within(dialog).getByRole('searchbox'), { key: 'Escape' });
    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Open full page' }).getAttribute('href')).toBe(routes.app.messages());
    fireEvent.click(screen.getByRole('button', { name: 'Close messages' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('starts a new message right in the window (2026-11-23, owner: "I want to do it in live chat box itself")', () => {
    const onShow = vi.fn();
    const onFullPage = vi.fn();
    wrap(<ChatWindow {...base} onShow={onShow} onFullPage={onFullPage} />);
    expect(screen.queryByRole('link', { name: 'New message' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    expect(onShow).toHaveBeenCalledWith({ kind: 'new' });
    expect(onFullPage).not.toHaveBeenCalled();
  });

  it('suggests people as their @username is typed; one the viewer talks to opens that conversation, Find takes what’s typed', async () => {
    const onShow = vi.fn();
    wrap(<ChatWindow {...base} view={{ kind: 'new' }} onShow={onShow} />);
    const box = screen.getByRole('combobox', { name: 'Their username' });
    expect(await screen.findByText('You can start 2 more conversations today (3 a day at your level, Newcomer).')).toBeTruthy();
    fireEvent.change(box, { target: { value: '@jo' } });
    fireEvent.click(await screen.findByRole('option', { name: /Jordan T\./ }));
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'thread', threadId: 'thr_maya_jordan_direct' });
    fireEvent.click(screen.getByRole('option', { name: /Josie P\./ }));
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'new', to: { userId: 'usr_josie_park' } });
    // A sample profile says so.
    expect(within(screen.getByRole('option', { name: /Jonah L\./ })).getByText('Sample profile')).toBeTruthy();
    // The arrow keys move through them and Enter chooses.
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Josie P\./ }).id);
    fireEvent.submit(box.closest('form')!);
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'new', to: { userId: 'usr_josie_park' } });
    fireEvent.change(box, { target: { value: 'jox' } });
    expect(await screen.findByText('No one we can reach has a username starting with @jox.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'new', to: { username: 'jox' } });
  });

  it('writes the first message in the window, and Send shows the new conversation there', async () => {
    const onStarted = vi.fn();
    const onStart = vi.fn(async () => ({ ok: true as const, code: 'sent' as const, redirectTo: routes.app.thread('thr_new') }));
    const onShow = vi.fn();
    wrap(<ChatWindow {...base} view={{ kind: 'new', to: { userId: newDirectMessageData.recipient.id } }} start={{ status: 'ready', data: { kind: 'page', data: newDirectMessageData } }} newChatHandlers={{ ...fakeNewChatHandlers, onStart }} onStarted={onStarted} onShow={onShow} />);
    expect(screen.getByRole('heading', { name: 'Message Jordan T.' })).toBeTruthy();
    expect(screen.getByText('@jordan')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your message' }), { target: { value: 'Hi Jordan!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledWith(routes.app.thread('thr_new')));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ to: newDirectMessageData.recipient.id, body: 'Hi Jordan!' }));
    // Someone else: back to the box.
    fireEvent.click(screen.getByRole('button', { name: 'Someone else' }));
    expect(onShow).toHaveBeenLastCalledWith({ kind: 'new' });
  });

  it('says when an @username belongs to nobody, and that a sample profile won’t reply', async () => {
    const { unmount } = wrap(<ChatWindow {...base} view={{ kind: 'new', to: { username: 'jordan_tx' } }} start={{ status: 'error', notFound: true }} />);
    expect((await screen.findByRole('alert')).textContent).toBe('No one we can reach has the username @jordan_tx. Check the spelling.');
    expect((screen.getByRole('combobox', { name: 'Their username' }) as HTMLInputElement).value).toBe('jordan_tx');
    unmount();
    wrap(<ChatWindow {...base} view={{ kind: 'new', to: { username: 'jonah' } }} start={{ status: 'ready', data: { kind: 'page', data: newDirectMessageSampleData } }} />);
    expect(screen.getByRole('note').textContent).toBe('Jonah is a sample profile that shows how TasksNearMe works, so they won\'t reply.');
  });

  it('resizes from its corner with the keyboard, keeps the size for this browser, and Home puts it back', () => {
    localStorage.setItem('tnm.chat.size', JSON.stringify({ width: 500, height: 500 }));
    const { unmount } = wrap(<ChatWindow {...base} />);
    const dialog = screen.getByRole('dialog', { name: 'Messages' });
    expect([dialog.style.width, dialog.style.height]).toEqual(['500px', '500px']);
    const handle = within(dialog).getByRole('button', { name: 'Resize the messages window' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect([dialog.style.width, dialog.style.height]).toEqual(['532px', '468px']);
    expect(JSON.parse(localStorage.getItem('tnm.chat.size') ?? 'null')).toEqual({ width: 532, height: 468 });
    // Never smaller than its minimum.
    for (let index = 0; index < 10; index += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(dialog.style.width).toBe('360px');
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(dialog.style.width).toBe('');
    expect(localStorage.getItem('tnm.chat.size')).toBeNull();
    unmount();
    // A size kept from a bigger screen fits inside this one (1024 × 768 in the test browser).
    localStorage.setItem('tnm.chat.size', JSON.stringify({ width: 5000, height: 5000 }));
    wrap(<ChatWindow {...base} />);
    const fitted = screen.getByRole('dialog', { name: 'Messages' });
    expect([fitted.style.width, fitted.style.height]).toEqual([`${window.innerWidth - 48}px`, `${window.innerHeight - 68 - 24}px`]);
    localStorage.removeItem('tnm.chat.size');
  });

  it('shows a conversation with its composer, and the way back to the list', () => {
    const onShow = vi.fn();
    wrap(<ChatWindow {...base} view={{ kind: 'thread', threadId: chatThreadData.data.thread.id }} thread={{ status: 'ready', data: chatThreadData }} onShow={onShow} />);
    expect(screen.getByRole('region', { name: /^Conversation with / })).toBeDefined();
    expect(screen.getByRole('log')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(onShow).toHaveBeenCalledWith({ kind: 'list' });
  });

  it('says when something failed to load, or is not there', () => {
    const onRetry = vi.fn();
    const { unmount } = wrap(<ChatWindow {...base} inbox={{ status: 'error' }} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    wrap(<ChatWindow {...base} view={{ kind: 'thread', threadId: 'thr_x' }} thread={{ status: 'error', notFound: true }} />);
    expect(screen.getByText("This conversation isn't available.")).toBeDefined();
  });

  it('with no conversations yet, still offers Help; and shows Help when asked', () => {
    const { unmount } = wrap(<ChatWindow {...base} inbox={{ status: 'ready', data: chatInboxEmptyData }} />);
    expect(screen.getByText(/No conversations yet/)).toBeDefined();
    expect(screen.getByRole('link', { name: /TasksNearMe Help/ })).toBeDefined();
    unmount();
    wrap(<ChatWindow {...base} view={{ kind: 'help' }} help={{ status: 'ready', data: helpChatAssistantData }} />);
    expect(screen.getByRole('log', { name: 'Conversation with TasksNearMe Help' })).toBeDefined();
  });

  it('minimized, is a bar in the corner that opens again', () => {
    const onRestore = vi.fn();
    wrap(<ChatWindow {...base} state="minimized" onRestore={onRestore} />);
    const bar = screen.getByRole('region', { name: 'Messages, minimized' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Open messages' }));
    expect(onRestore).toHaveBeenCalled();
  });
});

describe('ChatLauncher', () => {
  it('names the unread count, links to Messages on phones, and opens the window on wide screens', () => {
    const onOpen = vi.fn();
    wrap(<ChatLauncher unread={3} windowShown={false} onOpen={onOpen} />);
    expect(screen.getByRole('link', { name: 'Messages, 3 unread' }).getAttribute('href')).toBe(routes.app.messages());
    fireEvent.click(screen.getByRole('button', { name: 'Messages, 3 unread' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('steps aside on Messages itself, for the window, and on phones where the page owns the bottom', () => {
    const { unmount } = wrap(<ChatLauncher unread={0} windowShown={false} hidden onOpen={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Messages' })).toBeNull();
    unmount();
    const second = wrap(<ChatLauncher unread={0} windowShown onOpen={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Messages' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Messages' })).toBeDefined();
    second.unmount();
    wrap(<ChatLauncher unread={0} windowShown={false} hiddenOnPhones onOpen={() => undefined} />);
    expect(screen.queryByRole('link', { name: 'Messages' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Messages' })).toBeDefined();
  });
});
