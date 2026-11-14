import type { TaskQuestionsData, TaskQuestionView } from '@/contracts';

/** Questions on Ben's leaf cleanup (completion plan 7.9), as the questions service returns them. */

const answered: TaskQuestionView = {
  id: 'tqn_gate',
  asker: { displayName: 'Lee M.', initials: 'LM', isYou: false },
  body: 'Is the side gate unlocked, or should I knock when I arrive?',
  answer: { body: 'The side gate is unlocked. The paper bags are in the garage, on the left.', answeredAt: '2026-11-17T14:10:00.000Z' },
  pinned: true,
  createdAt: '2026-11-17T13:30:00.000Z',
};
const open: TaskQuestionView = {
  id: 'tqn_rakes',
  asker: { displayName: 'Jordan T.', initials: 'JT', isYou: false },
  body: 'Do you have rakes, or should I bring mine?',
  pinned: false,
  createdAt: '2026-11-17T14:40:00.000Z',
};

/** A helper who can ask. */
export const taskQuestionsHelperData: TaskQuestionsData = { taskId: 'tsk_yard', questions: [answered, open], viewer: { isPoster: false, canAsk: true, isStaff: false } };

/** The poster: answer the open one, pin or edit the answered one. */
export const taskQuestionsPosterData: TaskQuestionsData = { taskId: 'tsk_yard', questions: [answered, open], viewer: { isPoster: true, canAsk: false, askBlocked: 'poster', isStaff: false } };

/** The helper asked and waits for the answer. */
export const taskQuestionsAskedData: TaskQuestionsData = {
  taskId: 'tsk_yard',
  questions: [answered, { ...open, asker: { displayName: 'Jordan T.', initials: 'JT', isYou: true } }],
  viewer: { isPoster: false, canAsk: false, askBlocked: 'already_asked', isStaff: false },
};
