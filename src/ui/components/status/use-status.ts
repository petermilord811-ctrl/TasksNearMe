import { useTranslations } from 'next-intl';
import type { BadgeTone, TaskStatus, BookingStatus, OfferStatus, InviteStatus, PaymentStatus, EarningsStatus, RewardStatus, CaseStatus, ViewerRole, ISODateTime } from '@/contracts';
import { useFormat } from '@/ui/lib/format';

export interface StatusLabel { label: string; tone: BadgeTone }

const taskTones: Record<TaskStatus, BadgeTone> = { draft: 'neutral', open: 'brand', assigned: 'info', completed: 'success', canceled: 'neutral', expired: 'neutral' };
const bookingTones: Record<BookingStatus, BadgeTone> = {
  pending_funding: 'warning', scheduled: 'info', confirmed: 'info', in_progress: 'info', completion_submitted: 'warning', disputed: 'danger', completed: 'success', canceled: 'neutral',
};
const offerTones: Record<OfferStatus, BadgeTone> = { pending: 'info', stale: 'warning', accepted: 'success', declined: 'neutral', withdrawn: 'neutral', expired: 'neutral' };
const inviteTones: Record<InviteStatus, BadgeTone> = { authorizing: 'info', sent: 'info', countered: 'warning', accepted: 'success', declined: 'neutral', canceled: 'neutral', expired: 'neutral', auth_failed: 'danger' };
const paymentTones: Record<PaymentStatus, BadgeTone> = { requires_confirmation: 'warning', processing: 'info', authorized: 'info', succeeded: 'success', failed: 'danger', canceled: 'neutral', partially_refunded: 'neutral', refunded: 'neutral', chargeback_open: 'danger', chargeback_won: 'success', chargeback_lost: 'danger' };
const earningsTones: Record<EarningsStatus, BadgeTone> = { not_due: 'neutral', on_hold: 'warning', scheduled: 'info', transferred: 'info', paid_out: 'success', reversed: 'neutral', partially_reversed: 'neutral', failed: 'danger' };
const rewardTones: Record<RewardStatus, BadgeTone> = { pending: 'reward', qualified: 'reward', in_review: 'warning', redeemable: 'reward', issuing: 'info', delivered: 'success', failed: 'danger', voided: 'neutral', expired: 'neutral' };
const caseTones: Record<CaseStatus, BadgeTone> = { open: 'info', awaiting_poster: 'warning', awaiting_helper: 'warning', awaiting_support: 'info', escalated: 'warning', resolved: 'success', closed: 'neutral' };

export function useTaskStatus(status: TaskStatus): StatusLabel {
  const t = useTranslations('status');
  return { label: t(`task.${status}`), tone: taskTones[status] };
}

export function useBookingStatus(status: BookingStatus, viewer: ViewerRole): StatusLabel {
  const t = useTranslations('status');
  return { label: t(`booking.${viewer}.${status}`), tone: bookingTones[status] };
}

export function useOfferStatus(status: OfferStatus, viewer: ViewerRole): StatusLabel {
  const t = useTranslations('status');
  return { label: t(status === 'pending' ? `offer.pending_${viewer}` : `offer.${status}`), tone: status === 'pending' && viewer === 'poster' ? 'brand' : offerTones[status] };
}

export function useInviteStatus(status: InviteStatus, viewer: ViewerRole, helperName?: string): StatusLabel {
  const t = useTranslations('status');
  const label = status === 'sent'
    ? viewer === 'poster' && helperName ? t('invite.sent_named', { helper: helperName }) : t(`invite.sent_${viewer}`)
    : t(`invite.${status}`);
  return { label, tone: inviteTones[status] };
}

export function usePaymentStatus(status: PaymentStatus): StatusLabel {
  const t = useTranslations('status');
  return { label: t(`payment.${status}`), tone: paymentTones[status] };
}

export function useEarningsStatus(status: EarningsStatus): StatusLabel {
  const t = useTranslations('status');
  return { label: t(`earnings.${status}`), tone: earningsTones[status] };
}

export function useRewardStatus(status: RewardStatus, unlocksAt?: ISODateTime): StatusLabel {
  const { formatDateTime } = useFormat();
  const t = useTranslations('status');
  return { label: status === 'qualified' && unlocksAt ? t('reward.qualified_at', { date: formatDateTime(unlocksAt) }) : t(`reward.${status}`), tone: rewardTones[status] };
}

export function useCaseStatus(status: CaseStatus, viewer: ViewerRole = 'staff', waitingForName?: string): StatusLabel {
  const t = useTranslations('status');
  const waitingForPerson = status === 'awaiting_poster' || status === 'awaiting_helper';
  const waitingForViewer = status === `awaiting_${viewer}`;
  const label = waitingForViewer ? t('case.awaiting_you') : waitingForPerson && waitingForName ? t('case.awaiting_named', { name: waitingForName }) : t(`case.${status}`);
  return { label, tone: caseTones[status] };
}
