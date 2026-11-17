'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import type { AccountHandlers, AccountSignInMethods, ActionResult } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Spinner } from '@/ui/primitives/spinner';

const noSubscribe = () => () => {};

/**
 * Passkeys on the account: each with its name and when it was added, a way to remove it, and "Add a passkey"
 * (the device's prompt, then a name). The email code keeps working whatever happens here. While `held`
 * (completion plan 5.23) none can be added; removing still works.
 */
export function AccountPasskeys({ passkeys, held = false, handlers }: {
  passkeys: AccountSignInMethods['passkeys'];
  held?: boolean;
  handlers: Required<Pick<AccountHandlers, 'onPasskeyRegistrationOptions' | 'onAddPasskey' | 'onRemovePasskey'>>;
}) {
  const { formatDate } = useFormat();
  const t = useTranslations('account.passkeys');
  const id = useId();
  const router = useRouter();
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult>();
  const [note, setNote] = useState<string>();

  async function add() {
    if (busy) return;
    setBusy('add');
    setResult(undefined);
    setNote(undefined);
    try {
      const options = await handlers.onPasskeyRegistrationOptions();
      if (!options.ok) {
        setResult(options);
        return;
      }
      let response: Record<string, unknown>;
      try {
        response = (await startRegistration({ optionsJSON: options.options as never })) as unknown as Record<string, unknown>;
      } catch {
        setNote(t('cancelled'));
        return;
      }
      const next = await handlers.onAddPasskey({ response, name: name.trim() || t('defaultName') });
      setResult(next);
      if (next.ok) {
        setName('');
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(passkeyId: string) {
    if (busy) return;
    setBusy(passkeyId);
    setResult(undefined);
    setNote(undefined);
    try {
      const next = await handlers.onRemovePasskey({ id: passkeyId });
      setResult(next);
      if (next.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return <section aria-labelledby={`${id}-title`} className="space-y-4 border-t border-foreground/[0.07] pt-5 dark:border-white/[0.06]">
    <div className="space-y-1">
      <h3 id={`${id}-title`} className="flex items-center gap-2 font-semibold"><Fingerprint aria-hidden="true" className="size-5 text-muted-foreground" />{t('title')}</h3>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
    {passkeys.length === 0 ? <p className="text-sm">{t('none')}</p> : <ul className="space-y-2">
      {passkeys.map((key) => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/[0.07] p-3 dark:border-white/[0.06]">
        <span className="min-w-0 space-y-0.5">
          <span className="block font-medium break-words">{key.name || t('defaultName')}</span>
          <span className="block text-sm text-muted-foreground">{[key.createdAt ? t('addedOn', { date: formatDate(key.createdAt) }) : null, key.backedUp ? t('synced') : null].filter(Boolean).join(' · ')}</span>
        </span>
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} aria-busy={busy === key.id} aria-label={t('removeLabel', { name: key.name || t('defaultName') })} onClick={() => void remove(key.id)}>
          {busy === key.id && <Spinner aria-hidden="true" />}{t('remove')}
        </Button>
      </li>)}
    </ul>}
    {held ? <p className="text-sm text-muted-foreground">{t('held')}</p> : supported ? <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">{t('nameLabel')}</label>
        <Input id={`${id}-name`} value={name} maxLength={60} placeholder={t('defaultName')} aria-describedby={`${id}-name-hint`} onChange={(event) => setName(event.target.value)} disabled={busy !== null} />
        <p id={`${id}-name-hint`} className="text-sm text-muted-foreground">{t('nameHint')}</p>
      </div>
      <Button type="button" disabled={busy !== null} aria-busy={busy === 'add'} onClick={() => void add()}>
        {busy === 'add' ? <Spinner aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}{t(busy === 'add' ? 'adding' : 'add')}
      </Button>
    </div> : <p className="text-sm text-muted-foreground">{t('unsupported')}</p>}
    <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">{note}</p>
    <FormFeedback result={result} {...(result?.ok ? { successMessage: t(result.code === 'saved' ? 'added' : 'removed') } : {})} />
  </section>;
}
