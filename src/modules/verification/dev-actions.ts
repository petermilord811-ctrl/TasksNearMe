'use server';

import { redirect } from 'next/navigation';
import { routes, type IdentityFailureReason } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { recordBackgroundResult, recordIdentityResult, recordPayoutStatus } from './service';

/** Development only: the /dev/providers pages simulate each provider's hosted flow and webhook. */

function assertDev() {
  if (process.env.NODE_ENV === 'production') throw new Error('Not available in production.');
}

const FAILURES: IdentityFailureReason[] = ['document_unreadable', 'selfie_mismatch', 'under_18', 'other'];

export async function devIdentityOutcome(form: FormData): Promise<void> {
  assertDev();
  const session = String(form.get('session') ?? '');
  const outcome = String(form.get('outcome') ?? '');
  const result =
    outcome === 'verified'
      ? ({ status: 'verified' } as const)
      : outcome === 'processing'
        ? ({ status: 'processing' } as const)
        : ({ status: 'requires_input', reason: FAILURES.includes(outcome as IdentityFailureReason) ? (outcome as IdentityFailureReason) : 'other' } as const);
  await recordIdentityResult(db, session, result, new Date());
  redirect(routes.app.helperOnboarding('identity'));
}

export async function devPayoutOutcome(form: FormData): Promise<void> {
  assertDev();
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn());
  const outcome = String(form.get('outcome') ?? '');
  const status = outcome === 'active' || outcome === 'requirements_due' || outcome === 'restricted' ? outcome : 'pending';
  await recordPayoutStatus(db, viewer.user.id, status, new Date());
  redirect(routes.app.helperOnboarding('payout'));
}

export async function devBackgroundOutcome(form: FormData): Promise<void> {
  assertDev();
  const check = String(form.get('check') ?? '');
  const outcome = String(form.get('outcome') ?? '');
  const status = outcome === 'clear' || outcome === 'consider' ? outcome : 'pending';
  await recordBackgroundResult(db, check, status, new Date());
  redirect(routes.app.helperOnboarding('background'));
}
