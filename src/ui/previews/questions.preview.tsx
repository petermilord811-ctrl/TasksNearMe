import type { AppShellHandlers, PreviewEntry, TaskQuestionHandlers, TaskQuestionsData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { fakeHandler, jordanShell, mayaShell, taskQuestionsAskedData, taskQuestionsClosedHelperData, taskQuestionsClosedPosterData, taskQuestionsHelperData, taskQuestionsPosterData } from '@/fixtures';
import { TaskQuestions } from '@/ui/components/questions/task-questions';
import { AppShell } from '@/ui/shells/app-shell';
import copy from '../../../messages/en/ui/questions.json';

const now = '2026-11-17T15:00:00.000Z';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const handlers: TaskQuestionHandlers = {
  onAsk: fakeHandler({ ok: true, code: 'sent' }),
  onAnswer: fakeHandler({ ok: true, code: 'sent' }),
  onPin: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
};
const p = copy.previews;

function preview(id: string, title: string, data: TaskQuestionsData, poster = false): PreviewEntry {
  return {
    id: `component-task-questions/${id}`, group: p.group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={poster ? mayaShell : jordanShell} handlers={shellHandlers} currentPath={poster ? routes.app.task(data.taskId) : routes.app.findWorkTask(data.taskId)}><TaskQuestions data={data} handlers={handlers} now={now} /></AppShell>,
  };
}

export const questionPreviews: PreviewEntry[] = [
  preview('helper', p.helper, taskQuestionsHelperData),
  preview('poster', p.poster, taskQuestionsPosterData, true),
  preview('asked', p.asked, taskQuestionsAskedData),
  preview('closed-poster', p.closedPoster, taskQuestionsClosedPosterData, true),
  preview('closed-helper', p.closedHelper, taskQuestionsClosedHelperData),
];
