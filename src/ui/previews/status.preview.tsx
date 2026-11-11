import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUSES, OFFER_STATUSES, INVITE_STATUSES, PAYMENT_STATUSES, EARNINGS_STATUSES, REWARD_STATUSES, CASE_STATUSES, type BookingStatus, type OfferStatus, type InviteStatus, type PaymentStatus, type EarningsStatus, type RewardStatus, type CaseStatus, type ViewerRole, type PreviewEntry } from '@/contracts';
import { DESK_TIMES, jordan } from '@/fixtures';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useBookingStatus, useOfferStatus, useInviteStatus, usePaymentStatus, useEarningsStatus, useRewardStatus, useCaseStatus } from '@/ui/components/status/use-status';
import statusCopy from '../../../messages/en/ui/status.json';

function Booking({ status, viewer }: { status: BookingStatus; viewer: ViewerRole }) { return <StatusBadge {...useBookingStatus(status, viewer)} />; }
function Offer({ status, viewer }: { status: OfferStatus; viewer: ViewerRole }) { return <StatusBadge {...useOfferStatus(status, viewer)} />; }
function Invite({ status, viewer }: { status: InviteStatus; viewer: ViewerRole }) { return <StatusBadge {...useInviteStatus(status, viewer, jordan.displayName)} />; }
function Payment({ status }: { status: PaymentStatus }) { return <StatusBadge {...usePaymentStatus(status)} />; }
function Earnings({ status }: { status: EarningsStatus }) { return <StatusBadge {...useEarningsStatus(status)} />; }
function Reward({ status }: { status: RewardStatus }) { return <StatusBadge {...useRewardStatus(status, DESK_TIMES.rewardUnlocks)} />; }
function Case({ status }: { status: CaseStatus }) { return <StatusBadge {...useCaseStatus(status)} />; }

function StatusPreview({ children }: { children: ReactNode }) {
  const t = useTranslations('status.preview');
  return <main className="mx-auto max-w-3xl space-y-6"><header className="space-y-2"><h1 className="font-heading text-2xl font-bold">{t('title')}</h1><p className="text-muted-foreground">{t('description')}</p></header>{children}</main>;
}

function RoleGrid({ kind }: { kind: 'offer' | 'invite' }) {
  const t = useTranslations('status.preview');
  return <div className="grid gap-6 sm:grid-cols-2">{(['poster', 'helper'] as const).map((viewer) => <section key={viewer} className="space-y-4 rounded-xl border bg-card p-4"><h2 className="font-heading text-lg font-semibold">{t(viewer)}</h2><div className="flex flex-wrap gap-3">{kind === 'offer' ? OFFER_STATUSES.map((status) => <Offer key={status} status={status} viewer={viewer} />) : INVITE_STATUSES.map((status) => <Invite key={status} status={status} viewer={viewer} />)}</div></section>)}</div>;
}

const grid = 'flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4';

export const statusPreviews: PreviewEntry[] = [
  { id: 'status-badge/booking-poster', group: statusCopy.preview.group, title: statusCopy.preview.bookingPoster, render: () => <StatusPreview><div className={grid}>{BOOKING_STATUSES.map((status) => <Booking key={status} status={status} viewer="poster" />)}</div></StatusPreview> },
  { id: 'status-badge/booking-helper', group: statusCopy.preview.group, title: statusCopy.preview.bookingHelper, render: () => <StatusPreview><div className={grid}>{BOOKING_STATUSES.map((status) => <Booking key={status} status={status} viewer="helper" />)}</div></StatusPreview> },
  { id: 'status-badge/offers', group: statusCopy.preview.group, title: statusCopy.preview.offers, render: () => <StatusPreview><RoleGrid kind="offer" /></StatusPreview> },
  { id: 'status-badge/invites', group: statusCopy.preview.group, title: statusCopy.preview.invites, render: () => <StatusPreview><RoleGrid kind="invite" /></StatusPreview> },
  { id: 'status-badge/payments', group: statusCopy.preview.group, title: statusCopy.preview.payments, render: () => <StatusPreview><div className={grid}>{PAYMENT_STATUSES.map((status) => <Payment key={status} status={status} />)}</div></StatusPreview> },
  { id: 'status-badge/earnings', group: statusCopy.preview.group, title: statusCopy.preview.earnings, render: () => <StatusPreview><div className={grid}>{EARNINGS_STATUSES.map((status) => <Earnings key={status} status={status} />)}</div></StatusPreview> },
  { id: 'status-badge/rewards', group: statusCopy.preview.group, title: statusCopy.preview.rewards, render: () => <StatusPreview><div className={grid}>{REWARD_STATUSES.map((status) => <Reward key={status} status={status} />)}</div></StatusPreview> },
  { id: 'status-badge/cases', group: statusCopy.preview.group, title: statusCopy.preview.cases, render: () => <StatusPreview><div className={grid}>{CASE_STATUSES.map((status) => <Case key={status} status={status} />)}</div></StatusPreview> },
];
