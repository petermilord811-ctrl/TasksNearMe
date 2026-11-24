'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { TRANSLATE_MANY_MAX, type AppLocale, type CatchUpInput, type ConversationSummary, type MessageTranslations, type QueryHandler, type TranslateManyInput } from '@/contracts';

/**
 * Help from the free models with a whole conversation (2026-11-24, owner: "implement others all one by one"):
 * - "Translate this conversation" (the ⋯ menu): the other person's messages in the reader's language as they come into
 *   view and as they arrive, a few at a time, each with "Show original". Remembered per person and conversation in this
 *   browser only; translations are kept for the visit (in memory), never stored.
 * - "Catch me up": a short summary of what the reader missed, as a card above "New messages" (offered at once when the
 *   server says many were unread), or after the latest messages when nothing was. Never stored.
 * The server decides what's offered (`ThreadPageData.assist`, `catchUp`); this only shows it. One provider per
 * conversation, around its header (the menu) and its messages (the log): on the page and in each chat window. What they
 * look like: `chat-assist-views.tsx` (apart, so the ⋯ menu's other pages don't carry the views' copy).
 */

/** One of the other person's messages under "Translate this conversation". `same`: shown as written (nothing to translate). */
export type AutoTranslation = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'same' } | { status: 'error' };

export type CatchUpState =
  | { status: 'idle' }
  | { status: 'offered'; unread: number }
  | { status: 'loading' }
  | { status: 'ready'; summary: ConversationSummary }
  | { status: 'failed' };

/** Preview and test seeds: the toggle's state, translations already in, and the card's state. */
export interface ChatAssistSeed {
  translating?: boolean;
  translations?: MessageTranslations;
  catchUp?: CatchUpState;
}

export interface ChatAssistValue {
  translateOffered: boolean;
  translating: boolean;
  setTranslating(on: boolean): void;
  translations: Record<string, AutoTranslation>;
  /** Messages shown as written after "Show original". */
  originals: ReadonlySet<string>;
  toggleOriginal(messageId: string): void;
  /** Messages in view: translated a few at a time (each once a visit). */
  want(messageIds: readonly string[]): void;
  /** A request failed (no model, the day's allowance used): nothing more is asked until "Try again". */
  paused: boolean;
  retry(): void;
  language: AppLocale;
  catchUpOffered: boolean;
  catchUp: CatchUpState;
  /** The message the card goes above ("New messages"); absent: after the latest messages. */
  catchUpFrom?: string;
  askCatchUp(): void;
  dismissCatchUp(): void;
}

const ChatAssistContext = createContext<ChatAssistValue | null>(null);

/** The conversation's helpers, or null outside a provider (a log on its own: previews, tests). */
export function useChatAssist(): ChatAssistValue | null {
  return useContext(ChatAssistContext);
}

// "Translate this conversation", per person and conversation: the other person's id names the pair (a conversation has
// two people, so (conversation, other person) is (conversation, viewer)). Browser storage can be missing or refuse.
const CHANGED = 'tnm:chat-translate';
const storageKey = (threadId: string, otherId: string) => `tnm.chat.translate.${threadId}.${otherId}`;
function stored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function store(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // The choice still holds on this page (state); it just isn't remembered.
  }
  window.dispatchEvent(new Event(CHANGED));
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGED, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGED, callback);
  };
}

/** Translations for this visit (in memory only), by language, conversation and message. */
const VISIT = new Map<string, Exclude<AutoTranslation, { status: 'loading' | 'error' }>>();
const visitKey = (language: AppLocale, threadId: string, messageId: string) => `${language}|${threadId}|${messageId}`;

export function ChatAssistProvider({ threadId, otherId, offered, language, firstUnreadId, catchUp, onTranslateMany, onCatchUp, initial, children }: {
  threadId: string;
  otherId: string;
  /** What the server offers (`ThreadPageData.assist`). */
  offered?: { translate: boolean; summarize?: boolean };
  /** The reader's language (`assist.language`); the page's without it. */
  language?: AppLocale;
  /** The first unread message when the conversation opened ("New messages"): the summary starts there. */
  firstUnreadId?: string;
  /** Many unread on opening (`ThreadPageData.catchUp`): the card is offered at once. */
  catchUp?: { unread: number };
  onTranslateMany?: QueryHandler<TranslateManyInput, MessageTranslations | null>;
  onCatchUp?: QueryHandler<CatchUpInput, ConversationSummary | null>;
  initial?: ChatAssistSeed;
  children: ReactNode;
}) {
  const pageLocale = useLocale();
  const reader: AppLocale = language ?? (pageLocale === 'es' ? 'es' : 'en');
  const translateOffered = Boolean(offered?.translate && onTranslateMany);
  const catchUpOffered = Boolean(offered?.summarize && onCatchUp);

  // The toggle: this browser's memory, or the choice made on this page when the browser can't keep it.
  const key = storageKey(threadId, otherId);
  const remembered = useSyncExternalStore(subscribe, () => stored(key), () => false);
  const [chosen, setChosen] = useState<boolean | null>(initial?.translating ?? null);
  const translating = translateOffered && (chosen ?? remembered);

  const [translations, setTranslations] = useState<Record<string, AutoTranslation>>(() => {
    const seeded: Record<string, AutoTranslation> = {};
    const prefix = `${reader}|${threadId}|`;
    for (const [entry, value] of VISIT) if (entry.startsWith(prefix)) seeded[entry.slice(prefix.length)] = value;
    for (const [id, text] of Object.entries(initial?.translations?.texts ?? {})) seeded[id] = { status: 'ready', text };
    for (const id of initial?.translations?.same ?? []) seeded[id] = { status: 'same' };
    return seeded;
  });
  const [originals, setOriginals] = useState<ReadonlySet<string>>(() => new Set());
  const [paused, setPaused] = useState(false);

  // Asked for (in flight or answered) and waiting, kept out of render; the handler as it is now.
  const asked = useRef(new Set<string>(Object.keys(translations)));
  const queue = useRef<string[]>([]);
  /** The next batch's turn: `flush` as it is now (it can't name itself). */
  const again = useRef<() => void>(() => undefined);
  const timer = useRef<number | null>(null);
  const handler = useRef(onTranslateMany);
  const live = useRef({ translating, paused });
  // Before the log's effects ask for what's in view (a parent's layout effects run before its children's effects).
  useLayoutEffect(() => {
    handler.current = onTranslateMany;
    live.current = { translating, paused };
  });
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const flush = useCallback(() => {
    timer.current = null;
    const ask = handler.current;
    if (!ask || !live.current.translating || live.current.paused) {
      for (const id of queue.current) asked.current.delete(id);
      queue.current = [];
      return;
    }
    const batch = queue.current.splice(0, TRANSLATE_MANY_MAX);
    if (batch.length === 0) return;
    setTranslations((all) => ({ ...all, ...Object.fromEntries(batch.map((id) => [id, { status: 'loading' } as const])) }));
    void ask({ messageIds: batch })
      .catch(() => null)
      .then((answer) => {
        if (!answer) {
          // Not now (no model, the day's allowance): these show as written, and nothing more is asked until "Try again".
          setPaused(true);
          setTranslations((all) => ({ ...all, ...Object.fromEntries(batch.map((id) => [id, { status: 'error' } as const])) }));
          for (const id of [...batch, ...queue.current]) asked.current.delete(id);
          queue.current = [];
          return;
        }
        const next: Record<string, AutoTranslation> = {};
        for (const id of batch) {
          const text = answer.texts[id];
          if (text) {
            next[id] = { status: 'ready', text };
            VISIT.set(visitKey(reader, threadId, id), next[id]);
          } else {
            // Already in the reader's language, or nothing came back for it: as written.
            next[id] = { status: 'same' };
            if (answer.same.includes(id)) VISIT.set(visitKey(reader, threadId, id), next[id]);
          }
        }
        setTranslations((all) => ({ ...all, ...next }));
        if (queue.current.length > 0 && timer.current === null) timer.current = window.setTimeout(() => again.current(), 0);
      });
  }, [reader, threadId]);
  useLayoutEffect(() => {
    again.current = flush;
  });

  const want = useCallback((messageIds: readonly string[]) => {
    if (!handler.current || live.current.paused) return;
    for (const id of messageIds) {
      if (asked.current.has(id)) continue;
      asked.current.add(id);
      queue.current.push(id);
    }
    // A moment to gather what came into view together: one request for them.
    if (queue.current.length > 0 && timer.current === null) timer.current = window.setTimeout(flush, 60);
  }, [flush]);

  const retry = useCallback(() => {
    setPaused(false);
    setTranslations((all) => Object.fromEntries(Object.entries(all).filter(([, value]) => value.status !== 'error')));
  }, []);

  const setTranslating = useCallback((on: boolean) => {
    setChosen(on);
    store(key, on);
    if (on) retry();
  }, [key, retry]);

  const toggleOriginal = useCallback((messageId: string) => {
    setOriginals((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  // "Catch me up": from where "New messages" was when it opened (kept, as the log keeps its line).
  const [catchUpFrom] = useState(firstUnreadId);
  const [summary, setSummary] = useState<CatchUpState>(() => initial?.catchUp ?? (catchUp && catchUpOffered ? { status: 'offered', unread: catchUp.unread } : { status: 'idle' }));
  const turn = useRef(0);
  const summarize = useRef(onCatchUp);
  useEffect(() => {
    summarize.current = onCatchUp;
  });
  const askCatchUp = useCallback(() => {
    const ask = summarize.current;
    if (!ask) return;
    const mine = ++turn.current;
    setSummary({ status: 'loading' });
    void ask(catchUpFrom ? { fromId: catchUpFrom } : {})
      .catch(() => null)
      .then((answer) => {
        if (mine === turn.current) setSummary(answer ? { status: 'ready', summary: answer } : { status: 'failed' });
      });
  }, [catchUpFrom]);
  const dismissCatchUp = useCallback(() => {
    turn.current += 1;
    setSummary({ status: 'idle' });
  }, []);

  const value = useMemo<ChatAssistValue>(() => ({
    translateOffered,
    translating,
    setTranslating,
    translations,
    originals,
    toggleOriginal,
    want,
    paused,
    retry,
    language: reader,
    catchUpOffered,
    catchUp: summary,
    ...(catchUpFrom ? { catchUpFrom } : {}),
    askCatchUp,
    dismissCatchUp,
  }), [translateOffered, translating, setTranslating, translations, originals, toggleOriginal, want, paused, retry, reader, catchUpOffered, summary, catchUpFrom, askCatchUp, dismissCatchUp]);
  return <ChatAssistContext.Provider value={value}>{children}</ChatAssistContext.Provider>;
}
