import type { PreviewEntry } from '@/contracts';
import { deskCompletionSubmittedPosterActions, deskBeforeNoShowPosterActions, deskDayOfHelperActions } from '@/fixtures';
import { ActionPreview, ResultPreview } from './actions-examples';
import feedbackCopy from '../../../messages/en/ui/feedback.json';

export const actionPreviews: PreviewEntry[] = [
  { id: 'action-bar/approve-confirm', group: feedbackCopy.preview.group, title: feedbackCopy.preview.approveConfirm, render: () => <ActionPreview actions={deskCompletionSubmittedPosterActions} /> },
  { id: 'action-bar/disabled-reason', group: feedbackCopy.preview.group, title: feedbackCopy.preview.disabledReason, render: () => <ActionPreview actions={deskBeforeNoShowPosterActions} /> },
  { id: 'action-bar/day-of-helper', group: feedbackCopy.preview.group, title: feedbackCopy.preview.dayOfHelper, render: () => <ActionPreview actions={deskDayOfHelperActions} result={{ ok: true, code: 'updated' }} /> },
  { id: 'action-bar/error-result', group: feedbackCopy.preview.group, title: feedbackCopy.preview.errorResult, render: () => <ActionPreview actions={deskCompletionSubmittedPosterActions} result={{ ok: false, code: 'payment_declined' }} /> },
  { id: 'action-bar/all-results', group: feedbackCopy.preview.group, title: feedbackCopy.preview.allResults, render: () => <ResultPreview /> },
];
