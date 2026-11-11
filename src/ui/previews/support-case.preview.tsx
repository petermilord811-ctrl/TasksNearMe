import { CASE_STATUSES, routes, type ActionResult, type AppShellHandlers, type PreviewEntry, type SupportCasePageData } from '@/contracts';
import { closedCasePageData, disputeCasePageData, fakeHandler, fakeSupportCaseHandlers, mayaShell } from '@/fixtures';
import { SupportCaseContent } from '@/ui/screens/support/support-case-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/supportCase.json';
import statusCopy from '../../../messages/en/ui/status.json';

const now = '2026-11-23T18:30:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function preview(id: string, title: string, data: SupportCasePageData, options: { result?: ActionResult; pending?: boolean } = {}): PreviewEntry {
  return {
    id: `screen-support-case/${id}`, group: copy.previews.group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.supportCase(data.case.id)} layout="flow">
      <SupportCaseContent data={data} now={now} handlers={{ ...fakeSupportCaseHandlers, onReply: fakeHandler(options.result ?? { ok: true, code: 'sent' }, options.pending ? 60_000 : 400) }} replyState={{
        initialResult: options.result, initialPending: options.pending,
        initialBody: options.pending || (options.result && !options.result.ok) ? copy.previews.draft : undefined,
      }} />
    </AppShell>,
  };
}

export const supportCasePreviews: PreviewEntry[] = [
  preview('open', copy.previews.open, disputeCasePageData),
  preview('closed', copy.previews.closed, closedCasePageData),
  preview('empty', copy.previews.empty, { ...disputeCasePageData, events: [] }),
  preview('sending', copy.previews.sending, disputeCasePageData, { pending: true }),
  preview('sent', copy.previews.sent, disputeCasePageData, { result: { ok: true, code: 'sent' } }),
  ...(['validation_failed', 'not_allowed', 'rate_limited', 'unknown'] as const).map((code) => {
    const id = code.replaceAll('_', '-') as 'validation-failed' | 'not-allowed' | 'rate-limited' | 'unknown';
    return preview(id, copy.previews[id], disputeCasePageData, { result: {
      ok: false, code,
      ...(code === 'validation_failed' ? { fieldErrors: { body: ['required' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: '2026-11-23T18:35:00.000Z' } : {}),
    } });
  }),
  ...CASE_STATUSES.filter((status) => status !== 'closed' && status !== 'awaiting_poster').map((status) => preview(`status-${status.replaceAll('_', '-')}`, statusCopy.case[status], {
    ...disputeCasePageData,
    case: { ...disputeCasePageData.case, status },
    events: [{ id: `preview-${status}`, kind: 'status', from: 'system', status, at: disputeCasePageData.case.updatedAt }],
  })),
];
