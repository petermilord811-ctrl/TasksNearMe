'use client';

import { useTranslations } from 'next-intl';
import { Ticket } from 'lucide-react';
import type { HelperInviteHandlers, HelperInvitePageData } from '@/contracts';
import { PageHeader } from '@/ui/components';
import { InviteCodeForm } from './invite-code-form';

/**
 * Helper setup while it's invite-only in the market (private beta): a helper invite code opens setup; without
 * one, the waitlist. Shown instead of the first setup step.
 */
export function HelperInviteScreen({ data, handlers }: { data: HelperInvitePageData; handlers: HelperInviteHandlers }) {
  const t = useTranslations('beta');
  const onboarding = useTranslations('helperOnboarding');
  return <div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0">
    <PageHeader title={onboarding('screen.title')} description={t('helper.description', { market: data.marketName })} />
    <section aria-labelledby="helper-invite-title" className="space-y-5 rounded-xl border bg-card p-card shadow-card">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"><Ticket className="size-5" /></span>
        <div className="space-y-1">
          <h2 id="helper-invite-title" className="text-xl font-semibold">{t('helper.title')}</h2>
          <p className="text-muted-foreground">{t('helper.body')}</p>
        </div>
      </div>
      <InviteCodeForm {...(data.code ? { code: data.code } : {})} onRedeem={handlers.onRedeem} submitLabel={t('helper.submit')} />
    </section>
  </div>;
}
