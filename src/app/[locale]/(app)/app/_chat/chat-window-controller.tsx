'use client';

import dynamic from 'next/dynamic';
import { useSelectedLayoutSegments } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TeamActionInput,
  ThankYouHandlers,
  FollowerHandlers,
  AttachGifInput,
  GifSearchInput,
  GifSearchResult,
  ActionResult,
  AskForOfferInput,
  CatchUpInput,
  BookingChatActionInput,
  ChatInboxData,
  ChatLoad,
  ChatThreadData,
  ChatThreadHandlers,
  ChatView,
  ChatWindowState,
  ConversationFlagInput,
  ConversationListHandlers,
  ConversationSearchData,
  ConversationSummary,
  DirectChatStart,
  DirectChatTarget,
  HandOffInput,
  HelpChatData,
  HelpChatHandlers,
  MessageReaction,
  MessageSavedReplyInput,
  MessageTranslation,
  MessageTranslations,
  NewChatHandlers,
  PhotoUploadResult,
  RateSupportInput,
  ReplySuggestions,
  ReportInput,
  SendMessageInput,
  ShareTimesInput,
  StartDirectChatInput,
  SupportReplyInput,
  TranslateManyInput,
} from '@/contracts';
import { chatViewHref, chatViewOfHref, directChatTargetKey } from '@/shared/chat-links';
import { OPEN_IN_CHAT_EVENT, type OpenInChatDetail } from '@/ui/lib/chat-window-open';
import { openAfterMenu } from '@/ui/lib/menus';
import { ChatLauncher } from '@/ui/components/messaging/chat-launcher';
import { useRealtime, useRealtimeConnected, type RealtimeNotice } from '@/ui/lib/realtime';
import { useAppShellLayout } from '@/ui/shells/app-shell-layout';
import { directChatStartRequest, searchPeopleRequest } from './new-chat-requests';
import { useHelpChat } from './use-help-chat';

/** The window's code loads the first time it opens: every signed-in page carries only the button. */
const ChatWindow = dynamic(() => import('@/ui/components/messaging/chat-window').then((module) => module.ChatWindow), { ssr: false, loading: () => null });
/** Conversations docked beside it (2026-11-23), from the same code. */
const DockedChats = dynamic(() => import('@/ui/components/messaging/chat-window').then((module) => module.DockedChats), { ssr: false, loading: () => null });

/** A conversation docked beside the chat window (the window's `DockedChat`). */
type Docked = { threadId: string; minimized: boolean };
/**
 * At most six docked conversations (2026-11-23, owner: "unable to open more than 2 beside chats"): as many open windows as
 * fit, the rest as heads (chat-window.tsx's `DockedChats`). Each window is this wide with this gap (`DOCKED_WIDTH`).
 */
const DOCKED_MAX = 6;
const DOCKED_SPACE = 360 + 12;

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
  /** New message's first message (2026-11-23): starts the conversation, without refreshing the page behind. */
  startChat(input: StartDirectChatInput): Promise<ActionResult>;
  // Live support, after the chat (2026-11-23): rating the help on a case, and a copy of its conversation by email.
  rateCase(caseId: string, input: RateSupportInput): Promise<ActionResult>;
  emailTranscript(caseId: string): Promise<ActionResult>;
  /** Pin, mute or archive a conversation, accept a message request, search a conversation (2026-11-23). */
  flag(threadId: string, input: ConversationFlagInput): Promise<ActionResult>;
  accept(threadId: string): Promise<ActionResult>;
  searchThread(threadId: string, query: string): Promise<ConversationSearchData | null>;
  /** Translate a message, suggest replies (2026-11-23). */
  translate(threadId: string, messageId: string): Promise<MessageTranslation | null>;
  suggest(threadId: string): Promise<ReplySuggestions | null>;
  /** The whole conversation translated, a few messages at a time, and "Catch me up" (2026-11-24). */
  translateMany(threadId: string, input: TranslateManyInput): Promise<MessageTranslations | null>;
  catchUp(threadId: string, input: CatchUpInput): Promise<ConversationSummary | null>;
  /** Ask the helper of a direct conversation for an offer on one of your open tasks (2026-11-23). */
  askForOffer(threadId: string, input: AskForOfferInput): Promise<ActionResult>;
  /** A booking's day-of chip, and Share times (2026-11-24). */
  bookingAction(threadId: string, input: BookingChatActionInput): Promise<ActionResult>;
  shareTimes(threadId: string, input: ShareTimesInput): Promise<ActionResult>;
  /** A task request card's buttons: the invites' own actions (2026-11-23). */
  acceptInvite(input: { inviteId: string }): Promise<ActionResult>;
  declineInvite(input: { inviteId: string }): Promise<ActionResult>;
  cancelInvite(input: { inviteId: string }): Promise<ActionResult>;
  /** GIFs (2026-11-24): absent when they're off. */
  searchGifs?: (input: GifSearchInput) => Promise<GifSearchResult>;
  attachGif?: (input: AttachGifInput) => Promise<PhotoUploadResult>;
  /** A booking's thank-you note (2026-11-24), bound to the window (no page refresh). */
  thanks: ThankYouHandlers;
  /** A booking's family followers (2026-11-24), bound to the window. */
  followers?: FollowerHandlers;
  /** A team invite's answers (2026-11-24), bound to the window (no page refresh). */
  team?: (input: TeamActionInput) => Promise<ActionResult>;
}

const WIDE = '(min-width: 1024px)';
const POLL_MS = 15_000;
const storageKey = (viewerId: string) => `tnm.chat.${viewerId}`;

function useMatches(media: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(media);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [media]);
  return matches;
}

const useWide = () => useMatches(WIDE);
/** Room for a conversation docked beside the chat window (2026-11-23). */
const BESIDE = '(min-width: 1280px)';

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

const keyOf = (view: ChatView) => (view.kind === 'thread' ? `thread:${view.threadId}` : view.kind === 'new' && view.to ? `new:${directChatTargetKey(view.to)}` : view.kind);

/** A New message target read back from storage: one string field, as links name people. */
function storedTarget(value: unknown): DirectChatTarget | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const to = value as Partial<Record<'userId' | 'helper' | 'username', unknown>>;
  const ok = (field: unknown): field is string => typeof field === 'string' && field.length > 0 && field.length <= 80;
  if (ok(to.helper)) return { helper: to.helper };
  if (ok(to.userId)) return { userId: to.userId };
  if (ok(to.username)) return { username: to.username };
  return undefined;
}
const dataOf = <T,>(load: ChatLoad<T>): T | undefined => (load.status === 'idle' ? undefined : load.data);

/** Docked conversations read back from storage: ids as conversations have them, at most `DOCKED_MAX`. */
function storedDocked(value: unknown): Docked[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const chat = item as Partial<Record<'threadId' | 'minimized', unknown>> | null;
    return chat && typeof chat.threadId === 'string' && chat.threadId.length > 0 && chat.threadId.length <= 80 ? [{ threadId: chat.threadId, minimized: chat.minimized === true }] : [];
  }).slice(0, DOCKED_MAX);
}

function restored(viewerId: string): { state: ChatWindowState; view: ChatView; docked: Docked[] } | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey(viewerId)) ?? 'null') as { state?: unknown; view?: unknown; docked?: unknown } | null;
    if (!stored || (stored.state !== 'open' && stored.state !== 'minimized' && stored.state !== 'closed')) return null;
    const view = stored.view as Partial<{ kind: string; threadId: string; to: unknown }> | undefined;
    const to = view?.kind === 'new' ? storedTarget(view.to) : undefined;
    const next: ChatView = view?.kind === 'help'
      ? { kind: 'help' }
      : view?.kind === 'thread' && typeof view.threadId === 'string' && view.threadId.length <= 80
        ? { kind: 'thread', threadId: view.threadId }
        : view?.kind === 'new'
          ? to ? { kind: 'new', to } : { kind: 'new' }
          : { kind: 'list' };
    return { state: stored.state, view: next, docked: storedDocked(stored.docked) };
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
  const roomBeside = useMatches(BESIDE);
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
  const [start, setStart] = useState<ChatLoad<DirectChatStart>>({ status: 'idle' });
  const [focusKey, setFocusKey] = useState(0);
  // A search's result in the open conversation (2026-11-23): shown from that message, scrolled to it.
  const [focusMessage, setFocusMessage] = useState<string | undefined>(undefined);
  // Conversations docked beside the window (2026-11-23), each with what it loaded.
  const [docked, setDocked] = useState<Docked[]>(initial?.docked ?? []);
  const [dockedLoads, setDockedLoads] = useState<Record<string, ChatLoad<ChatThreadData>>>({});
  // The docked conversations showing as open windows (the rest are heads), as `DockedChats` measured them; null until it
  // has. Only these load as opened, which reads them; heads only peek (sweep 2026-11-24 C1).
  const [shownDocked, setShownDocked] = useState<string[] | null>(null);
  const [now, setNow] = useState(() => new Date().toISOString());

  const active = wide && visible && state === 'open' && !onMessagesPage;
  // Docked conversations show whatever the window does (open, minimized or closed), on wide screens away from Messages.
  const dockActive = wide && visible && !onMessagesPage && docked.length > 0;
  // Away from the dock (a narrow screen, a hidden tab, Messages), what showed is measured again when it's back.
  const [dockWasActive, setDockWasActive] = useState(dockActive);
  if (dockActive !== dockWasActive) {
    setDockWasActive(dockActive);
    if (!dockActive) setShownDocked(null);
  }
  const activeRef = useRef(active);
  const dockActiveRef = useRef(dockActive);
  const dockedRef = useRef(docked);
  const shownDockedRef = useRef<readonly string[]>([]);
  const viewRef = useRef(view);
  const onMessagesPageRef = useRef(onMessagesPage);
  useEffect(() => {
    activeRef.current = active;
    dockActiveRef.current = dockActive;
    dockedRef.current = docked;
    shownDockedRef.current = shownDocked ?? [];
    viewRef.current = view;
    onMessagesPageRef.current = onMessagesPage;
  });
  const onDockedShown = useCallback((threadIds: string[]) => setShownDocked((current) => (current && current.join(',') === threadIds.join(',') ? current : threadIds)), []);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(viewerId), JSON.stringify({ state, view, docked }));
    } catch {
      // Storage off: the window just doesn't come back after a reload.
    }
  }, [state, view, docked, viewerId]);

  // Messages' own pages are the chat: the window closes there (adjusted while rendering, React's pattern for state that
  // follows a change of route).
  const [onMessagesBefore, setOnMessagesBefore] = useState(onMessagesPage);
  if (onMessagesPage !== onMessagesBefore) {
    setOnMessagesBefore(onMessagesPage);
    if (onMessagesPage && state !== 'closed') setState('closed');
  }

  // ---- Loading -----------------------------------------------------------------------------------------------------

  const counters = useRef({ inbox: 0, thread: 0, help: 0, start: 0 });
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

  // A docked conversation (2026-11-23): its own load, from an earlier message on after "Load earlier messages". One that
  // waits as a head isn't on screen: it peeks (its name, photo and unread count; nothing reads as read, sweep C1).
  const dockTurns = useRef<Record<string, number>>({});
  const dockEarlier = useRef<Record<string, string>>({});
  const loadDocked = useCallback(async (threadId: string, from?: string) => {
    const turn = (dockTurns.current[threadId] = (dockTurns.current[threadId] ?? 0) + 1);
    if (from) dockEarlier.current[threadId] = from;
    const since = from ?? dockEarlier.current[threadId];
    const query = new URLSearchParams();
    if (since) query.set('from', since);
    if (!shownDockedRef.current.includes(threadId)) query.set('peek', '1');
    try {
      const response = await fetch(`/api/messages/threads/${encodeURIComponent(threadId)}${query.size ? `?${query}` : ''}`, { cache: 'no-store', credentials: 'same-origin' });
      if (turn !== dockTurns.current[threadId]) return;
      if (response.status === 404) {
        setDockedLoads((loads) => ({ ...loads, [threadId]: { status: 'error', notFound: true } }));
        return;
      }
      if (!response.ok) throw new Error(`docked ${response.status}`);
      const data = (await response.json()) as ChatThreadData;
      if (turn !== dockTurns.current[threadId]) return;
      setDockedLoads((loads) => ({ ...loads, [threadId]: { status: 'ready', data } }));
      setNow(new Date().toISOString());
    } catch {
      if (turn === dockTurns.current[threadId]) setDockedLoads((loads) => ({ ...loads, [threadId]: { status: 'error', data: dataOf(loads[threadId] ?? { status: 'idle' }) } }));
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

  // New message's chosen person (2026-11-23): their first message's form, or straight to the conversation the two have.
  const loadStart = useCallback(async (to: DirectChatTarget) => {
    const turn = ++counters.current.start;
    try {
      const data = await directChatStartRequest(to);
      if (turn !== counters.current.start) return;
      if (!data) {
        setStart({ status: 'error', notFound: true });
        return;
      }
      if (data.kind === 'thread') {
        setStart({ status: 'idle' });
        setThread({ status: 'idle' });
        setView({ kind: 'thread', threadId: data.threadId });
        return;
      }
      setStart({ status: 'ready', data });
    } catch {
      if (turn === counters.current.start) setStart((current) => ({ status: 'error', data: dataOf(current) }));
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
    // New message: the chosen person's form once (typing a message isn't interrupted by the page's notices).
    if (current.kind === 'new' && current.to) void loadStart(current.to);
  }, [loadHelp, loadStart, loadThread]);

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

  // Docked conversations: each once as it docks (and when the tab comes back), once `DockedChats` has measured which show
  // as windows; after that, a head that becomes a window loads again, as opened (sweep C1). Their logs ask again on their
  // own while the live connection is down, as the window's does.
  const dockedKey = docked.map((chat) => chat.threadId).join(',');
  const shownKey = shownDocked ? shownDocked.join(',') : null;
  const dockLoaded = useRef<{ key: string; shown: readonly string[] } | null>(null);
  useEffect(() => {
    if (!dockActive || shownKey === null) {
      dockLoaded.current = null;
      return;
    }
    const timer = setTimeout(() => {
      const shown = shownKey ? shownKey.split(',') : [];
      const before = dockLoaded.current;
      dockLoaded.current = { key: dockedKey, shown };
      for (const chat of dockedRef.current) {
        if (!before || before.key !== dockedKey || (shown.includes(chat.threadId) && !before.shown.includes(chat.threadId))) void loadDocked(chat.threadId);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [dockActive, dockedKey, shownKey, loadDocked]);

  // The live connection is down: ask again every 15 s (the conversation's own log does the same for its messages).
  useEffect(() => {
    if (!active || live) return;
    const timer = setInterval(() => {
      void loadInbox();
      if (viewRef.current.kind === 'help') void loadHelp();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, live, loadHelp, loadInbox]);

  // Live notices: the window reads again; the page behind refreshes as usual (nothing here says it handled them). The
  // reader's own "read" (`mine`) for a conversation on screen is this window's own doing, or another device's: reading it
  // again would only throw away the first answer, with its "New messages" and "Catch me up" (sweep C11).
  const onThreadNotice = (notice: RealtimeNotice) => {
    const ownRead = notice.type === 'read' && notice.mine === true;
    if (dockActiveRef.current) {
      for (const chat of dockedRef.current) {
        if (notice.thread !== chat.threadId || (ownRead && shownDockedRef.current.includes(chat.threadId))) continue;
        soon(`dock:${chat.threadId}`, () => void loadDocked(chat.threadId));
      }
    }
    if (!activeRef.current) return;
    soon('inbox', () => void loadInbox());
    const current = viewRef.current;
    if (current.kind === 'thread' && notice.thread === current.threadId && !ownRead) soon('thread', () => void loadThread(current.threadId));
  };
  useRealtime('message', onThreadNotice);
  useRealtime('read', onThreadNotice);
  useRealtime('update', (notice) => {
    if (!(activeRef.current || dockActiveRef.current) || typeof notice.event !== 'string') return;
    // A reaction (sweep C8): the conversation it's in shows it at once, open in the window or docked beside it.
    if (notice.event === 'message.reacted') {
      const threadId = notice.thread;
      if (typeof threadId !== 'string') return;
      const current = viewRef.current;
      if (activeRef.current && current.kind === 'thread' && current.threadId === threadId) soon('thread', () => void loadThread(threadId));
      if (dockActiveRef.current && dockedRef.current.some((chat) => chat.threadId === threadId)) soon(`dock:${threadId}`, () => void loadDocked(threadId));
      return;
    }
    // A task request, a booking change or a team (2026-11-24) moved on: the open conversation's card shows it now.
    if (notice.event.startsWith('invite.') || notice.event.startsWith('change.') || notice.event.startsWith('team.')) {
      const current = viewRef.current;
      if (activeRef.current && current.kind === 'thread') soon('thread', () => void loadThread(current.threadId));
      if (dockActiveRef.current) for (const chat of dockedRef.current) soon(`dock:${chat.threadId}`, () => void loadDocked(chat.threadId));
      return;
    }
    if (!notice.event.startsWith('support.') || !activeRef.current) return;
    soon('inbox', () => void loadInbox());
    if (viewRef.current.kind === 'help') soon('help', () => void loadHelp());
  });

  // ---- Opening, showing, closing -----------------------------------------------------------------------------------

  const show = useCallback((next: ChatView) => {
    setFocusMessage(undefined);
    setView((current) => {
      if (next.kind === 'thread' && !(current.kind === 'thread' && current.threadId === next.threadId)) setThread({ status: 'idle' });
      if (next.kind === 'new' && keyOf(current) !== keyOf(next)) setStart({ status: 'idle' });
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
      if (!anchor || anchor.closest('[data-chat-window], [data-route-dialog]') || anchor.hasAttribute('download') || anchor.getAttribute('target') === '_blank') return;
      const next = chatViewOfHref(anchor.getAttribute('href') ?? '', window.location.origin);
      if (!next) return;
      // The page's own handlers never see this click: some navigate after their work (a notification marks itself read,
      // then opens its page). Opening the conversation here reads it, and its "sent you a message" notifications too.
      // A menu it was in closes first: Radix skips its own select on a prevented click, so the menu would stay open.
      event.preventDefault();
      event.stopPropagation();
      openAfterMenu(anchor, () => openWith(next));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [openWith]);

  // A Message button's answer (a booking's, an offer's): the conversation here, not its page (2026-11-23).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const href = (event as CustomEvent<OpenInChatDetail>).detail?.href;
      if (typeof href !== 'string' || onMessagesPageRef.current || !window.matchMedia(WIDE).matches) return;
      const next = chatViewOfHref(href, window.location.origin);
      if (!next) return;
      event.preventDefault();
      openWith(next);
    };
    window.addEventListener(OPEN_IN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_IN_CHAT_EVENT, onOpen);
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

  const threadAgain = useCallback((threadId?: string) => {
    const current = viewRef.current;
    if (current.kind === 'thread' && (!threadId || threadId === current.threadId)) soon('thread', () => void loadThread(current.threadId));
    // The same conversation docked beside the window reads again too (2026-11-23).
    for (const chat of dockedRef.current) if (!threadId || chat.threadId === threadId) soon(`dock:${chat.threadId}`, () => void loadDocked(chat.threadId));
  }, [loadThread, loadDocked, soon]);

  // The open conversation reads again after a thank-you note's button worked.

  const afterThanks = useCallback((result: ActionResult) => {

    if (result.ok) threadAgain();

    return result;

  }, [threadAgain]);

  const threadHandlers = useMemo<ChatThreadHandlers>(
    () => ({
      onSend: actions.send,
      onUploadPhoto: actions.upload,
      onTyping: actions.typing,
      onReact: async (threadId, input) => {
        const result = await actions.react(threadId, input);
        if (result.ok) threadAgain(threadId);
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
        if (result.ok) threadAgain(threadId);
        return result;
      },
      // The list and the conversation read again: pinned, muted, archived or accepted show at once (2026-11-23).
      onFlag: async (threadId, input) => {
        const result = await actions.flag(threadId, input);
        if (result.ok) {
          threadAgain(threadId);
          soon('inbox', () => void loadInbox());
        }
        return result;
      },
      onAccept: async (threadId) => {
        const result = await actions.accept(threadId);
        if (result.ok) {
          threadAgain(threadId);
          soon('inbox', () => void loadInbox());
        }
        return result;
      },
      onSearch: actions.searchThread,
      onTranslate: actions.translate,
      onSuggest: actions.suggest,
      onTranslateMany: actions.translateMany,
      onCatchUp: actions.catchUp,
      requestCards: { onAccept: actions.acceptInvite, onDecline: actions.declineInvite, onCancel: actions.cancelInvite },
      onAskForOffer: async (threadId, input) => {
        const result = await actions.askForOffer(threadId, input);
        if (result.ok) threadAgain(threadId);
        return result;
      },
      ...(actions.searchGifs && actions.attachGif ? { onSearchGifs: actions.searchGifs, onAttachGif: actions.attachGif } : {}),
      // The status line or the card shows at once (2026-11-24).
      onBookingAction: async (threadId, input) => {
        const result = await actions.bookingAction(threadId, input);
        if (result.ok) threadAgain(threadId);
        return result;
      },
      onShareTimes: async (threadId, input) => {
        const result = await actions.shareTimes(threadId, input);
        if (result.ok) threadAgain(threadId);
        return result;
      },
      // A thank-you note's buttons (2026-11-24): the conversation reads again after each.
      thanks: {
        onSave: async (input) => afterThanks(await actions.thanks.onSave(input)),
        onDelete: async (input) => afterThanks(await actions.thanks.onDelete(input)),
        onShowOnProfile: async (input) => afterThanks(await actions.thanks.onShowOnProfile(input)),
        onHideName: async (input) => afterThanks(await actions.thanks.onHideName(input)),
      },
      // "Add a family member" and Remove (2026-11-24): the conversation reads again after each.
      ...(actions.followers ? { followers: { onAdd: async (input) => afterThanks(await actions.followers!.onAdd(input)), onRemove: async (input) => afterThanks(await actions.followers!.onRemove(input)) } } : {}),
      // A team invite's buttons (2026-11-24): the conversation reads again after each (the confirm dialog opens itself).
      ...(actions.team ? { teams: { onAction: async (input: TeamActionInput) => afterThanks(await actions.team!(input)) } } : {}),
    }),
    [actions, threadAgain, soon, loadInbox, afterThanks],
  );

  // The rows' menus in the window's list (2026-11-23).
  const listHandlers = useMemo<ConversationListHandlers>(
    () => ({
      onFlag: (threadId, input) => threadHandlers.onFlag(threadId, input),
      onAccept: (threadId) => threadHandlers.onAccept(threadId),
    }),
    [threadHandlers],
  );

  // A search's result: the conversation from that message on (the same view; "Load earlier messages" keeps it).
  const jump = (messageId: string) => {
    const current = viewRef.current;
    if (current.kind !== 'thread') return;
    setFocusMessage(messageId);
    void loadThread(current.threadId, messageId);
  };

  const newChatHandlers = useMemo<Pick<NewChatHandlers, 'onSearch' | 'onStart'>>(() => ({ onSearch: searchPeopleRequest, onStart: actions.startChat }), [actions]);
  // The first message went: its conversation, here; the list reads again (it's on top now).
  const started = (redirectTo: string) => {
    const next = chatViewOfHref(redirectTo, window.location.origin);
    if (next?.kind === 'thread') show(next);
    soon('inbox', () => void loadInbox());
  };

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
    // After the chat (2026-11-23): the rating stays as given (the conversation reads again), and the email just goes.
    onRate: async (caseId, input) => {
      const result = await actions.rateCase(caseId, input);
      if (result.ok) void loadHelp();
      return result;
    },
    onEmailTranscript: actions.emailTranscript,
  };

  // ---- Side by side (2026-11-23) ---------------------------------------------------------------------------------------

  /** As many docked windows as fit to the left of the chat window (at most `DOCKED_MAX`). */
  const dockRoom = () => {
    const main = document.querySelector<HTMLElement>('[data-chat-window]');
    // The layout's width: the window's opening zoom makes a bounding box 5% narrow.
    const mainWidth = main ? main.offsetWidth : 64;
    return Math.max(0, Math.min(DOCKED_MAX, Math.floor((window.innerWidth - 48 - mainWidth) / DOCKED_SPACE)));
  };
  const openBeside = (threadId: string) => {
    // No room for even one window beside it: it opens in the window itself.
    if (dockRoom() === 0) {
      openWith({ kind: 'thread', threadId });
      return;
    }
    // The newest first: it's a window, and older ones that no longer fit wait as heads; past six, the oldest goes.
    setDocked((current) => [{ threadId, minimized: false }, ...current.filter((chat) => chat.threadId !== threadId)].slice(0, DOCKED_MAX));
    // The window goes back to the list: the conversation is beside it now.
    const current = viewRef.current;
    if (current.kind === 'thread' && current.threadId === threadId) show({ kind: 'list' });
  };
  const dockedChange = (threadId: string, change: Partial<Docked> | null) =>
    setDocked((current) => (change ? current.map((chat) => (chat.threadId === threadId ? { ...chat, ...change } : chat)) : current.filter((chat) => chat.threadId !== threadId)));
  const showInWindow = (threadId: string) => {
    dockedChange(threadId, null);
    openWith({ kind: 'thread', threadId });
  };

  const shown = state !== 'closed' && !onMessagesPage;
  return <>
    <ChatLauncher unread={unread} windowShown={wide && shown} hidden={onMessagesPage} routeKey={routeKey} onOpen={() => openWith()} />
    {wide && shown && <ChatWindow
      state={state}
      view={view}
      unread={unread}
      inbox={inbox}
      thread={thread}
      help={help}
      start={start}
      transcript={helpChat.transcript}
      now={now}
      threadHandlers={threadHandlers}
      helpHandlers={helpHandlers}
      newChatHandlers={newChatHandlers}
      listHandlers={listHandlers}
      focusId={focusMessage}
      onJump={jump}
      {...(roomBeside ? { onOpenBeside: openBeside } : {})}
      onShow={show}
      onStarted={started}
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
    {wide && !onMessagesPage && docked.length > 0 && <DockedChats
      docked={docked}
      mainKey={shown ? state : 'closed'}
      loads={dockedLoads}
      now={now}
      handlers={threadHandlers}
      onMinimize={(threadId) => dockedChange(threadId, { minimized: true })}
      // A head comes back as the newest window (an older one may step back to a head to make room).
      onRestore={(threadId) => setDocked((current) => [{ threadId, minimized: false }, ...current.filter((chat) => chat.threadId !== threadId)])}
      onClose={(threadId) => dockedChange(threadId, null)}
      onRefresh={(threadId) => void loadDocked(threadId)}
      onLoadEarlier={(threadId, from) => loadDocked(threadId, from)}
      onShowInWindow={showInWindow}
      onShown={onDockedShown}
    />}
  </>;
}
