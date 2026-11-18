'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import type { ActionResult, SignInHandlers } from '@/contracts';
import { Spinner } from '@/ui/primitives/spinner';
import { SignInOptionButton } from './social-sign-in';

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
  // Rendered from the server on: nearly every browser has passkeys, so the form below never jumps when the page
  // hydrates (audit M5). The rare browser without them drops the row once it's known.
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => true);
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

  // The same button as Google's and Microsoft's above it (social-sign-in.tsx).
  return <div className="space-y-2">
    <SignInOptionButton disabled={pending} aria-busy={pending} onClick={() => void signIn()} icon={pending ? <Spinner className="size-4" /> : <Fingerprint className="size-5" />}>
      {t(pending ? 'pending' : 'action')}
    </SignInOptionButton>
    <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{message}</p>
  </div>;
}
