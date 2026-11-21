/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskQuestionHandlers, TaskQuestionsData } from '@/contracts';
import { fakeHandler, taskQuestionsClosedHelperData, taskQuestionsClosedPosterData, taskQuestionsHelperData, taskQuestionsPosterData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/questions.json';
import { TaskQuestions } from './task-questions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); window.sessionStorage.clear(); });

const handlers: TaskQuestionHandlers = {
  onAsk: fakeHandler({ ok: true, code: 'sent' }),
  onAnswer: fakeHandler({ ok: true, code: 'sent' }),
  onPin: fakeHandler({ ok: true, code: 'updated' }),
  onDelete: fakeHandler({ ok: true, code: 'updated' }),
};

function show(data: TaskQuestionsData) {
  return render(
    <NextIntlClientProvider locale="en" messages={uiMessages} timeZone="America/Chicago">
      <TaskQuestions data={data} handlers={handlers} now="2026-11-17T15:00:00.000Z" />
    </NextIntlClientProvider>,
  );
}

describe('TaskQuestions', () => {
  it('keeps a question being typed across a reload, until it is sent (journeys on a phone, as J-H7 for offers)', async () => {
    const user = userEvent.setup();
    show(taskQuestionsHelperData);
    await user.type(screen.getByLabelText(copy.ask.label), 'Is the dresser already out of its box?');
    // A reload: the page comes back with what was typed.
    cleanup();
    show(taskQuestionsHelperData);
    await waitFor(() => expect(screen.getByLabelText(copy.ask.label)).toHaveValue('Is the dresser already out of its box?'));
    // Sent: the words go, from the box and from the tab.
    await user.click(screen.getByRole('button', { name: copy.ask.submit }));
    await waitFor(() => expect(screen.getByLabelText(copy.ask.label)).toHaveValue(''));
    expect(window.sessionStorage.getItem(`tnm:question:${taskQuestionsHelperData.taskId}`)).toBeNull();
  });

  it('gives the poster answer, edit and pin while questions are open', () => {
    show(taskQuestionsPosterData);
    expect(screen.getByRole('textbox', { name: copy.answer.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.answer.edit })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.unpin })).toBeInTheDocument();
    expect(screen.queryByText(copy.closedPoster)).not.toBeInTheDocument();
  });

  it('closes them for the poster once the task is booked or its window started (sweep QA1)', () => {
    show(taskQuestionsClosedPosterData);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.answer.edit })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.unpin })).not.toBeInTheDocument();
    expect(screen.getByText(copy.closedPoster)).toBeInTheDocument();
    // The open question will stay unanswered; the answered one is still there to read.
    expect(screen.getByText(copy.answer.none)).toBeInTheDocument();
    expect(screen.getByText(taskQuestionsClosedPosterData.questions[0]!.answer!.body)).toBeInTheDocument();
  });

  it("lets helpers, the asker included, report the poster's answer, never the poster (sweep QA3)", () => {
    const menu = (name: string) => ({ name: `More: ${copy.answer.menuLabel.replace('{name}', name)}` });
    show(taskQuestionsHelperData);
    expect(screen.getByRole('button', menu('Lee M.'))).toBeInTheDocument();
    cleanup();
    show(taskQuestionsClosedHelperData);
    expect(screen.getByRole('button', menu('Lee M.'))).toBeInTheDocument();
    expect(screen.getByText(copy.blocked.closed)).toBeInTheDocument();
    cleanup();
    show(taskQuestionsPosterData);
    expect(screen.queryByRole('button', menu('Lee M.'))).not.toBeInTheDocument();
  });
});
