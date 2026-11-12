import type { ComponentProps, ReactNode } from 'react';
import { ACTION_ERROR_CODES, routes, type ActionResult, type AdminCaseHandlers, type AdminCasePageData, type PreviewEntry } from '@/contracts';
import { ADMIN_NOW, adminHomeData, adminHomeQuietData, adminCasesPageData, adminCasesFilteredData, adminCasesEmptyData, alexStaff, disputeAdminCaseData, reportAdminCaseData, resolvedAdminCaseData, reviewHiddenAdminCaseData, reviewReportAdminCaseData, reviewReportAgentCaseData, reportedConversation, fakeAdminCaseHandlers, fakeHandler } from '@/fixtures';
import { AdminHomeScreen, AdminCasesScreen } from '@/ui/screens/admin';
import { AdminCaseContent } from '@/ui/screens/admin/admin-case-screen';
import { AdminShell } from '@/ui/shells/admin-shell';
import copy from '../../../messages/en/ui/adminCase.json';
import homeCopy from '../../../messages/en/ui/adminHome.json';
import listCopy from '../../../messages/en/ui/adminCases.json';
import feedbackCopy from '../../../messages/en/ui/feedback.json';

const p = copy.previews;
const shellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: AdminCaseHandlers = {
  ...fakeAdminCaseHandlers,
  onAssign: fakeHandler({ ok: true, code: 'updated' }),
  onSetStatus: fakeHandler({ ok: true, code: 'updated' }),
  onReply: fakeHandler({ ok: true, code: 'sent' }),
  onAddNote: fakeHandler({ ok: true, code: 'saved' }),
  onResolve: fakeHandler({ ok: true, code: 'saved' }),
  onClose: fakeHandler({ ok: true, code: 'updated' }),
  onReopen: fakeHandler({ ok: true, code: 'updated' }),
};

function Shell({ path, children, detail = false }: { path: string; children: ReactNode; detail?: boolean }) {
  return <AdminShell viewer={alexStaff} handlers={shellHandlers} currentPath={path} breadcrumbs={detail ? [
    { label: homeCopy.title, href: routes.admin.home() },
    { label: listCopy.title, href: routes.admin.cases() },
    { label: p.breadcrumb },
  ] : undefined}>{children}</AdminShell>;
}

type CaseSeeds = Pick<ComponentProps<typeof AdminCaseContent>, 'initialDialog' | 'replyState' | 'conversationState'>;
function casePreview(id: string, title: string, data: AdminCasePageData, seeds: CaseSeeds = {}): PreviewEntry {
  const result = seeds.replyState?.initialResult;
  return {
    id: `screen-admin-case/${id}`, group: p.group, title, layout: 'fullscreen',
    render: () => <Shell path={routes.admin.case(data.case.id)} detail><AdminCaseContent data={data} handlers={{ ...handlers, onReply: fakeHandler(result ?? { ok: true, code: 'sent' }) }} now={ADMIN_NOW} {...seeds} /></Shell>,
  };
}

const replyValidation: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { partyId: ['required'], body: ['required'] } };
export const adminPreviews: PreviewEntry[] = [
  { id: 'screen-admin-home/default', group: p.homeGroup, title: p.default, layout: 'fullscreen', render: () => <Shell path={routes.admin.home()}><AdminHomeScreen data={adminHomeData} now={ADMIN_NOW} /></Shell> },
  { id: 'screen-admin-home/quiet', group: p.homeGroup, title: p.quiet, layout: 'fullscreen', render: () => <Shell path={routes.admin.home()}><AdminHomeScreen data={adminHomeQuietData} now={ADMIN_NOW} /></Shell> },
  { id: 'screen-admin-cases/default', group: p.casesGroup, title: p.list, layout: 'fullscreen', render: () => <Shell path={routes.admin.cases()}><AdminCasesScreen data={adminCasesPageData} now={ADMIN_NOW} /></Shell> },
  { id: 'screen-admin-cases/filtered', group: p.casesGroup, title: p.filtered, layout: 'fullscreen', render: () => <Shell path={routes.admin.cases(adminCasesFilteredData.filters)}><AdminCasesScreen data={adminCasesFilteredData} now={ADMIN_NOW} /></Shell> },
  { id: 'screen-admin-cases/empty', group: p.casesGroup, title: p.empty, layout: 'fullscreen', render: () => <Shell path={routes.admin.cases(adminCasesEmptyData.filters)}><AdminCasesScreen data={adminCasesEmptyData} now={ADMIN_NOW} /></Shell> },
  casePreview('dispute', p.dispute, disputeAdminCaseData),
  casePreview('report', p.report, reportAdminCaseData),
  casePreview('resolved', p.resolved, resolvedAdminCaseData),
  casePreview('review-report', p['review-report'], reviewReportAdminCaseData),
  casePreview('review-hidden', p['review-hidden'], reviewHiddenAdminCaseData),
  casePreview('review-agent', p['review-agent'], reviewReportAgentCaseData),
  casePreview('conversation-revealed', p['conversation-revealed'], reportAdminCaseData, { conversationState: { initialConversation: reportedConversation } }),
  casePreview('conversation-reason', p['conversation-reason'], reportAdminCaseData, { conversationState: { initialOpen: true, initialResult: { ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } } } }),
  casePreview('reply-validation-failed', p['reply-validation-failed'], disputeAdminCaseData, { replyState: { initialResult: replyValidation } }),
  casePreview('resolve-dialog', p['resolve-dialog'], disputeAdminCaseData, { initialDialog: 'resolve' }),
  casePreview('sending', p.sending, disputeAdminCaseData, { replyState: { initialPending: true, initialBody: p.draft } }),
  casePreview('sent', p.sent, disputeAdminCaseData, { replyState: { initialResult: { ok: true, code: 'sent' } } }),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'validation_failed').map((code) => casePreview(`reply-${code.replaceAll('_', '-')}`, feedbackCopy.error[code], disputeAdminCaseData, { replyState: { initialBody: p.draft, initialResult: { ok: false, code, ...(code === 'rate_limited' ? { retryAt: '2026-11-23T16:05:00.000Z' } : {}) } } })),
];
