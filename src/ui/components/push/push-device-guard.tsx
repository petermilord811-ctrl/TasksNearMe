'use client';

import { useEffect } from 'react';
import type { ActionHandler } from '@/contracts';
import { checkThisPushDevice } from './use-push-device';

/**
 * In the signed-in shell, once a page load for each person: this browser's notifications belong to whoever is signed
 * in, or to nobody (sweep MN5). Someone else's (they never signed out here) stop coming, and the browser lets go of
 * the subscription, so the device's switch reads off until this person turns it on.
 */
export function PushDeviceGuard({ viewerId, onCheck }: { viewerId: string; onCheck: ActionHandler<{ endpoint: string }> }) {
  useEffect(() => {
    void checkThisPushDevice(viewerId, onCheck);
  }, [viewerId, onCheck]);
  return null;
}
