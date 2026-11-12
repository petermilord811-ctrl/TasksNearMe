import type { ReportPageData } from '@/contracts';
import { routes } from '@/contracts';

/** Report pages (B-059): a task, a helper's profile, and a review. */
export const reportTaskData: ReportPageData = {
  target: { kind: 'task', id: 'tsk_desk', name: 'Assemble a desk (flat-pack, 1 item)' },
  backHref: routes.publicTask('assemble-a-desk-mueller-7f3k'),
};

export const reportHelperData: ReportPageData = {
  target: { kind: 'helper', id: 'sam-k', name: 'Sam K.' },
  backHref: routes.helperProfile('sam-k'),
};

export const reportReviewData: ReportPageData = {
  target: { kind: 'review', id: 'rev_maya_sam', name: 'Maya R.' },
  backHref: routes.helperProfile('sam-k'),
};
