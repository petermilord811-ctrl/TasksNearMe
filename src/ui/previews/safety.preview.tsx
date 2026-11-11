import { ACTION_ERROR_CODES, routes, type ActionResult, type AppShellHandlers, type PreviewEntry } from '@/contracts';
import { blockedReportSubject, blockedThreadPageData, deskBookingThreadPageData, fakeHandler, fakeReportHandlers, fakeThreadHandlers, jordanReportSubject, mayaShell } from '@/fixtures';
import { ThreadScreen } from '@/ui/screens/messages';
import { AppShell } from '@/ui/shells/app-shell';
import { ReportExample } from './safety-examples';
import copy from '../../../messages/en/ui/safety.json';
import feedback from '../../../messages/en/ui/feedback.json';

const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function reportPreview(variant: string, title: string, result?: ActionResult, pending?: boolean): PreviewEntry {
  return { id: `component-report-dialog/${variant}`, group: copy.previews.group, title, render: () => <ReportExample result={result} pending={pending} /> };
}

export const safetyPreviews: PreviewEntry[] = [
  ...[false, true].map((blocked): PreviewEntry => ({
    id: `screen-thread/${blocked ? 'blocked-by-me' : 'with-safety-menu'}`,
    group: copy.previews.threadGroup,
    title: copy.previews[blocked ? 'blockedByMe' : 'withSafety'],
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(deskBookingThreadPageData.thread.id)} layout="flow">
      <ThreadScreen data={blocked ? blockedThreadPageData : deskBookingThreadPageData} handlers={fakeThreadHandlers} now="2026-11-21T16:05:00.000Z" safety={{ subject: blocked ? blockedReportSubject : jordanReportSubject, handlers: { ...fakeReportHandlers, onReport: fakeHandler({ ok: true, code: 'submitted' }), onBlock: fakeHandler({ ok: true, code: 'updated' }) } }} />
    </AppShell>,
  })),
  reportPreview('default', copy.previews.default),
  reportPreview('validation-failed', copy.previews['validation-failed'], { ok: false, code: 'validation_failed', fieldErrors: { reason: ['required'], details: ['too_short'] } }),
  reportPreview('submitted', copy.previews.submitted, { ok: true, code: 'submitted' }),
  reportPreview('submitting', copy.previews.submitting, undefined, true),
  ...ACTION_ERROR_CODES.filter((code) => code !== 'validation_failed').map((code) => reportPreview(`result-${code.replaceAll('_', '-')}`, feedback.error[code], { ok: false, code })),
];
