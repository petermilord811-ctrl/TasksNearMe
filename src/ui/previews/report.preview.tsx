import { routes, type AppShellHandlers, type PreviewEntry, type ReportPageData, type ReportPageHandlers } from '@/contracts';
import { fakeHandler, jordanShell, reportAnswerData, reportHelperData, reportReviewData, reportTaskData } from '@/fixtures';
import { ReportContent } from '@/ui/screens/support';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/report.json';

const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: ReportPageHandlers = { onReport: fakeHandler({ ok: true, code: 'submitted' }) };
const p = copy.previews;

function report(id: string, title: string, data: ReportPageData, seeds: Partial<Parameters<typeof ReportContent>[0]> = {}): PreviewEntry {
  return {
    id: `screen-report/${id}`, group: p.group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={jordanShell} handlers={shellHandlers} layout="flow" currentPath={routes.app.report(data.target.kind, data.target.id)}><ReportContent data={data} handlers={handlers} {...seeds} /></AppShell>,
  };
}

export const reportPreviews: PreviewEntry[] = [
  report('task', p.task, reportTaskData),
  report('helper', p.helper, reportHelperData),
  report('review', p.review, reportReviewData),
  report('answer', p.answer, reportAnswerData),
  report('submitted', p.submitted, reportTaskData, { initialResult: { ok: true, code: 'submitted' }, initialValues: { reason: 'scam_or_fraud', details: 'The task asks helpers to pay a deposit by gift card first.' } }),
  report('errors', p.errors, reportTaskData, { initialResult: { ok: false, code: 'validation_failed', fieldErrors: { reason: ['required'], details: ['too_short'] } } }),
];
