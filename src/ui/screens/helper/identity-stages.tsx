import { CircleCheck, CircleDot, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BadgeTone, IdentityStatus, VerificationSummary } from '@/contracts';
import { cn } from '@/ui/lib/utils';

export const identityStatusTones: Record<IdentityStatus, BadgeTone> = {
  not_started: 'neutral', processing: 'info', requires_input: 'warning', verified: 'success', canceled: 'neutral',
};

/** The ID step's badge: our own check's stage while it's the one that matters, then the provider's status. */
export function identityBadge(identity: VerificationSummary['identity']): { tone: BadgeTone; key: string } {
  if (identity.nameCheck) return { tone: 'info', key: 'statuses.identityNameCheck' };
  if (identity.blocked) return { tone: 'warning', key: 'statuses.identityBlocked' };
  const capture = identity.capture;
  if (capture && identity.status !== 'verified') {
    if (capture.stage === 'in_review') return { tone: 'info', key: 'capture.statuses.in_review' };
    if (capture.stage === 'needed') return capture.rejectionReason ? { tone: 'warning', key: 'capture.statuses.retake' } : { tone: 'neutral', key: 'capture.statuses.needed' };
    if (capture.stage === 'approved' && identity.status === 'not_started') return { tone: 'info', key: 'capture.statuses.approved' };
  }
  return { tone: identityStatusTones[identity.status], key: `statuses.identity.${identity.status}` };
}

type StageState = 'done' | 'current' | 'in_review' | 'next';

/** The ID check's two stages: our photos (our team compares them), then the double check with our ID partner. */
export function IdentityStages({ identity }: { identity: VerificationSummary['identity'] }) {
  const t = useTranslations('verification.capture.stages');
  const capture = identity.capture;
  if (!capture) return null;
  const verified = identity.status === 'verified';
  const photos: StageState = capture.stage === 'in_review' ? 'in_review' : capture.stage === 'needed' ? 'current' : 'done';
  const double: StageState = verified ? 'done' : capture.stage === 'approved' ? (identity.status === 'processing' || identity.blocked === 'double_check_review' ? 'in_review' : 'current') : 'next';
  const stages = [
    { key: 'photos', state: photos, title: t('photos'), hint: t('photosHint') },
    { key: 'doubleCheck', state: double, title: t('doubleCheck'), hint: t('doubleCheckHint') },
  ] as const;
  return <ol aria-label={t('label')} className="grid gap-2 sm:grid-cols-2">
    {stages.map((stage, index) => {
      const Icon = stage.state === 'done' ? CircleCheck : stage.state === 'in_review' ? Clock : CircleDot;
      return <li key={stage.key} aria-current={stage.state === 'current' ? 'step' : undefined} className={cn('flex items-start gap-3 rounded-xl border p-3', stage.state === 'current' ? 'border-primary bg-secondary text-secondary-foreground' : 'bg-background')}>
        <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', stage.state === 'done' ? 'text-success' : stage.state === 'next' ? 'text-muted-foreground' : 'text-primary')} />
        <span className="min-w-0 text-sm">
          <span className="block font-medium">{index + 1}. {stage.title}</span>
          <span className="block text-muted-foreground">{stage.hint} · {t(`states.${stage.state}`)}</span>
        </span>
      </li>;
    })}
  </ol>;
}
