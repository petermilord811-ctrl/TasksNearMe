'use client';

import { createContext, use, useMemo, useState, type ReactNode } from 'react';

export interface ReplyTarget {
  id: string;
  authorName: string;
}

interface ReplyTargetState {
  target: ReplyTarget | null;
  /** Answer this reply (its Reply button), or nobody in particular (`null`). */
  setTarget: (target: ReplyTarget | null) => void;
}

const ReplyTargetContext = createContext<ReplyTargetState>({ target: null, setTarget: () => undefined });

/** Ties a thread's Reply buttons to its reply form (plan 10.10): "Replying to Maya R.". */
export function ReplyTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return <ReplyTargetContext value={value}>{children}</ReplyTargetContext>;
}

export function useReplyTarget(): ReplyTargetState {
  return use(ReplyTargetContext);
}

/** The thread's reply form, for Reply buttons to move to. */
export const REPLY_FORM_ID = 'community-reply-form';
