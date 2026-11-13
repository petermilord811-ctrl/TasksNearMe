'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import type { ActionResult, SignInHandlers } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const noSubscribe = () => () => {};

/**
 * "Sign in with a passkey" on the email step: the device's own prompt (Face ID, Touch ID, Windows Hello, a
 * security key), then the flow continues like after an email code. Only where the browser has passkeys.
 */
export function PasskeySignIn({ onPasskeyOptions, onPasskeySignIn, onResult }: {
  onPasskeyOptions: NonNullable<SignInHandlers['onPasskeyOptions']>;
  onPasskeySignIn: NonNullable<SignInHandlers['onPasskeySignIn']>;
  onResult?: (result: ActionResult) => void;
}) {
  const t = useTranslations('signIn.passkey');
  const router = useRouter();
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  if (!supported) return null;

  async function signIn() {
    if (pending) return;
    setPending(true);
    setMessage(undefined);
    try {
      const options = await onPasskeyOptions();
      if (!options.ok) {
        setMessage(t('failed'));
        return;
      }
      let response: Record<string, unknown>;
      try {
        response = (await startAuthentication({ optionsJSON: options.options as never })) as unknown as Record<string, unknown>;
      } catch {
        // Closed the prompt, or no passkey on this device for this site.
        setMessage(t('unknown'));
        return;
      }
      const result = await onPasskeySignIn({ response });
      onResult?.(result);
      if (!result.ok) {
        setMessage(t('failed'));
        return;
      }
      if (result.redirectTo) router.replace(result.redirectTo);
      else router.refresh();
    } catch {
      setMessage(t('failed'));
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-2">
    <Button type="button" variant="outline" className="w-full" disabled={pending} aria-busy={pending} onClick={() => void signIn()}>
      {pending ? <Spinner aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}{t(pending ? 'pending' : 'action')}
    </Button>
    <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{message}</p>
  </div>;
}
