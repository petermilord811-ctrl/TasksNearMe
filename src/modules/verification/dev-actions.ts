'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { routes, type IdentityFailureReason } from '@/contracts';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';
import { isLocalRequest } from '@/shared/local-request';
import { recordBackgroundResult, recordIdentityResult, recordPayoutStatus, type BackgroundResult, type IdentityResult } from './tracks';

/** Development only: the /dev/providers pages simulate each provider's hosted flow and webhook. */

/** Development only, and only on this machine: never through a public proxy in front of a dev server. */
async function assertDev() {
  if (process.env.NODE_ENV === 'production') throw new Error('Not available in production.');
  const requestHeaders = await headers();
  if (!isLocalRequest((name) => requestHeaders.get(name))) throw new Error('Only available on this machine.');
}

const FAILURES: IdentityFailureReason[] = ['document_unreadable', 'selfie_mismatch', 'under_18', 'other'];

function identityResult(outcome: string): IdentityResult {
  if (outcome === 'verified') return { status: 'verified' };
  // The ID shows a different name than the account (a nickname, a married name): staff check it.
  if (outcome === 'verified_name_differs') return { status: 'verified', verifiedName: { firstName: 'Different', lastName: 'Person' } };
  if (outcome === 'processing') return { status: 'processing' };
  if (outcome === 'canceled') return { status: 'canceled' };
  return { status: 'requires_input', reason: FAILURES.includes(outcome as IdentityFailureReason) ? (outcome as IdentityFailureReason) : 'other' };
}

export async function devIdentityOutcome(form: FormData): Promise<void> {
  await assertDev();
  const session = String(form.get('session') ?? '');
  await recordIdentityResult(db, session, identityResult(String(form.get('outcome') ?? '')), await requestNow());
  const next = String(form.get('next') ?? '');
  redirect(next.startsWith('/app/') && !next.includes('//') ? next : routes.app.helperOnboarding('identity'));
}

export async function devPayoutOutcome(form: FormData): Promise<void> {
  await assertDev();
  const viewer = await getViewer();
  if (viewer.kind !== 'user') redirect(routes.signIn());
  const outcome = String(form.get('outcome') ?? '');
  const status = outcome === 'active' || outcome === 'requirements_due' || outcome === 'restricted' ? outcome : 'pending';
  await recordPayoutStatus(db, viewer.user.id, status, await requestNow());
  redirect(routes.app.helperOnboarding('payout'));
}

const BACKGROUND_OUTCOMES: BackgroundResult[] = ['pending', 'clear', 'consider', 'suspended', 'canceled'];

export async function devBackgroundOutcome(form: FormData): Promise<void> {
  await assertDev();
  const check = String(form.get('check') ?? '');
  const outcome = String(form.get('outcome') ?? '');
  const status = BACKGROUND_OUTCOMES.includes(outcome as BackgroundResult) ? (outcome as BackgroundResult) : 'pending';
  await recordBackgroundResult(db, check, status, await requestNow());
  redirect(routes.app.helperOnboarding('background'));
}
