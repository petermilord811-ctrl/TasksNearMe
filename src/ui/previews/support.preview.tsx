import { CASE_STATUSES, MEMBER_CASE_KINDS, routes, type ActionResult, type AppShellHandlers, type PreviewEntry, type SupportHandlers, type SupportPageData } from '@/contracts';
import { fakeHandler, fakeSupportHandlers, mayaShell, mayaSupportPageData, supportEmptyData } from '@/fixtures';
import { SupportContent } from '@/ui/screens/support/support-screen';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/support.json';
import feedback from '../../../messages/en/ui/feedback.json';

const now = '2026-11-23T18:30:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function preview(variant: string, title: string, data: SupportPageData = mayaSupportPageData, options: { initialResult?: ActionResult; initialPending?: boolean } = {}): PreviewEntry {
  const handlers: SupportHandlers = {
    ...fakeSupportHandlers,
    onCreate: fakeHandler(options.initialResult ?? { ok: true, code: 'submitted', redirectTo: routes.app.supportCase('case_new') }, options.initialPending ? 60_000 : 400),
  };
  return {
    id: `screen-support/${variant}`, title, group: copy.previews.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.support()}>
      <SupportContent data={data} handlers={handlers} now={now} {...options} />
    </AppShell>,
  };
}

export const supportPreviews: PreviewEntry[] = [
  preview('default', copy.previews.default),
  preview('empty', copy.previews.empty, supportEmptyData),
  preview('validation-failed', copy.previews.validationFailed, mayaSupportPageData, { initialResult: { ok: false, code: 'validation_failed', fieldErrors: { topic: ['required'], description: ['too_short'] } } }),
  preview('submitting', copy.previews.submitting, mayaSupportPageData, { initialPending: true }),
  preview('submitted', copy.previews.submitted, mayaSupportPageData, { initialResult: { ok: true, code: 'submitted' } }),
  ...(['rate_limited', 'unknown'] as const).map((code) => preview(code.replaceAll('_', '-'), feedback.error[code], mayaSupportPageData, { initialResult: { ok: false, code } })),
  preview('all-statuses', copy.previews.statuses, {
    ...mayaSupportPageData,
    cases: CASE_STATUSES.map((status, index) => ({ ...mayaSupportPageData.cases[0]!, id: `case_${status}`, status, kind: MEMBER_CASE_KINDS[index % MEMBER_CASE_KINDS.length]! })),
  }),
];
