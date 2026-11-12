import type { ComponentProps } from 'react';
import { ACTION_ERROR_CODES, type InviteHandlers, type InviteView, type PaymentAttemptResult, type PreviewEntry } from '@/contracts';
import { bookshelfInviteAcceptedPoster, bookshelfInviteCounteredHelper, bookshelfInviteCounteredPoster, bookshelfInviteDeclinedPoster, bookshelfInviteExpiredHelper, bookshelfInviteSentHelper, bookshelfInviteSentPoster, chris, fakeHandler, fakeInviteHandlers, helperMovingHourly, movingFundedBreakdown, slotInviteSentHelper } from '@/fixtures';
import { InviteCardContent } from '@/ui/components/invites/invite-card';
import copy from '../../../messages/en/ui/inviteCard.json';
import feedback from '../../../messages/en/ui/feedback.json';

const now = '2026-12-08T18:00:00.000Z';
const handlers: InviteHandlers = {
  ...fakeInviteHandlers,
  onAccept: fakeHandler({ ok: true, code: 'booked' }),
  onAcceptCounter: fakeHandler({ ok: true, code: 'booked' }),
  onDecline: fakeHandler({ ok: true, code: 'updated' }),
  onDeclineCounter: fakeHandler({ ok: true, code: 'updated' }),
  onCancel: fakeHandler({ ok: true, code: 'updated' }),
  onCounter: fakeHandler({ ok: true, code: 'sent' }),
  onFinishVerification: ({ outcome }) => fakeHandler(outcome === 'approved' ? { ok: true, code: 'booked' } : { ok: false, code: 'payment_declined' })(undefined),
};
type Options = Pick<ComponentProps<typeof InviteCardContent>, 'initialCounterOpen' | 'initialResult' | 'initialPending'>;

function preview(variant: keyof typeof copy.previews, invite: InviteView, options: Options = {}): PreviewEntry {
  return { id: `component-invite-card/${variant}`, group: copy.previews.group, title: copy.previews[variant], render: () => <InviteCardContent invite={invite} handlers={handlers} now={now} {...options} /> };
}

const verification: PaymentAttemptResult = { ok: false, code: 'requires_bank_verification', verification: { kind: 'dev', paymentId: 'pay_bookshelf_counter' } };

export const inviteCardPreviews: PreviewEntry[] = [
  preview('slot-helper', slotInviteSentHelper),
  preview('slot-client', { ...bookshelfInviteSentPoster, id: slotInviteSentHelper.id, terms: slotInviteSentHelper.terms, slot: slotInviteSentHelper.slot }),
  preview('sent-client', bookshelfInviteSentPoster),
  preview('sent-helper', bookshelfInviteSentHelper),
  preview('countered-client', bookshelfInviteCounteredPoster),
  preview('countered-helper', bookshelfInviteCounteredHelper),
  preview('accepted', bookshelfInviteAcceptedPoster),
  preview('declined', bookshelfInviteDeclinedPoster),
  preview('expired', bookshelfInviteExpiredHelper),
  preview('counter-form', bookshelfInviteSentHelper, { initialCounterOpen: true }),
  preview('canceled', { ...bookshelfInviteDeclinedPoster, status: 'canceled' }),
  preview('authorizing', { ...bookshelfInviteSentPoster, status: 'authorizing', authorizedCents: undefined, expiresAt: undefined, actions: [] }),
  preview('auth-failed', { ...bookshelfInviteDeclinedPoster, status: 'auth_failed' }),
  preview('bank-verification', bookshelfInviteCounteredPoster, { initialResult: verification }),
  preview('pending', bookshelfInviteSentHelper, { initialPending: true }),
  preview('hourly', { ...bookshelfInviteSentHelper, id: 'inv_moving', client: chris, task: { id: helperMovingHourly.task.id, title: helperMovingHourly.task.title, categorySlug: helperMovingHourly.task.categorySlug }, terms: { start: helperMovingHourly.task.schedule.windowStart, pricing: helperMovingHourly.offerDefaults.pricing }, breakdown: movingFundedBreakdown, expiresAt: undefined }),
  ...ACTION_ERROR_CODES.map((code): PreviewEntry => ({
    id: `component-invite-card/error-${code.replaceAll('_', '-')}`, group: copy.previews.group, title: feedback.error[code],
    render: () => <InviteCardContent invite={bookshelfInviteCounteredPoster} handlers={{ ...handlers, onAcceptCounter: fakeHandler({ ok: false, code }) }} now={now} initialResult={{ ok: false, code }} />,
  })),
];
