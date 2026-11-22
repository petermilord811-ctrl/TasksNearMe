'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ASSISTANT_CHAT_ID,
  ASSISTANT_HANDOFF_TURNS_MAX,
  ASSISTANT_HISTORY_MAX,
  type ActionResult,
  type AskAssistantResult,
  type AssistantTranscript,
  type AssistantTurn,
  type HandOffInput,
} from '@/contracts';

/**
 * The assistant's side of the Help conversation, kept by the browser for the tab (2026-11-22): the chat's id and its
 * signed turns in sessionStorage, so the chat window and the Help page share it, and a reload keeps it. Nothing about
 * it is stored on the server until "Talk to a person". Questions go to `POST /api/assistant/ask` (a route: an answer can
 * take a while, and Server Actions run one at a time).
 */

interface Stored {
  chatId: string;
  turns: AssistantTurn[];
}

const storageKey = (viewerId: string) => `tnm.help.${viewerId}`;
const CHANGED = 'tnm:help-chat';

function newChatId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ach_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function read(viewerId: string): Stored {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey(viewerId)) ?? 'null') as Partial<Stored> | null;
    if (stored && typeof stored.chatId === 'string' && ASSISTANT_CHAT_ID.test(stored.chatId) && Array.isArray(stored.turns)) {
      return { chatId: stored.chatId, turns: stored.turns.slice(-ASSISTANT_HANDOFF_TURNS_MAX) };
    }
  } catch {
    // Storage off or unreadable: a fresh chat.
  }
  return { chatId: newChatId(), turns: [] };
}

function write(viewerId: string, stored: Stored): void {
  try {
    sessionStorage.setItem(storageKey(viewerId), JSON.stringify(stored));
  } catch {
    // Storage full or off: the chat still works for this page.
  }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: viewerId }));
}

export function useHelpChat(viewerId: string, onHandOff: (input: HandOffInput) => Promise<ActionResult>) {
  const chat = useRef<Stored>({ chatId: '', turns: [] });
  const [transcript, setTranscript] = useState<AssistantTranscript>({ turns: [] });

  // From storage on mount, and whenever another part of the page (the window or the Help page) changed it.
  useEffect(() => {
    const load = () => {
      chat.current = read(viewerId);
      setTranscript((current) => (current.pending ? current : { turns: chat.current.turns }));
    };
    load();
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === viewerId) load();
    };
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [viewerId]);

  const ask = useCallback(
    async (question: string) => {
      if (!chat.current.chatId) chat.current = read(viewerId);
      const { chatId, turns } = chat.current;
      setTranscript({ turns, pending: question });
      let result: AskAssistantResult | null = null;
      try {
        const response = await fetch('/api/assistant/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ chatId, question, history: turns.slice(-ASSISTANT_HISTORY_MAX) }),
        });
        result = (await response.json()) as AskAssistantResult;
      } catch {
        result = null;
      }
      if (result?.ok) {
        const next = { chatId, turns: [...chat.current.turns, result.turn].slice(-ASSISTANT_HANDOFF_TURNS_MAX) };
        chat.current = next;
        write(viewerId, next);
        setTranscript({ turns: next.turns });
        return;
      }
      setTranscript({
        turns: chat.current.turns,
        error: { code: result && !result.ok ? result.code : 'unknown', question, ...(result && !result.ok && result.retryAt ? { retryAt: result.retryAt } : {}) },
      });
    },
    [viewerId],
  );

  const startOver = useCallback(() => {
    const next = { chatId: newChatId(), turns: [] };
    chat.current = next;
    write(viewerId, next);
    setTranscript({ turns: [] });
  }, [viewerId]);

  const retry = useCallback(() => {
    const question = transcript.error?.question;
    if (question) void ask(question);
  }, [ask, transcript.error?.question]);

  /** The chat goes to support with the request; once it's a case, the assistant starts a fresh chat. */
  const handOff = useCallback(
    async (input: Omit<HandOffInput, 'chatId' | 'turns'>): Promise<ActionResult> => {
      if (!chat.current.chatId) chat.current = read(viewerId);
      const { chatId, turns } = chat.current;
      const result = await onHandOff({ ...input, chatId, turns: turns.slice(-ASSISTANT_HANDOFF_TURNS_MAX) });
      if (result.ok) startOver();
      return result;
    },
    [onHandOff, startOver, viewerId],
  );

  return { transcript, ask, retry, startOver, handOff };
}
