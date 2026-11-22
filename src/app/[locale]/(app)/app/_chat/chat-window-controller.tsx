'use client';

import dynamic from 'next/dynamic';
import { useSelectedLayoutSegments } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActionResult,
  ChatInboxData,
  ChatLoad,
  ChatThreadData,
  ChatThreadHandlers,
  ChatView,
  ChatWindowState,
  HandOffInput,
  HelpChatData,
  HelpChatHandlers,
  MessageReaction,
  MessageSavedReplyInput,
  PhotoUploadResult,
  ReportInput,
  SendMessageInput,
  SupportReplyInput,
} from '@/contracts';
import { chatViewHref, chatViewOfHref } from '@/shared/chat-links';
import { ChatLauncher } from '@/ui/components/messaging/chat-launcher';
import { useRealtime, useRealtimeConnected, type RealtimeNotice } from '@/ui/lib/realtime';
import { useAppShellLayout } from '@/ui/shells/app-shell-layout';
import { useHelpChat } from './use-help-chat';

/** The window's code loads the first time it opens: every signed-in page carries only the button. */
const ChatWindow = dynamic(() => import('@/ui/components/messaging/chat-window').then((module) => module.ChatWindow), { ssr: false, loading: () => null });

/** Server Actions the signed-in shell hands over (never closures: src/app/[locale]/(app)/app/signed-in-shell.tsx). */
export interface ChatActions {
  send(threadId: string, input: SendMessageInput): Promise<ActionResult>;
  react(threadId: string, input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult>;
  typing(threadId: string): Promise<void>;
  upload(formData: FormData): Promise<PhotoUploadResult>;
  saveReply(input: MessageSavedReplyInput): Promise<ActionResult>;
  deleteReply(input: { id: string }): Promise<ActionResult>;
  report(threadId: string, input: ReportInput): Promise<ActionResult>;
  block(threadId: string, input: { blocked: boolean }): Promise<ActionResult>;
  handOff(input: HandOffInput): Promise<ActionResult>;
  reply(caseId: string, input: SupportReplyInput): Promise<ActionResult>;
  requestLive(caseId: string): Promise<ActionResult>;
  typingInCase(caseId: string): Promise<void>;
}

const WIDE = '(min-width: 1024px)';
const POLL_MS = 15_000;
const storageKey = (viewerId: string) => `tnm.chat.${viewerId}`;

function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

function useVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

const keyOf = (view: ChatView) => (view.kind === 'thread' ? `thread:${view.threadId}` : view.kind);
const dataOf = <T,>(load: ChatLoad<T>): T | undefined => (load.status === 'idle' ? undefined : load.data);

function restored(viewerId: string): { state: ChatWindowState; view: ChatView } | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey(viewerId)) ?? 'null') as { state?: unknown; view?: unknown } | null;
    if (!stored || (stored.state !== 'open' && stored.state !== 'minimized' && stored.state !== 'closed')) return null;
    const view = stored.view as Partial<{ kind: string; threadId: string }> | undefined;
    const next: ChatView = view?.kind === 'help' ? { kind: 'help' } : view?.kind === 'thread' && typeof view.threadId === 'string' && view.threadId.length <= 80 ? { kind: 'thread', threadId: view.threadId } : { kind: 'list' };
    return { state: stored.state, view: next };
  } catch {
    return null;
  }
}

/**
 * Messages on every signed-in page (2026-11-22): the chat button, and on wide screens the chat window. The window keeps
 * what it shows for the tab (sessionStorage), loads its data through the app's read routes only while it's open and the
 * tab is visible (a conversation reads as read when it loads, as on its page), follows the live notices (a new message,
 * something read, support's reply) and falls back to asking every 15 seconds while the live connection is down. A plain
 * click on a link to a conversation, or to Help, opens it in the window instead of leaving the page. On Messages' own
 * pages the window and the button step aside. Every page still refreshes on the same notices, so the counts in the
 * shell (the button's included) come from the server, as before.
 */
export function ChatWindowController({ viewerId, unread, actions }: { viewerId: string; unread: number; actions: ChatActions }) {
  const segments = useSelectedLayoutSegments();
  const layout = useAppShellLayout();
  const onMessagesPage = segments[1] === 'messages';
  const routeKey = segments.join('/');
  const wide = useWide();
  const visible = useVisible();
  const live = useRealtimeConnected();

  // What the window showed in this tab before (a reload, or a new document): read at the first render in the browser.
  // The window itself waits for `wide` (an effect), so that first render matches the server's.
  const [initial] = useState(() => (typeof window === 'undefined' ? null : restored(viewerId)));
  const [state, setState] = useState<ChatWindowState>(initial?.state ?? 'closed');
  const [view, setView] = useState<ChatView>(initial?.view ?? { kind: 'list' });
  const [inbox, setInbox] = useState<ChatLoad<ChatInboxData>>({ status: 'idle' });
  const [thread, setThread] = useState<ChatLoad<ChatThreadData>>({ status: 'idle' });
  const [help, setHelp] = useState<ChatLoad<HelpChatData>>({ status: 'idle' });
  const [focusKey, setFocusKey] = useState(0);
  const [now, setNow] = useState(() => new Date().toISOString());

  const active = wide && visible && state === 'open' && !onMessagesPage;
  const activeRef = useRef(active);
  const viewRef = useRef(view);
  const onMessagesPageRef = useRef(onMessagesPage);
  useEffect(() => {
    activeRef.current = active;
    viewRef.current = view;
    onMessagesPageRef.current = onMessagesPage;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(viewerId), JSON.stringify({ state, view }));
    } catch {
      // Storage off: the window just doesn't come back after a reload.
    }
  }, [state, view, viewerId]);

  // Messages' own pages are the chat: the window closes there (adjusted while rendering, React's pattern for state that
  // follows a change of route).
  const [onMessagesBefore, setOnMessagesBefore] = useState(onMessagesPage);
  if (onMessagesPage !== onMessagesBefore) {
    setOnMessagesBefore(onMessagesPage);
    if (onMessagesPage && state !== 'closed') setState('closed');
  }

  // ---- Loading -----------------------------------------------------------------------------------------------------

  const counters = useRef({ inbox: 0, thread: 0, help: 0 });
  const loadInbox = useCallback(async () => {
    const turn = ++counters.current.inbox;
    try {
      const response = await fetch('/api/messages/inbox', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`inbox ${response.status}`);
      const data = (await response.json()) as ChatInboxData;
      if (turn !== counters.current.inbox) return;
      setInbox({ status: 'ready', data });
      setNow(new Date().toISOString());
    } catch {
      if (turn === counters.current.inbox) setInbox((current) => ({ status: 'error', data: dataOf(current) }));
    }
  }, []);

  // After "Load earlier messages", the conversation keeps showing them when it reads again (a new message, a refresh).
  const earlier = useRef<{ threadId: string; from: string } | null>(null);
  const loadThread = useCallback(async (threadId: string, from?: string) => {
    const turn = ++counters.current.thread;
    if (from) earlier.current = { threadId, from };
    const since = from ?? (earlier.current?.threadId === threadId ? earlier.current.from : undefined);
    try {
      const response = await fetch(`/api/messages/threads/${encodeURIComponent(threadId)}${since ? `?from=${encodeURIComponent(since)}` : ''}`, { cache: 'no-store', credentials: 'same-origin' });
      if (turn !== counters.current.thread) return;
      if (response.status === 404) {
        setThread({ status: 'error', notFound: true });
        return;
      }
      if (!response.ok) throw new Error(`thread ${response.status}`);
      const data = (await response.json()) as ChatThreadData;
      if (turn !== counters.current.thread) return;
      setThread({ status: 'ready', data });
      setNow(new Date().toISOString());
    } catch {
      if (turn === counters.current.thread) setThread((current) => ({ status: 'error', data: dataOf(current) }));
    }
  }, []);

  const loadHelp = useCallback(async () => {
    const turn = ++counters.current.help;
    try {
      const response = await fetch('/api/messages/help?read=1', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`help ${response.status}`);
      const data = (await response.json()) as HelpChatData;
      if (turn !== counters.current.help) return;
      setHelp({ status: 'ready', data });
      setNow(new Date().toISOString());
    } catch {
      if (turn === counters.current.help) setHelp((current) => ({ status: 'error', data: dataOf(current) }));
    }
  }, []);

  // A burst of notices reads once.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const soon = useCallback((key: string, run: () => void) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(run, 250);
  }, []);
  useEffect(() => () => Object.values(timers.current).forEach((timer) => clearTimeout(timer)), []);

  const reloadView = useCallback(() => {
    const current = viewRef.current;
    if (current.kind === 'thread') void loadThread(current.threadId);
    if (current.kind === 'help') void loadHelp();
  }, [loadHelp, loadThread]);

  // While it's open: the list, and what's on screen, each time that changes (and when the tab comes back).
  const viewKey = keyOf(view);
  useEffect(() => {
    if (!active) return;
    // Next tick: a quick open-close, or a click through several conversations, reads only the last.
    const timer = setTimeout(() => {
      void loadInbox();
      reloadView();
    }, 0);
    return () => clearTimeout(timer);
  }, [active, viewKey, loadInbox, reloadView]);

  // The live connection is down: ask again every 15 s (the conversation's own log does the same for its messages).
  useEffect(() => {
    if (!active || live) return;
    const timer = setInterval(() => {
      void loadInbox();
      if (viewRef.current.kind === 'help') void loadHelp();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, live, loadHelp, loadInbox]);

  // Live notices: the window reads again; the page behind refreshes as usual (nothing here says it handled them).
  const onThreadNotice = (notice: RealtimeNotice) => {
    if (!activeRef.current) return;
    soon('inbox', () => void loadInbox());
    const current = viewRef.current;
    if (current.kind === 'thread' && notice.thread === current.threadId) soon('thread', () => void loadThread(current.threadId));
  };
  useRealtime('message', onThreadNotice);
  useRealtime('read', onThreadNotice);
  useRealtime('update', (notice) => {
    if (!activeRef.current || typeof notice.event !== 'string' || !notice.event.startsWith('support.')) return;
    soon('inbox', () => void loadInbox());
    if (viewRef.current.kind === 'help') soon('help', () => void loadHelp());
  });

  // ---- Opening, showing, closing -----------------------------------------------------------------------------------

  const show = useCallback((next: ChatView) => {
    setView((current) => {
      if (next.kind === 'thread' && !(current.kind === 'thread' && current.threadId === next.threadId)) setThread({ status: 'idle' });
      return keyOf(current) === keyOf(next) ? current : next;
    });
  }, []);

  const openWith = useCallback(
    (next?: ChatView) => {
      if (next) show(next);
      setState('open');
      setFocusKey((key) => key + 1);
    },
    [show],
  );

  // A plain click on a link to a conversation or to Help, anywhere on the page, opens it here (wide screens).
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (onMessagesPageRef.current || !window.matchMedia(WIDE).matches) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.closest('[data-chat-window]') || anchor.hasAttribute('download') || anchor.getAttribute('target') === '_blank') return;
      const next = chatViewOfHref(anchor.getAttribute('href') ?? '', window.location.origin);
      if (!next) return;
      // The page's own handlers never see this click: some navigate after their work (a notification marks itself read,
      // then opens its page). Opening the conversation here reads it, and its "sent you a message" notifications too.
      // A menu's item still hears it, so the menu closes (the link itself stands down: the click is prevented).
      event.preventDefault();
      if (!anchor.closest('[role="menu"], [role="menubar"]')) event.stopPropagation();
      openWith(next);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [openWith]);

  const focusInWindow = () => Boolean(document.activeElement?.closest('[data-chat-window]'));
  const minimize = () => {
    const hadFocus = focusInWindow();
    setState('minimized');
    if (hadFocus) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-chat-window="minimized"] button')?.focus());
  };
  const close = () => {
    const hadFocus = focusInWindow();
    setState('closed');
    if (hadFocus) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-chat-launcher="window"]')?.focus());
  };

  // ---- Handlers -----------------------------------------------------------------------------------------------------

  const threadAgain = useCallback(() => {
    const current = viewRef.current;
    if (current.kind === 'thread') soon('thread', () => void loadThread(current.threadId));
  }, [loadThread, soon]);

  const threadHandlers = useMemo<ChatThreadHandlers>(
    () => ({
      onSend: actions.send,
      onUploadPhoto: actions.upload,
      onTyping: actions.typing,
      onReact: async (threadId, input) => {
        const result = await actions.react(threadId, input);
        if (result.ok) threadAgain();
        return result;
      },
      onSaveReply: async (input) => {
        const result = await actions.saveReply(input);
        if (result.ok) threadAgain();
        return result;
      },
      onDeleteReply: async (input) => {
        const result = await actions.deleteReply(input);
        if (result.ok) threadAgain();
        return result;
      },
      onReport: actions.report,
      onBlock: async (threadId, input) => {
        const result = await actions.block(threadId, input);
        if (result.ok) threadAgain();
        return result;
      },
    }),
    [actions, threadAgain],
  );

  const helpChat = useHelpChat(viewerId, actions.handOff);
  const helpCaseId = dataOf(help)?.case?.id;
  const lastCaseTyping = useRef(0);
  // Waiting in line for a live chat: the place in line moves as support joins others' chats; look again every 10 s.
  const waitingLive = active && view.kind === 'help' && dataOf(help)?.case?.live?.state === 'waiting';
  useEffect(() => {
    if (!waitingLive) return;
    const timer = setInterval(() => void loadHelp(), 10_000);
    return () => clearInterval(timer);
  }, [waitingLive, loadHelp]);
  const helpHandlers: HelpChatHandlers = {
    onAsk: (question) => void helpChat.ask(question),
    onRetry: helpChat.retry,
    onStartOver: helpChat.startOver,
    onHandOff: async (input) => {
      const result = await helpChat.handOff(input);
      if (result.ok) {
        await loadHelp();
        soon('inbox', () => void loadInbox());
      }
      return result;
    },
    onReply: async (input) => {
      if (!helpCaseId) return { ok: false, code: 'not_allowed' };
      const result = await actions.reply(helpCaseId, input);
      if (result.ok) void loadHelp();
      return result;
    },
    onRequestLive: async () => {
      if (!helpCaseId) return { ok: false, code: 'not_allowed' };
      const result = await actions.requestLive(helpCaseId);
      if (result.ok) void loadHelp();
      return result;
    },
    onTyping: () => {
      if (!helpCaseId || Date.now() - lastCaseTyping.current < 2500) return;
      lastCaseTyping.current = Date.now();
      void actions.typingInCase(helpCaseId).catch(() => undefined);
    },
  };

  const shown = state !== 'closed' && !onMessagesPage;
  return <>
    <ChatLauncher unread={unread} windowShown={wide && shown} hidden={onMessagesPage} hiddenOnPhones={layout === 'flow'} routeKey={routeKey} onOpen={() => openWith()} />
    {wide && shown && <ChatWindow
      state={state}
      view={view}
      unread={unread}
      inbox={inbox}
      thread={thread}
      help={help}
      transcript={helpChat.transcript}
      now={now}
      threadHandlers={threadHandlers}
      helpHandlers={helpHandlers}
      onShow={show}
      onMinimize={minimize}
      onRestore={() => openWith()}
      onClose={close}
      onRetry={() => {
        void loadInbox();
        reloadView();
      }}
      onRefreshThread={threadAgain}
      onLoadEarlier={async (from) => {
        const current = viewRef.current;
        if (current.kind === 'thread') await loadThread(current.threadId, from);
      }}
      fullPageHref={chatViewHref(view)}
      onFullPage={() => setState('closed')}
      focusKey={focusKey}
    />}
  </>;
}
