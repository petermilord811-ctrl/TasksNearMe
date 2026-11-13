'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActionResult, PushHandlers } from '@/contracts';

/**
 * This device's notifications (Web Push): whether the browser can, whether it's allowed, and whether this
 * device is subscribed. Turning on asks the browser (only ever after a tap), subscribes with the app's
 * key, and saves the subscription; turning off does the reverse. The service worker is /sw.js.
 */

export type PushDeviceState = 'checking' | 'not_set_up' | 'unsupported' | 'install_first' | 'blocked' | 'off' | 'on';

const SW_URL = '/sw.js';

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
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
    void currentState(publicKey)
      .catch((): PushDeviceState => 'unsupported')
      .then((next) => { if (live) setState(next); });
    return () => { live = false; };
  }, [publicKey]);

  const turnOn = useCallback(async (onSave: PushHandlers['onSavePushSubscription']): Promise<boolean> => {
    if (!publicKey || pending) return false;
    setPending(true);
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return false;
      }
      const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
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
