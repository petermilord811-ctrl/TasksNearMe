'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActionHandler, ActionResult, PushHandlers } from '@/contracts';

/**
 * This device's notifications (Web Push): whether the browser can, whether it's allowed, and whether this
 * device is subscribed. Turning on asks the browser (only ever after a tap), subscribes with the app's
 * key, and saves the subscription; turning off does the reverse. The service worker is /sw.js.
 */

export type PushDeviceState = 'checking' | 'not_set_up' | 'unsupported' | 'install_first' | 'blocked' | 'off' | 'on';

const SW_URL = '/sw.js';

/** The shell's check or a sign-out changed this browser's subscription: the device's switch reads it again (sweep MN5). */
export const PUSH_DEVICE_EVENT = 'tnm:push-device';
const changed = () => window.dispatchEvent(new Event(PUSH_DEVICE_EVENT));

async function thisSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** This page load's check, for each person (someone else signing in gets their own). */
const checks = new Map<string, Promise<void>>();

/**
 * Whose this browser's push subscription is (sweep MN5): the app answers ok when it's the signed-in person's; otherwise
 * (another account's, which no longer gets them here, or nobody's) the browser lets go of it.
 */
export function checkThisPushDevice(viewerId: string, onCheck: ActionHandler<{ endpoint: string }>): Promise<void> {
  let check = checks.get(viewerId);
  if (!check) {
    check = (async () => {
      const subscription = await thisSubscription();
      if (!subscription) return;
      const result = await onCheck({ endpoint: subscription.endpoint });
      if (result.ok || result.code !== 'not_found') return;
      await subscription.unsubscribe();
      changed();
    })().catch(() => undefined);
    checks.set(viewerId, check);
  }
  return check;
}

/**
 * Signing out (sweep MN5): this browser's subscription comes off the account while it's still signed in, then the
 * browser lets go of it, so the next person here starts with notifications off. It never stands in the way of signing
 * out, and gives up after 3 seconds.
 */
export async function forgetThisPushDevice(onForget?: ActionHandler<{ endpoint: string }>): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const forget = (async () => {
    const subscription = await thisSubscription();
    if (!subscription) return;
    await onForget?.({ endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
    checks.clear();
    changed();
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([forget, new Promise((resolve) => { timer = setTimeout(resolve, 3_000); })]);
  clearTimeout(timer);
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === wanted.length && bytes.every((byte, index) => byte === wanted[index]);
}

/** iPhone and iPad Safari only allow push for Home Screen apps. */
function needsInstall(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function currentState(publicKey: string | undefined): Promise<PushDeviceState> {
  if (!publicKey) return 'not_set_up';
  if (typeof window === 'undefined') return 'checking';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return needsInstall() ? 'install_first' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

export function usePushDevice(publicKey: string | undefined) {
  const [state, setState] = useState<PushDeviceState>('checking');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const read = () => {
      void currentState(publicKey)
        .catch((): PushDeviceState => 'unsupported')
        .then((next) => { if (live) setState(next); });
    };
    read();
    window.addEventListener(PUSH_DEVICE_EVENT, read);
    return () => {
      live = false;
      window.removeEventListener(PUSH_DEVICE_EVENT, read);
    };
  }, [publicKey]);

  const turnOn = useCallback(async (onSave: PushHandlers['onSavePushSubscription']): Promise<boolean> => {
    if (!publicKey || pending) return false;
    setPending(true);
    setFailed(false);
    try {
      // The shell's check first, so it never lets go of the subscription this is about to save.
      await Promise.all(checks.values());
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return false;
      }
      const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      await navigator.serviceWorker.ready;
      const key = keyBytes(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      // Made with an older key (the site's key pair changed): pushes signed with the new one would be refused.
      if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
        await subscription.unsubscribe().catch(() => false);
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const json = subscription.toJSON();
      const result: ActionResult = await onSave({ endpoint: json.endpoint ?? subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } });
      if (!result.ok) {
        await subscription.unsubscribe().catch(() => false);
        setFailed(true);
        setState('off');
        return false;
      }
      setState('on');
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }, [pending, publicKey]);

  const turnOff = useCallback(async (onRemove: PushHandlers['onRemovePushSubscription']): Promise<boolean> => {
    if (pending) return false;
    setPending(true);
    setFailed(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await onRemove({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState('off');
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }, [pending]);

  return { state, pending, failed, turnOn, turnOff };
}
