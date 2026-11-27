'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Check, ChevronRight, CircleDollarSign, Clock, House, ShieldCheck, Smartphone, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type ActionResult, type BadgeTone, type HelperOnboardingHandlers, type HelperOnboardingPageData, type OnboardingStep, type VerificationSummary } from '@/contracts';
import { WelcomeGiftStrip } from '@/ui/components/rewards/welcome-gift-card';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * Verifications (owner, 2026-11-27: "Verification process is working step by step, not able to pick preferred
 * verification. change it." and "make … verification page simple as LinkedIn"): every check on one list, each with
 * where it stands and one action, picked in any order. The ID, home address and phone open in a dialog over this page;
 * payouts and the background check go to their providers. The app decides each state; this only shows it.
 */

export type HubCheck = 'identity' | 'address' | 'phone' | 'payout' | 'background';

type Handlers = Pick<HelperOnboardingHandlers, 'onStartPayout' | 'onStartBackgroundCheck'>;

/** What a row says and does. `action`: a dialog link, a provider start, or nothing (done, waiting). */
interface RowView {
  check: HubCheck;
  status: { tone: BadgeTone; key: string } | null;
  action: { kind: 'dialog' | 'payout' | 'background' | 'profile'; label: string } | null;
  done: boolean;
}

const ICONS: Record<HubCheck, typeof ShieldCheck> = { identity: ShieldCheck, address: House, phone: Smartphone, payout: CircleDollarSign, background: BadgeCheck };

/** The order the list shows: the checks that open helping and the badge first, payouts and the background check after. */
const ORDER: readonly HubCheck[] = ['identity', 'address', 'phone', 'payout', 'background'];

function stateOf(data: HelperOnboardingPageData, step: OnboardingStep) {
  return data.progress.steps.find((entry) => entry.step === step)?.state;
}

/** Where each check stands, in the person's words (status chip) and what they can do next. */
export function hubRows(data: HelperOnboardingPageData): RowView[] {
  const v: VerificationSummary = data.verification;
  const rows: RowView[] = [];
  for (const check of ORDER) {
    const state = stateOf(data, check);
    if (state === undefined) continue; // not offered here (the phone where texts don't work)
    const done = state === 'done';
    let status: RowView['status'] = null;
    let action: RowView['action'] = null;
    switch (check) {
      case 'identity': {
        const capture = v.identity.capture;
        if (done) status = { tone: 'success', key: 'verified' };
        else if (v.identity.blocked === 'try_later') status = { tone: 'warning', key: 'tryLater' };
        else if (v.identity.blocked) status = { tone: 'warning', key: 'paused' };
        else if (v.identity.nameCheck || capture?.stage === 'in_review' || state === 'in_review') status = { tone: 'info', key: 'inReview' };
        else if (capture?.stage === 'approved') status = { tone: 'info', key: 'oneMoreStep' };
        else if (capture?.rejectionReason || v.identity.requested) status = { tone: 'warning', key: 'actionNeeded' };
        action = { kind: 'dialog', label: done || status?.key === 'inReview' || status?.key === 'paused' || status?.key === 'oneMoreStep' ? 'view' : status?.key === 'actionNeeded' ? 'tryAgain' : 'verify' };
        break;
      }
      case 'address': {
        const a = v.address;
        if (a.update?.status === 'in_review' || a.status === 'in_review') status = { tone: 'info', key: 'inReview' };
        else if (done) status = { tone: 'success', key: 'verified' };
        else if (a.status === 'rejected' || a.status === 'requested' || a.update?.status === 'rejected') status = { tone: 'warning', key: 'actionNeeded' };
        action = { kind: 'dialog', label: done || status?.key === 'inReview' ? 'view' : status?.key === 'actionNeeded' ? 'tryAgain' : 'verify' };
        break;
      }
      case 'phone':
        if (done) status = { tone: 'success', key: 'verified' };
        action = { kind: 'dialog', label: done ? 'view' : 'verify' };
        break;
      case 'payout': {
        const payout = v.payout.status;
        if (payout === 'active') status = { tone: 'success', key: 'ready' };
        else if (payout === 'pending') status = { tone: 'info', key: 'inProgress' };
        else if (payout === 'requirements_due') status = { tone: 'warning', key: 'actionNeeded' };
        else if (payout === 'restricted') status = { tone: 'danger', key: 'restricted' };
        action = payout === 'active' || payout === 'restricted' ? null : { kind: 'payout', label: payout === 'not_started' ? 'setUp' : 'continue' };
        break;
      }
      case 'background': {
        const b = v.background;
        if (state === 'skipped') status = { tone: 'neutral', key: 'notNeeded' };
        else if (done) status = { tone: 'success', key: 'verified' };
        else if (b.status === 'invited' || b.status === 'pending') status = { tone: 'info', key: 'inProgress' };
        else if (b.status === 'consider' || b.adjudication === 'pre_adverse') status = { tone: 'info', key: 'inReview' };
        else if (b.status === 'suspended' || b.adjudication === 'post_adverse') status = { tone: 'warning', key: 'paused' };
        else if (b.status === 'expired' || b.renewalOpen) status = { tone: 'warning', key: 'renew' };
        if (state === 'locked') action = { kind: 'profile', label: 'addArea' };
        else if (b.canStart && state !== 'skipped') action = { kind: 'background', label: b.status === 'not_started' ? 'start' : 'startAgain' };
        break;
      }
    }
    rows.push({ check, status, action, done: done || (check === 'payout' && v.payout.status === 'active') || (check === 'background' && state === 'skipped') });
  }
  return rows;
}

export function VerificationHub({ data, handlers }: { data: HelperOnboardingPageData; handlers: Handlers }) {
  const t = useTranslations('verifyFlow.hub');
  const rows = hubRows(data);
  const counted = rows.filter((row) => !(row.check === 'background' && row.status?.key === 'notNeeded'));
  const doneCount = counted.filter((row) => row.done).length;
  const verified = data.progress.verified === true || (counted.length > 0 && doneCount === counted.length);
  return <div className="mx-auto w-full max-w-[44rem] space-y-6 pb-24 sm:pb-8">
    <header className="space-y-4">
      <div className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">{t('title')}</h1>
        <p className="text-[0.9375rem] text-muted-foreground">{verified ? t('allDone') : t('subtitle')}</p>
      </div>
      <div className="flex items-center gap-3" aria-label={t('progressLabel', { done: doneCount, total: counted.length })} role="img">
        <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <div className="h-full rounded-full bg-success transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${counted.length ? Math.round((doneCount / counted.length) * 100) : 0}%` }} />
        </div>
        <span aria-hidden="true" className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{t('progress', { done: doneCount, total: counted.length })}</span>
      </div>
    </header>

    <ul className="overflow-hidden rounded-[1.5rem] border bg-card shadow-card">
      {rows.map((row, index) => <li key={row.check} className={cn(index > 0 && 'border-t border-foreground/[0.06]')}><HubRow row={row} handlers={handlers} data={data} /></li>)}
    </ul>

    {!data.progress.bookable && <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground"><House aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t('helpingNeeds')}</p>}
    {data.welcomeReward && data.welcomeReward.state === 'open' && <WelcomeGiftStrip card={data.welcomeReward} />}
  </div>;
}

function HubRow({ row, handlers, data }: { row: RowView; handlers: Handlers; data: HelperOnboardingPageData }) {
  const t = useTranslations('verifyFlow.hub');
  const Icon = ICONS[row.check];
  const body = <>
    <span aria-hidden="true" className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors', row.done ? 'bg-success/12 text-success' : 'bg-brand-soft text-primary')}>
      {row.done ? <Check className="size-5" strokeWidth={2.5} /> : <Icon className="size-5" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{t(`checks.${row.check}.title`)}</span>
      <span className="block text-sm text-muted-foreground">{t(`checks.${row.check}.hint`)}</span>
    </span>
    {row.status && <StatusBadge tone={row.status.tone} label={t(`statuses.${row.status.key}`)} size="sm" icon={row.status.tone === 'info' ? <Clock /> : row.status.tone === 'warning' ? <TriangleAlert /> : undefined} className="shrink-0 max-sm:hidden" />}
  </>;
  const rowClass = 'flex min-h-[4.75rem] w-full items-center gap-4 px-4 py-3 text-left sm:px-5';
  const statusOnPhone = row.status && <StatusBadge tone={row.status.tone} label={t(`statuses.${row.status.key}`)} size="sm" className="sm:hidden" />;

  if (row.action?.kind === 'dialog') {
    return <Link href={routes.app.helperCheck(row.check)} scroll={false} className={cn(rowClass, 'group transition-colors hover:bg-foreground/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring')}>
      {body}
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
        {statusOnPhone ?? <span className="max-sm:sr-only">{t(`actions.${row.action.label}`)}</span>}
        <ChevronRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </Link>;
  }
  return <div className={rowClass}>
    {body}
    <span className="flex shrink-0 items-center gap-2">
      {statusOnPhone}
      {row.action?.kind === 'payout' && <ProviderButton label={t(`actions.${row.action.label}`)} run={() => handlers.onStartPayout()} />}
      {row.action?.kind === 'background' && <BackgroundStart label={t(`actions.${row.action.label}`)} disclosureNeeded={data.verification.background.disclosureNeeded} onStart={handlers.onStartBackgroundCheck} />}
      {row.action?.kind === 'profile' && <Button asChild size="sm" variant="outline"><Link href={`${routes.app.helperOnboarding('profile')}#area`}>{t(`actions.${row.action.label}`)}</Link></Button>}
    </span>
  </div>;
}

/** Starts a provider's onboarding and goes there (Stripe for payouts). */
function ProviderButton({ label, run }: { label: string; run: () => Promise<ActionResult> }) {
  const router = useRouter();
  const t = useTranslations('verifyFlow.hub');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return <span className="flex flex-col items-end gap-1">
    <Button size="sm" disabled={busy} aria-busy={busy} onClick={async () => {
      setBusy(true);
      setFailed(false);
      const result = await run().catch((): ActionResult => ({ ok: false, code: 'unknown' }));
      if (result.ok && result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      setBusy(false);
      setFailed(!result.ok);
    }}>{busy && <Spinner />}{label}</Button>
    {failed && <span role="alert" className="text-xs text-destructive">{t('providerUnavailable')}</span>}
  </span>;
}

/** The background check: our summary acknowledged (once per version), then Checkr's own pages. */
function BackgroundStart({ label, disclosureNeeded, onStart }: { label: string; disclosureNeeded: boolean; onStart: Handlers['onStartBackgroundCheck'] }) {
  const t = useTranslations('verifyFlow.hub.background');
  const v = useTranslations('verification');
  const router = useRouter();
  const id = useId();
  const [agreed, setAgreed] = useState(!disclosureNeeded);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function start() {
    setBusy(true);
    setFailed(false);
    const result = await onStart({ acknowledged: agreed }).catch((): ActionResult => ({ ok: false, code: 'unknown' }));
    if (result.ok && result.redirectTo) {
      router.push(result.redirectTo);
      return;
    }
    setBusy(false);
    setFailed(true);
  }
  return <Dialog>
    <DialogTrigger asChild><Button size="sm">{label}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      {disclosureNeeded && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-6">
        <input id={id} type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        <span>{v('setup.disclosure.checkbox')}</span>
      </label>}
      {disclosureNeeded && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer font-medium text-primary">{t('readSummary')}</summary><p className="mt-2 leading-6">{v('setup.disclosure.body')}</p></details>}
      {failed && <p role="alert" className="text-sm text-destructive">{t('failed')}</p>}
      <DialogFooter>
        <Button size="lg" className="w-full" disabled={!agreed || busy} aria-busy={busy} onClick={() => void start()}>{busy && <Spinner />}{t('continue')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
