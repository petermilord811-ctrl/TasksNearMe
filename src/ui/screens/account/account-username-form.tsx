'use client';

import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { normalizeUsername, type AccountHandlers, type ActionResult, type ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

const ERRORS = new Set(['invalid', 'name_reserved', 'in_use', 'required', 'too_long']);

/**
 * The @username on the account page (2026-11-22): people find each other by it to start a direct chat, and it shows
 * beside the name. One change every 30 days; the rules under the box.
 */
export function AccountUsernameForm({ username, changeableAt, onSave }: { username?: string; changeableAt?: ISODateTime; onSave: NonNullable<AccountHandlers['onSaveUsername']> }) {
  const t = useTranslations('account.username');
  const { formatDate } = useFormat();
  const id = useId();
  const [value, setValue] = useState(username ?? '');
  const [saved, setSaved] = useState(username ?? '');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>();
  const locked = Boolean(changeableAt);
  const changed = normalizeUsername(value) !== saved;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || locked || !changed) return;
    setPending(true);
    let next: ActionResult;
    try {
      next = await onSave({ username: value });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    setPending(false);
    setResult(next);
    if (next.ok) {
      const clean = normalizeUsername(value);
      setSaved(clean);
      setValue(clean);
    }
  }

  const code = result && !result.ok ? result.fieldErrors?.username?.[0] : undefined;
  const error = result && !result.ok
    ? code && ERRORS.has(code) ? t(`errors.${code}`)
      : result.code === 'rate_limited' && result.retryAt ? t('errors.rate_limited', { date: formatDate(result.retryAt) })
        : t('errors.unknown')
    : undefined;
  return <form noValidate aria-label={t('title')} aria-busy={pending} onSubmit={submit} className="space-y-3">
    <div className="space-y-1.5">
      <label htmlFor={`${id}-username`} className="text-sm font-medium">{t('label')}</label>
      <div className="flex min-w-0 items-center rounded-xl border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
        <span aria-hidden="true" className="pl-3 text-base text-muted-foreground">@</span>
        <input id={`${id}-username`} name="username" value={value} onChange={(event) => setValue(event.target.value)} readOnly={pending} disabled={locked} maxLength={21} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(code)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} className="min-h-11 w-full min-w-0 bg-transparent px-1 py-2 text-base outline-none disabled:opacity-60" />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t('hint')}{changeableAt ? ` ${t('changeableAt', { date: formatDate(changeableAt) })}` : ''}</p>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
      {result?.ok && <p role="status" className="text-sm text-success">{t('saved', { username: saved })}</p>}
    </div>
    <Button type="submit" variant="outline" disabled={pending || locked || !changed} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{pending ? t('saving') : t('save')}</Button>
  </form>;
}
