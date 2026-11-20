'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionResult } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { InviteCodeForm } from '../beta/invite-code-form';
import { StepHeading, type SignInStepProps } from './step-parts';
import { forgetPersonalDrafts } from '@/ui/lib/personal-drafts';

/**
 * The private beta's `invite_code` step: a new account's invite code before the name and age, or the
 * waitlist. "Use a different email" signs out of the new account.
 */
export function InviteCodeStep({ data, handlers, initialResult, onResult }: SignInStepProps) {
  const t = useTranslations('beta');
  const [leaving, setLeaving] = useState(false);
  const [leaveResult, setLeaveResult] = useState<ActionResult>();
  async function switchEmail() {
    if (leaving) return;
    setLeaving(true);
    setLeaveResult(undefined);
    try {
      const result = await handlers.onSignOut();
      if (!result.ok) setLeaveResult(result);
      else forgetPersonalDrafts();
    } catch {
      setLeaveResult({ ok: false, code: 'unknown' });
    } finally {
      setLeaving(false);
    }
  }
  return <div className="space-y-6">
    <StepHeading title={t('signUp.title')}><p>{t('signUp.description', { market: data.invite?.marketName ?? '' })}</p></StepHeading>
    <InviteCodeForm {...(data.invite?.code ? { code: data.invite.code } : {})} onRedeem={handlers.onRedeemInvite} submitLabel={t('signUp.submit')} {...(initialResult ? { initialResult } : {})} {...(onResult ? { onResult } : {})} />
    <div className="space-y-2">
      <Button type="button" variant="ghost" disabled={leaving} aria-busy={leaving} onClick={() => void switchEmail()} className="w-full">
        {leaving && <Spinner aria-hidden="true" />}{t('signUp.otherEmail')}
      </Button>
      <FormFeedback result={leaveResult} />
    </div>
  </div>;
}
