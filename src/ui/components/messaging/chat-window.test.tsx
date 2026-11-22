/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '@/contracts/routes';
import { chatInboxData, chatInboxEmptyData, chatThreadData, emptyTranscript, fakeChatThreadHandlers, fakeHelpChatHandlers, helpChatAssistantData } from '@/fixtures';
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
  transcript: emptyTranscript,
  now,
  threadHandlers: fakeChatThreadHandlers,
  helpHandlers: fakeHelpChatHandlers,
  onShow: () => undefined,
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

  it('starts a new message by @username, and closes into the page for it', () => {
    const onFullPage = vi.fn();
    wrap(<ChatWindow {...base} onFullPage={onFullPage} />);
    const link = screen.getByRole('link', { name: 'New message' });
    expect(link.getAttribute('href')).toBe(routes.app.newMessage());
    fireEvent.click(link);
    expect(onFullPage).toHaveBeenCalled();
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
