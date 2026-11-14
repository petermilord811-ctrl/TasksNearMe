import { routes, type AttentionTarget } from '@/contracts';

/** Home attention items and notifications share the same typed destinations. */
export function attentionHref(target: AttentionTarget): string {
  switch (target.kind) {
    case 'booking': return routes.app.booking(target.bookingId);
    case 'task': return routes.app.task(target.taskId);
    case 'thread': return routes.app.thread(target.threadId);
    case 'messages': return routes.app.messages();
    case 'find_work_task': return routes.app.findWorkTask(target.taskId);
    case 'onboarding': return routes.app.helperOnboarding(target.step);
    case 'earnings': return routes.app.earnings();
    case 'support_case': return routes.app.supportCase(target.caseId);
    case 'invite': return routes.app.offers(target.inviteId);
    case 'proposal': return routes.app.proposal(target.proposalId);
    case 'series': return routes.app.series(target.seriesId);
    case 'account': return routes.app.account();
    case 'verify_identity': return routes.app.verifyIdentity();
    case 'rewards': return routes.app.rewards();
    case 'community_post': return routes.app.communityPost(target.postId);
  }
}
