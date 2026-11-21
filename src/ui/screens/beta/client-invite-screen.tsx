'use client';

import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import type { ActionResult, ClientInviteHandlers, ClientInvitePageData } from '@/contracts';
import { PageHeader } from '@/ui/components';
import { InviteCodeForm } from './invite-code-form';

/**
 * Booking help while the market is opening soon (prelaunch: helpers join now, the first clients come in by
 * invitation, J-V8): a client invite code opens the post form or the request; without one, the waitlist. Shown
 * instead of them.
 */
export function ClientInviteScreen({ data, handlers, initialResult }: { data: ClientInvitePageData; handlers: ClientInviteHandlers; initialResult?: ActionResult }) {
  const t = useTranslations('beta');
  return <div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0">
    <PageHeader title={t('client.title', { market: data.marketName })} description={t('client.description', { market: data.marketName })} />
    <section aria-labelledby="client-invite-title" className="space-y-5 rounded-xl border bg-card p-card shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><CalendarClock className="size-5" /></span>
        <div className="space-y-1">
          <h2 id="client-invite-title" className="text-xl font-semibold">{t('client.heading')}</h2>
          <p className="text-muted-foreground">{t('client.body')}</p>
        </div>
      </div>
      <InviteCodeForm {...(data.code ? { code: data.code } : {})} onRedeem={handlers.onRedeem} submitLabel={t('client.submit')} {...(initialResult ? { initialResult } : {})} />
    </section>
  </div>;
}
