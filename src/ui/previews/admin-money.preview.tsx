import type { ComponentProps, ReactNode } from 'react';
import {
  routes,
  type ActionResult,
  type AdminBookingHandlers,
  type AdminBookingPageData,
  type AdminCaseHandlers,
  type AdminCasePageData,
  type PreviewEntry,
  type ResolutionPreviewResult,
} from '@/contracts';
import { ADMIN_NOW, adminBookingDisputedData, adminBookingReadOnlyData, adminBookingSettledData, alexStaff, deskExactAddress, deskSettledBreakdown, disputeMoneyCaseData, fakeAdminBookingHandlers, fakeAdminCaseHandlers, fakeHandler, overLimitPreview, releaseFullPreview, reportedConversation, settleAt45Preview, adminBookingRefundRequestData, adminBookingDirectData } from '@/fixtures';
import { AdminBookingContent } from '@/ui/screens/admin/admin-booking-screen';
import { AdminCaseContent } from '@/ui/screens/admin/admin-case-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import bookingCopy from '../../../messages/en/ui/adminBooking.json';
import caseCopy from '../../../messages/en/ui/adminCase.json';
import homeCopy from '../../../messages/en/ui/adminHome.json';
import casesCopy from '../../../messages/en/ui/adminCases.json';
import shellCopy from '../../../messages/en/ui/shell.json';

const b = bookingCopy.previews;
const c = caseCopy.previews;
const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const caseHandlers: AdminCaseHandlers = {
  ...fakeAdminCaseHandlers,
  onAssign: fakeHandler({ ok: true, code: 'updated' }),
  onSetStatus: fakeHandler({ ok: true, code: 'updated' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onAddNote: fakeHandler({ ok: true, code: 'saved' }),
  onResolve: fakeHandler({ ok: true, code: 'saved' }),
  onClose: fakeHandler({ ok: true, code: 'updated' }),
  onReopen: fakeHandler({ ok: true, code: 'updated' }),
};
const bookingHandlers: AdminBookingHandlers = {
  ...fakeAdminBookingHandlers,
  onRefund: fakeHandler({ ok: true, code: 'submitted' }),
};

function Shell({ kind, id, children }: { kind: 'case' | 'booking'; id: string; children: ReactNode }) {
  return <AdminShell viewer={alexStaff} handlers={shellHandlers} currentPath={kind === 'case' ? routes.admin.case(id) : routes.admin.booking(id)} breadcrumbs={[
    { label: homeCopy.title, href: routes.admin.home() },
    { label: kind === 'case' ? casesCopy.title : shellCopy.nav.bookings, href: kind === 'case' ? routes.admin.cases() : routes.admin.bookings() },
    { label: kind === 'case' ? c.breadcrumb : bookingCopy.breadcrumb },
  ]}>{children}</AdminShell>;
}

type ResolutionState = NonNullable<ComponentProps<typeof AdminCaseContent>['resolutionState']>;
function moneyCasePreview(id: string, title: string, resolutionState: ResolutionState, data: AdminCasePageData = disputeMoneyCaseData): PreviewEntry {
  const preview: ResolutionPreviewResult = resolutionState.initialPreview ?? { ok: true, preview: settleAt45Preview };
  return {
    id: `screen-admin-case/${id}`, group: c.group, title, layout: 'fullscreen',
    render: () => <Shell kind="case" id={data.case.id}><AdminCaseContent data={data} handlers={{ ...caseHandlers, onPreviewResolution: () => Promise.resolve(preview) }} now={ADMIN_NOW} initialDialog="resolve" resolutionState={resolutionState} /></Shell>,
  };
}

type BookingSeeds = Pick<ComponentProps<typeof AdminBookingContent>, 'initialDialog' | 'initialAddress' | 'initialConversation' | 'refundState' | 'reasonState' | 'initialDecision'>;
function bookingPreview(id: string, title: string, data: AdminBookingPageData = adminBookingDisputedData, seeds: BookingSeeds = {}): PreviewEntry {
  const refundResult = seeds.refundState?.initialResult;
  const reasonResult = seeds.reasonState?.initialResult;
  const handlers: AdminBookingHandlers = {
    ...bookingHandlers,
    onRefund: fakeHandler(refundResult ?? { ok: true, code: 'submitted' }),
    ...(reasonResult && !reasonResult.ok ? {
      onRevealAddress: () => Promise.resolve(reasonResult),
      onRevealConversation: () => Promise.resolve(reasonResult),
    } : {}),
  };
  return {
    id: `screen-admin-booking/${id}`, group: b.group, title, layout: 'fullscreen',
    render: () => <Shell kind="booking" id={data.booking.id}><AdminBookingContent data={data} handlers={handlers} now={ADMIN_NOW} {...seeds} /></Shell>,
  };
}

const settleValues = { resolution: 'settle' as const, settlePriceCents: deskSettledBreakdown.taskPriceCents, summary: c.previewSummary };
const refundValues = { amountCents: settleAt45Preview.posterRefundCents, reason: 'goodwill' as const, note: b.previewNote };
const previewValidation: ResolutionPreviewResult = { ok: false, code: 'validation_failed', fieldErrors: { settlePriceCents: ['out_of_range'] } };
const refundValidation: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { amountCents: ['out_of_range'], note: ['too_short'] } };
const reasonValidation: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } };

export const adminMoneyPreviews: PreviewEntry[] = [
  moneyCasePreview('resolve-money', c['resolve-money'], {
    initialValues: { resolution: 'release_full', summary: c.previewSummary },
    initialPreview: { ok: true, preview: releaseFullPreview },
  }),
  moneyCasePreview('settle-preview', c['settle-preview'], { initialValues: settleValues, initialPreview: { ok: true, preview: settleAt45Preview } }),
  moneyCasePreview('over-limit', c['over-limit'], {
    initialValues: { resolution: 'refund_full', summary: c.previewSummary },
    initialPreview: { ok: true, preview: overLimitPreview },
  }),
  moneyCasePreview('goodwill-refund', c['goodwill-refund'], {
    initialValues: { resolution: 'goodwill_refund', goodwillCents: overLimitPreview.posterRefundCents, summary: c.previewSummary },
    initialPreview: { ok: true, preview: overLimitPreview },
  }, { ...disputeMoneyCaseData, resolutions: [...disputeMoneyCaseData.resolutions, 'goodwill_refund'] }),
  moneyCasePreview('preview-pending', c['preview-pending'], { initialValues: settleValues, initialPreviewPending: true }),
  moneyCasePreview('preview-validation-failed', c['preview-validation-failed'], {
    initialValues: { ...settleValues, settlePriceCents: disputeMoneyCaseData.money!.priceCents }, initialPreview: previewValidation,
  }),
  moneyCasePreview('preview-not-allowed', c['preview-not-allowed'], { initialValues: settleValues, initialPreview: { ok: false, code: 'not_allowed' } }),
  moneyCasePreview('preview-unknown', c['preview-unknown'], { initialValues: settleValues, initialPreview: { ok: false, code: 'unknown' } }),
  bookingPreview('disputed', b.disputed),
  bookingPreview('settled', b.settled, adminBookingSettledData),
  bookingPreview('read-only', b['read-only'], adminBookingReadOnlyData),
  bookingPreview('paid-directly', b['paid-directly'], adminBookingDirectData),
  bookingPreview('address-revealed', b['address-revealed'], adminBookingDisputedData, { initialAddress: deskExactAddress }),
  bookingPreview('refund-form', b['refund-form'], adminBookingDisputedData, { initialDialog: 'refund', refundState: { initialValues: refundValues } }),
  bookingPreview('refund-over-limit', b['refund-over-limit'], adminBookingDisputedData, {
    initialDialog: 'refund', refundState: { initialValues: { ...refundValues, amountCents: overLimitPreview.posterRefundCents }, initialResult: { ok: false, code: 'not_allowed' } },
  }),
  bookingPreview('refund-pending', b['refund-pending'], adminBookingDisputedData, { initialDialog: 'refund', refundState: { initialValues: refundValues, initialPending: true } }),
  bookingPreview('refund-request', b['refund-request'], adminBookingRefundRequestData),
  bookingPreview('refund-request-dialog', b['refund-request-dialog'], adminBookingRefundRequestData, { initialDecision: { requestId: 'rrq_moving', decision: 'approve' } }),
  bookingPreview('refund-ask-approval', b['refund-ask-approval'], adminBookingRefundRequestData, { initialDialog: 'refund', refundState: { initialValues: { ...refundValues, amountCents: 12000 } } }),
  bookingPreview('refund-submitted', b['refund-submitted'], adminBookingDisputedData, { initialDialog: 'refund', refundState: { initialResult: { ok: true, code: 'submitted' } } }),
  bookingPreview('refund-validation-failed', b['refund-validation-failed'], adminBookingDisputedData, { initialDialog: 'refund', refundState: { initialValues: refundValues, initialResult: refundValidation } }),
  ...(['not_allowed', 'rate_limited', 'unknown'] as const).map((code) => {
    const id = `refund-${code.replaceAll('_', '-')}` as 'refund-not-allowed' | 'refund-rate-limited' | 'refund-unknown';
    return bookingPreview(id, b[id], adminBookingDisputedData, {
      initialDialog: 'refund', refundState: { initialValues: refundValues, initialResult: { ok: false, code } },
    });
  }),
  bookingPreview('conversation-revealed', b['conversation-revealed'], adminBookingDisputedData, { initialConversation: reportedConversation }),
  bookingPreview('reason-dialog', b['reason-dialog'], adminBookingDisputedData, { initialDialog: 'reveal_address' }),
  bookingPreview('reason-validation-failed', b['reason-validation-failed'], adminBookingDisputedData, { initialDialog: 'reveal_address', reasonState: { initialResult: reasonValidation } }),
  ...(['not_allowed', 'unknown'] as const).map((code) => {
    const id = `reason-${code.replaceAll('_', '-')}` as 'reason-not-allowed' | 'reason-unknown';
    return bookingPreview(id, b[id], adminBookingDisputedData, {
      initialDialog: 'reveal_address', reasonState: { initialReason: b.previewReason, initialResult: { ok: false, code } },
    });
  }),
];
