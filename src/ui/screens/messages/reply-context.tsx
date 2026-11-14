'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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

export const REACTION_EMOJI = { thumbs_up: '👍', heart: '❤️', laugh: '😂', check: '✅' } as const;
