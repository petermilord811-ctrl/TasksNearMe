'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { routes, type ActionResult } from '@/contracts';
import { safeNextPath } from '@/shared/next-path';

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
 * Whether the person's session is gone (bad connections pass, J-N2): one small request, asked only after an action failed
 * in a way a lost session explains (src/app/api/session). True only when the answer says so; a request that fails itself
 * proves nothing.
 */
export async function sessionGone(): Promise<boolean> {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && (body as { signedIn?: unknown }).signedIn === false;
  } catch {
    return false;
  }
}

/** Sign in again, then back to this page (the page's own address, through the sign-in page's same-site check). */
export function signInAgainHref(): string {
  return routes.signIn(safeNextPath(`${window.location.pathname}${window.location.search}`));
}

/**
 * The two failures a lost session causes: no answer at all ('unknown': the request met the sign-in redirect) and
 * 'not_allowed' (the cookie was still there, the session wasn't). Only these ask whether the session ended.
 */
export const mayBeSignedOut = (result: ActionResult) => !result.ok && (result.code === 'unknown' || result.code === 'not_allowed');

/**
 * An action that failed says why when it can (bad connections pass): "You're offline…" while the phone has no network
 * and got no answer (J-N3), or "You've been signed out…" with a link to sign in again and come back here when the session
 * ended (J-N2, asked once per failure). Otherwise the usual words. A client boundary, so FormFeedback can use it wherever
 * it's rendered.
 */
export function ActionFailureText({ result, text, offlineText, signedOutText, signInLabel }: { result: ActionResult; text: string; offlineText: string; signedOutText: string; signInLabel: string }) {
  const offline = useOffline();
  const unknown = !result.ok && result.code === 'unknown';
  const checkable = mayBeSignedOut(result);
  const [gone, setGone] = useState<{ result: ActionResult; href: string } | null>(null);
  useEffect(() => {
    if (!checkable || offline) return;
    let active = true;
    void sessionGone().then((out) => { if (active && out) setGone({ result, href: signInAgainHref() }); });
    return () => { active = false; };
  }, [result, checkable, offline]);
  if (unknown && offline) return <>{offlineText}</>;
  if (checkable && gone?.result === result) {
    return <>{signedOutText} <Link href={gone.href} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{signInLabel}</Link></>;
  }
  return <>{text}</>;
}

/** The offline half alone, for a line that has no result object to key the session check on. */
export function ConnectionAwareText({ text, offlineText, unknown }: { text: string; offlineText: string; unknown: boolean }) {
  const offline = useOffline();
  return <>{unknown && offline ? offlineText : text}</>;
}
