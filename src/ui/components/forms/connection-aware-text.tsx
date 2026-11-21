'use client';

import { useSyncExternalStore } from 'react';

function subscribe(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

/** True while the browser says there's no network at all (navigator.onLine); false on the server and before hydration. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);
}

/**
 * An action that failed without an answer ('unknown') says why when the phone has no network: "You're offline…" in
 * place of "We couldn't complete that action…", which only says to try again (bad connections pass, J-N3). A client
 * boundary, so FormFeedback can use it wherever it's rendered.
 */
export function ConnectionAwareText({ text, offlineText, unknown }: { text: string; offlineText: string; unknown: boolean }) {
  const offline = useOffline();
  return <>{unknown && offline ? offlineText : text}</>;
}
