'use client';

import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PushHandlers, PushSetup } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { usePushDevice, type PushDeviceState } from './use-push-device';

const DISMISSED_KEY = 'tnm.push-prompt.dismissed';

function readDismissed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

const stateCopy: Record<PushDeviceState, string> = {
  checking: 'checking',
  not_set_up: 'notSetUp',
  unsupported: 'unsupported',
  install_first: 'installFirst',
  blocked: 'blocked',
  off: 'off',
  on: 'on',
};

/** The account page's "Notifications on this device": what this browser can do, and the switch. */
export function PushDeviceSetting({ push, handlers }: { push?: PushSetup; handlers: PushHandlers }) {
  const t = useTranslations('push.device');
  const device = usePushDevice(push?.publicKey);
  const on = device.state === 'on';
  const Icon = on ? BellRing : device.state === 'off' ? Bell : BellOff;
  // While this device is checked, the button's place is kept, hidden: nearly every browser can, and the answer would
  // otherwise add it just after the page hydrates, moving everything below under a press (as the passkeys did to
  // "Download my data", 179150c).
  const holding = device.state === 'checking';
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{t('description')}</p>
    <p aria-live="polite" className="flex items-start gap-2 text-sm"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(stateCopy[device.state])}</p>
    {(device.state === 'off' || on || holding) && <Button
      type="button"
      variant="outline"
      disabled={holding || device.pending}
      aria-hidden={holding || undefined}
      aria-busy={device.pending}
      className={cn('h-auto min-h-11 w-full whitespace-normal sm:w-auto', holding && 'invisible')}
      onClick={() => { void (on ? device.turnOff(handlers.onRemovePushSubscription) : device.turnOn(handlers.onSavePushSubscription)); }}
    >
      {device.pending && <Spinner aria-hidden="true" />}
      {t(device.pending ? (on ? 'turningOff' : 'turningOn') : on ? 'turnOff' : 'turnOn')}
    </Button>}
    {device.failed && <p role="alert" className="text-sm text-destructive">{t('failed')}</p>}
  </div>;
}

/**
 * Asked after something that makes notifications useful (a task posted, helper setup finished), and only
 * where the browser can and hasn't been asked: "Not now" hides it on this device for good.
 */
export function PushPrompt({ push, onSave, kind }: { push?: PushSetup; onSave?: PushHandlers['onSavePushSubscription']; kind: 'offers' | 'tasks' }) {
  const t = useTranslations('push.prompt');
  const device = usePushDevice(push?.publicKey);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [done, setDone] = useState(false);
  if (!push || !onSave) return null;
  if (done) return <p role="status" className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm shadow-card"><BellRing aria-hidden="true" className="size-4 shrink-0 text-primary" />{t('done')}</p>;
  if (dismissed || device.state !== 'off' || (typeof Notification !== 'undefined' && Notification.permission !== 'default')) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private windows: it simply asks again next time.
    }
  };
  return <aside aria-labelledby={`push-prompt-${kind}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Bell aria-hidden="true" className="size-5" /></span>
      <div className="min-w-0">
        <h2 id={`push-prompt-${kind}`} className="font-semibold">{t(kind === 'offers' ? 'offersTitle' : 'tasksTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t(kind === 'offers' ? 'offersBody' : 'tasksBody')}</p>
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button type="button" size="sm" disabled={device.pending} aria-busy={device.pending} onClick={async () => { if (await device.turnOn(onSave)) setDone(true); }}>
        {device.pending && <Spinner aria-hidden="true" />}{t('turnOn')}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={device.pending} onClick={dismiss}>{t('notNow')}</Button>
    </div>
  </aside>;
}
