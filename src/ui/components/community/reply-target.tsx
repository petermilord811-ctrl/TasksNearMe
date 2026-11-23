'use client';

import { createContext, use, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface ReplyTarget {
  id: string;
  authorName: string;
}

interface ReplyTargetState {
  target: ReplyTarget | null;
  /** Answer this reply (its Reply button), or nobody in particular (`null`). */
  setTarget: (target: ReplyTarget | null) => void;
  /**
   * This thread's reply form. A post can show twice at once (its dialog over another post's page, 2026-11-23; or a
   * screen the router keeps hidden), so Reply moves to its own thread's form, never the first one by id.
   */
  form: RefObject<HTMLFormElement | null>;
}

const ReplyTargetContext = createContext<ReplyTargetState>({ target: null, setTarget: () => undefined, form: { current: null } });

/** Ties a thread's Reply buttons to its reply form (plan 10.10): "Replying to Maya R.". */
export function ReplyTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ReplyTarget | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const value = useMemo(() => ({ target, setTarget, form }), [target]);
  return <ReplyTargetContext value={value}>{children}</ReplyTargetContext>;
}

export function useReplyTarget(): ReplyTargetState {
  return use(ReplyTargetContext);
}

/** Reply's move to the thread's form: into view, and its words take the focus. */
export function useFocusReplyForm(): () => void {
  const { form } = useReplyTarget();
  // Read when pressed, never while rendering.
  return () => {
    const element = form.current ?? document.getElementById(REPLY_FORM_ID);
    element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    element?.querySelector('textarea')?.focus({ preventScroll: true });
  };
}

/** The thread's reply form, for Reply buttons to move to. */
export const REPLY_FORM_ID = 'community-reply-form';
