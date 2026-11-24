'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MESSAGE_REACTIONS } from '@/contracts';

/** The message the composer is replying to (completion plan 7.3): picked in the log, shown and sent by the composer. */
export interface ReplyTarget {
  id: string;
  name: string;
  text: string;
}

interface ReplyState {
  replyTo: ReplyTarget | null;
  setReplyTo: (target: ReplyTarget | null) => void;
}

const ReplyContext = createContext<ReplyState>({ replyTo: null, setReplyTo: () => {} });

export function ReplyProvider({ children }: { children: ReactNode }) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const value = useMemo(() => ({ replyTo, setReplyTo }), [replyTo]);
  return <ReplyContext.Provider value={value}>{children}</ReplyContext.Provider>;
}

export function useReply(): ReplyState {
  return useContext(ReplyContext);
}

/** How each reaction looks (`MESSAGE_REACTIONS`). */
export const REACTION_EMOJI = { thumbs_up: '👍', heart: '❤️', laugh: '😂', wow: '😮', sad: '😢', pray: '🙏', fire: '🔥', party: '🎉', clap: '👏', check: '✅' } as const satisfies Record<(typeof MESSAGE_REACTIONS)[number], string>;
