import type { AttentionTarget, NotificationType, NotificationView, VerificationTrack } from '@/contracts';
import { VERIFICATION_TRACKS } from '@/contracts';

/**
 * Which notification a `verification.updated` event becomes (src/modules/verification/state.ts):
 * - a step passed (the phone, the ID, the home address, payouts, the background check) or needs the helper;
 * - the background check runs out soon, or has (`days` 0); the same for the ID a helper verified with (6.3);
 * - onboarding is done (`helper` + `ready`): the helper can send offers.
 */
export interface PlannedVerificationNotification {
  userId: string;
  type: Extract<NotificationType, 'verification_passed' | 'verification_action_needed' | 'background_check_expiring' | 'id_expiring' | 'helper_ready'>;
  target: AttentionTarget;
  params?: NotificationView['params'];
}

export function verificationNotificationFor(payload: Record<string, unknown>): PlannedVerificationNotification | null {
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const userId = text(payload.userId);
  const track = text(payload.track);
  const outcome = text(payload.outcome);
  if (!userId || !track || !outcome) return null;
  if (track === 'helper') return outcome === 'ready' ? { userId, type: 'helper_ready', target: { kind: 'onboarding', step: 'done' } } : null;
  // A client's ID check (asked for by risk): its results lead to their own ID page.
  if (track === 'poster_identity') {
    if (outcome !== 'passed' && outcome !== 'action_needed') return null;
    return { userId, type: outcome === 'passed' ? 'verification_passed' : 'verification_action_needed', target: { kind: 'verify_identity' }, params: { track: 'identity' } };
  }
  if (!(VERIFICATION_TRACKS as readonly string[]).includes(track)) return null;
  const step = track as VerificationTrack;
  if (outcome === 'expiring' || outcome === 'expired') {
    if (step !== 'background' && step !== 'identity') return null;
    const days = typeof payload.days === 'number' && outcome === 'expiring' ? Math.max(0, Math.round(payload.days)) : 0;
    return { userId, type: step === 'identity' ? 'id_expiring' : 'background_check_expiring', target: { kind: 'onboarding', step }, params: { days } };
  }
  if (outcome !== 'passed' && outcome !== 'action_needed') return null;
  return { userId, type: outcome === 'passed' ? 'verification_passed' : 'verification_action_needed', target: { kind: 'onboarding', step }, params: { track: step } };
}
