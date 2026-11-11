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
  }
}
