'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Copy, KeyRound } from 'lucide-react';
import { routes } from '@/contracts';
import { Button } from '@/ui/primitives/button';

/**
 * /code: the page the sign-in email's "Copy code" button opens (email apps run no JavaScript, so the copying
 * happens here). The code and its expiry come in the fragment (`#c=482915&e=<unix seconds>`), which never
 * reaches a server; the page reads it once and wipes it from the address bar.
 */

export interface CopyCodeFragment {
  code: string;
  /** When the code stops working, in milliseconds. */
  expiresAt: number;
}

/** The code and expiry from `#c=…&e=…`, or null when it's missing or malformed. */
export function readCopyCodeFragment(hash: string): CopyCodeFragment | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get('c') ?? '';
  const expires = Number(params.get('e'));
  if (!/^\d{6}$/.test(code) || !Number.isInteger(expires) || expires <= 0) return null;
  return { code, expiresAt: expires * 1000 };
}

// Read when a fragment arrives, and kept once the address bar is wiped (the snapshot must stay the same object).
let captured: { hash: string; value: CopyCodeFragment | null } | undefined;
function capturedFragment(): CopyCodeFragment | null {
  const hash = window.location.hash;
  if (captured === undefined || (hash !== '' && hash !== captured.hash)) captured = { hash, value: readCopyCodeFragment(hash) };
  return captured.value;
}
const noSubscribe = () => () => {};
const TICK_MS = 15_000;
function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

export function CopyCodeScreen() {
  const t = useTranslations('signIn.copyCode');
  // undefined while prerendered (no fragment on the server), then the code or null in the browser.
  const fragment = useSyncExternalStore<CopyCodeFragment | null | undefined>(noSubscribe, capturedFragment, () => undefined);
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => 0);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const codeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  if (fragment === undefined) return <CopyCodeFrame title={t('title')}><div className="h-28" aria-busy="true" /></CopyCodeFrame>;

  if (fragment === null) {
    return <CopyCodeFrame title={t('missing')}>
      <p className="text-muted-foreground">{t('missingHint')}</p>
      <BackToSignIn label={t('back')} />
    </CopyCodeFrame>;
  }

  // `now` steps every 15 s, so round to the nearest minute (never below 1 while the code still works).
  const minutesLeft = Math.max(1, Math.round((fragment.expiresAt - now) / 60_000));
  if (now > 0 && fragment.expiresAt <= now) {
    return <CopyCodeFrame title={t('expired')}>
      <p className="text-muted-foreground">{t('expiredHint')}</p>
      <BackToSignIn label={t('back')} />
    </CopyCodeFrame>;
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopy('copied');
    } catch {
      setCopy('failed');
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  return <CopyCodeFrame title={t('title')}>
    <p className="text-muted-foreground">{t('intro')}</p>
    <div className="rounded-2xl border border-primary/15 bg-brand-soft px-4 py-5 text-center">
      <p ref={codeRef} aria-label={t('codeLabel', { code: fragment.code.split('').join(' ') })} className="select-all font-mono text-4xl font-bold tracking-[0.3em] text-foreground tabular-nums sm:text-5xl">{fragment.code}</p>
      {now > 0 && <p className="mt-2 text-sm font-medium text-muted-foreground">{t('expiresIn', { minutes: minutesLeft })}</p>}
    </div>
    <Button type="button" size="lg" className="w-full" onClick={() => void copyCode(fragment.code)}>
      {copy === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copy === 'copied' ? t('copied') : t('copy')}
    </Button>
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
      {copy === 'copied' ? t('copiedHint') : copy === 'failed' ? t('copyFailed') : ''}
    </p>
    <BackToSignIn label={t('back')} />
    <p className="border-t border-border pt-4 text-xs text-muted-foreground">{t('private')}</p>
  </CopyCodeFrame>;
}

function CopyCodeFrame({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mx-auto w-full max-w-reading py-4 md:py-8">
    <div className="mx-auto max-w-[420px] space-y-5 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <div aria-hidden="true" className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary"><KeyRound className="size-6" /></div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
      {children}
    </div>
  </div>;
}

function BackToSignIn({ label }: { label: string }) {
  return <Link href={routes.signIn()} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{label}</Link>;
}
