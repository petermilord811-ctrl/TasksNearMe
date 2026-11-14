'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Live notices for the signed-in app (completion plan 7.1). One EventSource per tab to `/api/realtime`; each
 * notice is a type and ids. A screen that cares about a type subscribes with `useRealtime`, and returns `true`
 * when it handled the notice itself (typing indicators). Anything else that changes data the page shows (a new
 * message, something read, an update to a task or booking) refreshes the page once, shortly after the last
 * notice. A tab hidden for two minutes closes its stream; coming back reopens it and refreshes, so nothing
 * missed in between stays missing.
 *
 * Hydration (found 2026-11-14 with tasksnearme-d1): the provider sits above every signed-in page, so its context
 * value never changes after mount. A context change above a boundary that hasn't hydrated yet makes React
 * client-render that boundary, and the streamed server copy stayed on the page beside it (content shown twice).
 * The connection state lives in a small store instead (`useRealtimeConnected`), read only by the components that
 * need it once they've hydrated, and a refresh waits until the document has loaded.
 */
export interface RealtimeNotice {
  type: string;
  [key: string]: string | number | boolean | undefined;
}
type Handler = (notice: RealtimeNotice) => boolean | void;

interface ConnectedStore {
  get(): boolean;
  set(next: boolean): void;
  subscribe(listener: () => void): () => void;
}

interface RealtimeContextValue {
  subscribe(type: string, handler: Handler): () => void;
  connected: ConnectedStore;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** Notice types that only ever update what's on screen through a refresh. */
const REFRESH_TYPES = new Set(['message', 'read', 'update']);
const HIDDEN_CLOSE_MS = 120_000;
/** A refresh waits this long after the document's load, and after the address last changed (a navigation). */
const SETTLE_MS = 1500;

function createConnectedStore(): ConnectedStore {
  let value = false;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createContextValue(): RealtimeContextValue & { handlers: Map<string, Set<Handler>> } {
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    connected: createConnectedStore(),
    subscribe(type, handler) {
      const set = handlers.get(type) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(type, set);
      return () => {
        set.delete(handler);
        if (set.size === 0) handlers.delete(type);
      };
    },
  };
}

export function RealtimeProvider({ children, url = '/api/realtime' }: { children: ReactNode; url?: string }) {
  const router = useRouter();
  // Made once and never replaced: the context value stays the same object for the provider's whole life.
  const [value] = useState(createContextValue);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let source: EventSource | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let loadedAt = document.readyState === 'complete' ? Date.now() : Number.POSITIVE_INFINITY;
    let lastHref = window.location.href;
    let hrefChangedAt = Date.now();
    const onLoad = () => {
      loadedAt = Date.now();
    };
    if (loadedAt === Number.POSITIVE_INFINITY) window.addEventListener('load', onLoad, { once: true });

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      const run = () => {
        if (window.location.href !== lastHref) {
          lastHref = window.location.href;
          hrefChangedAt = Date.now();
        }
        // Not loaded yet, or the address just changed: try again once it has settled.
        const wait = Math.max(loadedAt, hrefChangedAt) + SETTLE_MS - Date.now();
        if (wait > 0) {
          refreshTimer = setTimeout(run, Number.isFinite(wait) ? wait : 500);
          return;
        }
        router.refresh();
      };
      refreshTimer = setTimeout(run, 250);
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
      value.handlers.get(notice.type)?.forEach((handler) => {
        if (handler(notice) === true) handled = true;
      });
      if (!handled && REFRESH_TYPES.has(notice.type)) scheduleRefresh();
    };
    const open = () => {
      if (source) return;
      source = new EventSource(url);
      source.addEventListener('ready', () => {
        failures = 0;
        value.connected.set(true);
      });
      source.onmessage = onMessage;
      source.onerror = () => {
        value.connected.set(false);
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
      value.connected.set(false);
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
      window.removeEventListener('load', onLoad);
      for (const timer of [hiddenTimer, refreshTimer, retryTimer]) if (timer) clearTimeout(timer);
      close();
    };
  }, [router, url, value]);

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

const NO_STORE: ConnectedStore = { get: () => false, set: () => {}, subscribe: () => () => {} };

/** Whether the live connection is up (screens slow their own refreshing while it is). False on the server. */
export function useRealtimeConnected(): boolean {
  const store = useContext(RealtimeContext)?.connected ?? NO_STORE;
  return useSyncExternalStore(store.subscribe, store.get, () => false);
}
