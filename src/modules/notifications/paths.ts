import type { AttentionTarget } from '@/contracts';
import { routes } from '@/contracts';

/** The app page a notification is about (its button, link and short link lead there; the language prefix comes after). */
export function notificationPath(target: AttentionTarget): string {
  switch (target.kind) {
    case 'booking':
      return routes.app.booking(target.bookingId);
    case 'task':
      return routes.app.task(target.taskId);
    case 'thread':
      return routes.app.thread(target.threadId);
    case 'messages':
      return routes.app.messages();
    case 'find_work_task':
      return routes.app.findWorkTask(target.taskId);
    case 'onboarding':
      return routes.app.helperOnboarding(target.step);
    case 'earnings':
      return routes.app.earnings();
    case 'support_case':
      return routes.app.supportCase(target.caseId);
    case 'invite':
      return routes.app.offers(target.inviteId);
    case 'proposal':
      return routes.app.proposal(target.proposalId);
    case 'series':
      return routes.app.series(target.seriesId);
    case 'account':
      return routes.app.account();
    case 'community_post':
      return routes.app.communityPost(target.postId);
    case 'neighbor_group':
      return routes.app.neighborGroup(target.groupId);
    case 'saved_search':
      return routes.app.savedSearch(target.searchId);
    case 'booking_review':
      return routes.app.bookingReview(target.bookingId);
    case 'new_task':
      return routes.app.newTask();
    case 'saved_searches':
      return routes.app.savedSearches();
    case 'verify_identity':
      return routes.app.verifyIdentity();
    case 'rewards':
      return routes.app.rewards();
    case 'community':
      return routes.app.community();
  }
}
