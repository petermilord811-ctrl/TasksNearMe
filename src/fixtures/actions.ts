import type { ActionDescriptor, ActionHandler, BookingActionId } from '@/contracts';
import { DESK_TIMES } from './timeline';

/** Example action sets, as the app's getBookingActions would return them. */

/** Maya, desk waiting for approval. */
export const deskCompletionSubmittedPosterActions: ActionDescriptor<BookingActionId>[] = [
  { id: 'approve', kind: 'primary', enabled: true, confirm: true },
  { id: 'report_problem', kind: 'secondary', enabled: true },
  { id: 'message', kind: 'secondary', enabled: true },
  { id: 'contact_support', kind: 'secondary', enabled: true },
];

/** Maya, Sat 10:50 am: Jordan hasn't checked in yet; no-show reporting opens at 11:00 am. */
export const deskBeforeNoShowPosterActions: ActionDescriptor<BookingActionId>[] = [
  { id: 'message', kind: 'primary', enabled: true },
  { id: 'propose_change', kind: 'secondary', enabled: true },
  { id: 'report_no_show', kind: 'destructive', enabled: false, disabledReason: { code: 'available_at', at: DESK_TIMES.noShowReportable } },
  { id: 'cancel', kind: 'destructive', enabled: true, confirm: true },
  { id: 'safety_report', kind: 'secondary', enabled: true },
];

/** Jordan, desk confirmed, day of the task. */
export const deskDayOfHelperActions: ActionDescriptor<BookingActionId>[] = [
  { id: 'arrived', kind: 'primary', enabled: true },
  { id: 'running_late', kind: 'secondary', enabled: true },
  { id: 'view_address', kind: 'secondary', enabled: true },
  { id: 'message', kind: 'secondary', enabled: true },
  { id: 'propose_change', kind: 'secondary', enabled: false, disabledReason: { code: 'open_change_exists' } },
  { id: 'cancel', kind: 'destructive', enabled: true, confirm: true },
  { id: 'safety_report', kind: 'secondary', enabled: true },
];

/** A fake handler for previews and tests: resolves after `delayMs` with the given result. */
export function fakeHandler<TInput = void>(
  result: Awaited<ReturnType<ActionHandler<TInput>>> = { ok: true, code: 'saved' },
  delayMs = 600,
): ActionHandler<TInput> {
  return () => new Promise((resolve) => setTimeout(() => resolve(result), delayMs));
}
