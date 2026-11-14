'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Live notices for the signed-in app (completion plan 7.1). One EventSource per tab to `/api/realtime`; each
 * notice is a type and ids. A screen that cares about a type subscribes with `useRealtime`, and returns `true`
 * when it handled the notice itself (typing indicators). Anything else that changes data the page shows (a new
 * message, something read, an update to a task or booking) refreshes the page once, a quarter second after the
 * last notice. A tab hidden for two minutes closes its stream; coming back reopens it and refreshes, so nothing
 * missed in between stays missing.
 */
export interface RealtimeNotice {
  type: string;
  [key: string]: string | number | boolean | undefined;
}
type Handler = (notice: RealtimeNotice) => boolean | void;

interface RealtimeContextValue {
  subscribe(type: string, handler: Handler): () => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** Notice types that only ever update what's on screen through a refresh. */
const REFRESH_TYPES = new Set(['message', 'read', 'update']);
const HIDDEN_CLOSE_MS = 120_000;

export function RealtimeProvider({ children, url = '/api/realtime' }: { children: ReactNode; url?: string }) {
  const router = useRouter();
  const handlers = useRef(new Map<string, Set<Handler>>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 250);
    };
    const onMessage = (event: MessageEvent<string>) => {
      let notice: RealtimeNotice;
      try {
        notice = JSON.parse(event.data) as RealtimeNotice;
      } catch {
        return;
      }
      if (!notice || typeof notice.type !== 'string') return;
      let handled = false;
      handlers.current.get(notice.type)?.forEach((handler) => {
        if (handler(notice) === true) handled = true;
      });
      if (!handled && REFRESH_TYPES.has(notice.type)) scheduleRefresh();
    };
    const open = () => {
      if (source) return;
      source = new EventSource(url);
      source.addEventListener('ready', () => {
        failures = 0;
        setConnected(true);
      });
      source.onmessage = onMessage;
      source.onerror = () => {
        setConnected(false);
        // The browser retries on its own after a dropped connection; a refused one (signed out, too many tabs)
        // closes it, and then this tries again later, more slowly each time.
        if (source && source.readyState === EventSource.CLOSED) {
          source = null;
          failures += 1;
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(open, Math.min(60_000, 5_000 * 2 ** Math.min(failures, 4)));
        }
      };
    };
    const close = () => {
      source?.close();
      source = null;
      setConnected(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenTimer = setTimeout(close, HIDDEN_CLOSE_MS);
        return;
      }
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (!source) {
        open();
        scheduleRefresh();
      }
    };
    open();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      for (const timer of [hiddenTimer, refreshTimer, retryTimer]) if (timer) clearTimeout(timer);
      close();
    };
  }, [router, url]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connected,
      subscribe(type, handler) {
        const set = handlers.current.get(type) ?? new Set<Handler>();
        set.add(handler);
        handlers.current.set(type, set);
        return () => {
          set.delete(handler);
          if (set.size === 0) handlers.current.delete(type);
        };
      },
    }),
    [connected],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Calls `handler` for each notice of `type` (outside a provider, in previews and tests, it never fires). */
export function useRealtime(type: string, handler: Handler): void {
  const context = useContext(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!context) return;
    return context.subscribe(type, (notice) => latest.current(notice));
  }, [context, type]);
}

/** Whether the live connection is up (screens slow their own refreshing while it is). */
export function useRealtimeConnected(): boolean {
  return useContext(RealtimeContext)?.connected ?? false;
}
