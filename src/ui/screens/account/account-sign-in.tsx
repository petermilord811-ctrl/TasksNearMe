'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleAlert, CircleCheck, Mail } from 'lucide-react';
import type { ActionHandler, ActionResult, AccountSignInMethods, SocialProvider, SocialSignInInput } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { ProviderLogo } from '@/ui/components/brand/provider-logo';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "Ways to sign in": the email code (always on), and Google and Microsoft, each connected or not. Connecting
 * leaves for the provider's page (a full page load) and comes back with `methods.notice`; disconnecting
 * stays here. While `held` (completion plan 5.23) nothing new can be connected; disconnecting still works.
 */
export function AccountSignIn({
  methods,
  held = false,
  onConnect,
  onDisconnect,
}: {
  methods: AccountSignInMethods;
  held?: boolean;
  onConnect: ActionHandler<SocialSignInInput>;
  onDisconnect: ActionHandler<SocialSignInInput>;
}) {
  const { formatDate } = useFormat();
  const t = useTranslations('account.signIn');
  const names = useTranslations('signIn.social.names');
  const router = useRouter();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [result, setResult] = useState<{ provider: SocialProvider; result: ActionResult }>();

  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  async function run(provider: SocialProvider, handler: ActionHandler<SocialSignInInput>, leaves: boolean) {
    if (busy) return;
    setBusy(provider);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await handler({ provider });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    if (leaves && next.ok && next.redirectTo) {
      window.location.assign(next.redirectTo);
      return;
    }
    setBusy(null);
    setResult({ provider, result: next });
    if (next.ok) router.refresh();
  }

  const notice = methods.notice;
  return (
    <div className="space-y-4">
      {notice && (
        <Alert role="status" className={notice.result === 'connected' ? 'border-success/30' : 'border-destructive/30'}>
          {notice.result === 'connected' ? <CircleCheck aria-hidden="true" className="text-success" /> : <CircleAlert aria-hidden="true" className="text-destructive" />}
          <AlertDescription className="text-foreground">{t(`notice.${notice.result}`, { provider: names(notice.provider) })}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-y divide-foreground/[0.07] rounded-2xl border border-foreground/[0.08] dark:divide-white/[0.06] dark:border-white/[0.07]">
        <li className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Mail className="size-4" /></span>
          <span className="min-w-0">
            <span className="block font-medium">{t('emailCode')}</span>
            <span className="block truncate text-sm text-muted-foreground">{methods.email}</span>
          </span>
          <Badge variant="secondary">{t('alwaysOn')}</Badge>
        </li>
        {methods.providers.map(({ provider, connectedAt }) => {
          const name = names(provider);
          return (
            <li key={provider} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl border border-foreground/[0.08] bg-card dark:border-white/[0.08]"><ProviderLogo provider={provider} className="size-4" /></span>
              <span className="min-w-0">
                <span className="block font-medium">{name}</span>
                <span className="block text-sm text-muted-foreground">{connectedAt ? t('connectedOn', { date: formatDate(connectedAt) }) : t('notConnected')}</span>
              </span>
              {(connectedAt || !held) && <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                aria-busy={busy === provider}
                aria-label={t(connectedAt ? 'disconnectLabel' : 'connectLabel', { provider: name })}
                onClick={() => (connectedAt ? run(provider, onDisconnect, false) : run(provider, onConnect, true))}
              >
                {busy === provider && <Spinner aria-hidden="true" />}
                {t(connectedAt ? 'disconnect' : 'connect')}
              </Button>}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">{t(held ? 'held' : 'hint')}</p>
      <FormFeedback result={result?.result} successMessage={result ? t('disconnected', { provider: names(result.provider) }) : undefined} />
    </div>
  );
}
