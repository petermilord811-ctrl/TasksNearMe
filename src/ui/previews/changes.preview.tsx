import type { ComponentProps } from 'react';
import {
  routes,
  type ActionResult,
  type AppShellHandlers,
  type ChangeQuoteResult,
  type ChangeReviewHandlers,
  type ChangeReviewPageData,
  type PaymentAttemptResult,
  type PreviewEntry,
  type ProposeChangeHandlers,
  type ProposeChangeInput,
  type ProposeChangePageData,
} from '@/contracts';
import {
  deskChairChangeAppliedData,
  deskChairChangeCounterpartyData,
  deskChairChangeDeclinedData,
  deskChairChangePayData,
  deskChairChangeProposerData,
  deskChairQuote,
  deskProposeChangeBlockedData,
  deskProposeChangeData,
  fakeChangeReviewHandlers,
  fakeHandler,
  fakeProposeChangeHandlers,
  jordanShell,
  mayaShell,
  movingCapChangeData,
  movingProposeChangeData,
} from '@/fixtures';
import { ChangeMoneyComparison } from '@/ui/screens/bookings/changes/change-money-comparison';
import { ChangeReviewContent, ChangeReviewScreen } from '@/ui/screens/bookings/changes/change-review-screen';
import { ProposeChangeContent, ProposeChangeScreen } from '@/ui/screens/bookings/changes/propose-change-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/changes.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

const proposeHandlers: ProposeChangeHandlers = {
  ...fakeProposeChangeHandlers,
  onPropose: fakeHandler({ ok: true, code: 'sent' }),
};
const reviewHandlers: ChangeReviewHandlers = {
  ...fakeChangeReviewHandlers,
  onAccept: fakeHandler({ ok: true, code: 'updated' }),
  onPayDifference: fakeHandler({ ok: true, code: 'paid' }),
  onFinishVerification: ({ outcome }) => fakeHandler(outcome === 'approved'
    ? { ok: true, code: 'paid' }
    : { ok: false, code: 'payment_declined' })(undefined),
  onDecline: fakeHandler({ ok: true, code: 'updated' }),
  onWithdraw: fakeHandler({ ok: true, code: 'updated' }),
};

const chair = deskChairChangeProposerData.change;
const chairInput: Partial<ProposeChangeInput> = {
  priceCents: chair.after.taskPriceCents,
  scopeText: chair.proposed.scopeText,
  message: chair.message,
};
const movingInput: Partial<ProposeChangeInput> = {
  hoursCap: movingCapChangeData.change.after.hourly!.hours,
  message: movingCapChangeData.change.message,
};
const movingQuote: ChangeQuoteResult = {
  ok: true,
  before: movingCapChangeData.change.before,
  after: movingCapChangeData.change.after,
  differenceCents: movingCapChangeData.change.differenceCents!,
};

type ProposeOptions = Pick<ComponentProps<typeof ProposeChangeContent>, 'initialInput' | 'initialResult'> & { handlers?: ProposeChangeHandlers };
type ReviewOptions = Pick<ComponentProps<typeof ChangeReviewContent>, 'initialResult' | 'initialPending'> & { handlers?: ChangeReviewHandlers };

function proposePreview(variant: keyof typeof copy.previews.propose, data: ProposeChangePageData, options?: ProposeOptions): PreviewEntry {
  const now = data.booking.id === movingProposeChangeData.booking.id ? movingCapChangeData.change.createdAt : chair.createdAt;
  return {
    id: `screen-propose-change/${variant}`,
    title: copy.previews.propose[variant],
    group: copy.previews.group,
    layout: 'fullscreen',
    render: () => <AppShell viewer={data.booking.viewerRole === 'helper' ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.bookingProposeChange(data.booking.id)} layout="flow">
      {options
        ? <ProposeChangeContent data={data} handlers={proposeHandlers} now={now} {...options} />
        : <ProposeChangeScreen data={data} handlers={proposeHandlers} now={now} />}
    </AppShell>,
  };
}

function reviewPreview(variant: keyof typeof copy.previews.review, data: ChangeReviewPageData, options?: ReviewOptions): PreviewEntry {
  return {
    id: `screen-change-review/${variant}`,
    title: copy.previews.review[variant],
    group: copy.previews.group,
    layout: 'fullscreen',
    render: () => <AppShell viewer={data.booking.viewerRole === 'helper' ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.bookingChange(data.booking.id, data.change.id)} layout="flow">
      {options
        ? <ChangeReviewContent data={data} handlers={reviewHandlers} now={data.change.createdAt} {...options} />
        : <ChangeReviewScreen data={data} handlers={reviewHandlers} now={data.change.createdAt} />}
    </AppShell>,
  };
}

const verification: PaymentAttemptResult = {
  ok: false,
  code: 'requires_bank_verification',
  verification: { kind: 'dev', paymentId: 'pay_desk_change' },
};

export const changesPreviews: PreviewEntry[] = [
  proposePreview('desk', deskProposeChangeData, { initialInput: chairInput }),
  proposePreview('moving', movingProposeChangeData, {
    initialInput: movingInput,
    handlers: { ...proposeHandlers, onQuote: async () => { await fakeHandler()(undefined); return movingQuote; } },
  }),
  proposePreview('blocked', deskProposeChangeBlockedData),
  proposePreview('quote-pending', deskProposeChangeData, {
    initialInput: chairInput,
    handlers: { ...proposeHandlers, onQuote: () => new Promise(() => {}) },
  }),
  ...(['validation_failed', 'not_allowed', 'rate_limited', 'unknown'] as const).map((code) => {
    const result: ActionResult = {
      ok: false,
      code,
      ...(code === 'validation_failed' ? { fieldErrors: { message: ['too_short' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: deskChairChangePayData.change.expiresAt } : {}),
    };
    const variant = code.replaceAll('_', '-') as 'validation-failed' | 'not-allowed' | 'rate-limited' | 'unknown';
    return proposePreview(variant, deskProposeChangeData, {
      initialInput: chairInput,
      initialResult: result,
      handlers: { ...proposeHandlers, onPropose: fakeHandler(result) },
    });
  }),
  ...(['validation_failed', 'not_allowed', 'unknown'] as const).map((code) => {
    const variant = `quote-${code.replaceAll('_', '-')}` as 'quote-validation-failed' | 'quote-not-allowed' | 'quote-unknown';
    return proposePreview(variant, deskProposeChangeData, {
      initialInput: chairInput,
      handlers: { ...proposeHandlers, onQuote: async () => { await fakeHandler()(undefined); return { ok: false, code }; } },
    });
  }),
  reviewPreview('proposer', deskChairChangeProposerData),
  reviewPreview('counterparty', deskChairChangeCounterpartyData),
  reviewPreview('pay-difference', deskChairChangePayData),
  reviewPreview('applied', deskChairChangeAppliedData),
  reviewPreview('declined', deskChairChangeDeclinedData),
  reviewPreview('moving-cap', movingCapChangeData),
  reviewPreview('bank-verification', deskChairChangePayData, {
    initialResult: verification,
    handlers: { ...reviewHandlers, onPayDifference: async () => { await fakeHandler()(undefined); return verification; } },
  }),
  ...(['payment_declined', 'insufficient_funds', 'expired', 'not_allowed', 'version_conflict', 'unknown'] as const).map((code) => {
    const result: ActionResult = { ok: false, code };
    const variant = (code === 'expired' ? 'result-expired' : code.replaceAll('_', '-')) as 'payment-declined' | 'insufficient-funds' | 'result-expired' | 'not-allowed' | 'version-conflict' | 'unknown';
    return reviewPreview(variant, deskChairChangePayData, {
      initialResult: result,
      handlers: {
        ...reviewHandlers,
        onAccept: fakeHandler(result),
        onPayDifference: fakeHandler(result),
        onFinishVerification: fakeHandler(result),
        onDecline: fakeHandler(result),
        onWithdraw: fakeHandler(result),
      },
    });
  }),
  ...(['withdrawn', 'expired'] as const).map((status) => reviewPreview(status, {
    ...deskChairChangeDeclinedData,
    change: { ...deskChairChangeDeclinedData.change, status },
  })),
  reviewPreview('pending', deskChairChangePayData, {
    initialPending: true,
    handlers: { ...reviewHandlers, onPayDifference: () => new Promise(() => {}) },
  }),
  ...(['poster', 'helper'] as const).map((viewerRole): PreviewEntry => ({
    id: `component-change-money/${viewerRole}`,
    title: copy.previews.money[viewerRole],
    group: copy.previews.group,
    render: () => <ChangeMoneyComparison before={chair.before} after={chair.after} viewerRole={viewerRole} differenceCents={deskChairQuote.ok ? deskChairQuote.differenceCents : undefined} />,
  })),
  {
    id: 'component-change-money/refund',
    title: copy.previews.money.refund,
    group: copy.previews.group,
    render: () => <ChangeMoneyComparison before={chair.after} after={chair.before} viewerRole="poster" differenceCents={-2200} />,
  },
];
