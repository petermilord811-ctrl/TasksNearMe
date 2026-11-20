import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { ISODateTime } from './common';

/**
 * `/admin/webhooks` (completion plan 5.11): the webhook inbox's failures. Admins and finance see what's failing
 * or dead, why, and when it's tried again, and replay or dismiss it; the last day's counts per provider show
 * whether events are flowing at all.
 */

const code = (value: FieldErrorCode) => value;

export const WEBHOOK_PROVIDER_IDS = ['stripe', 'checkr', 'resend', 'persona'] as const;
export type WebhookProviderId = (typeof WEBHOOK_PROVIDER_IDS)[number];

export interface AdminWebhookRow {
  id: string;
  provider: WebhookProviderId;
  eventId: string;
  /** The provider's event type ("payment_intent.succeeded"); empty when it had none. */
  type: string;
  /** `failed`: tried again at `nextAttemptAt`. `dead`: no more tries. */
  status: 'failed' | 'dead';
  attempts: number;
  lastError?: string;
  receivedAt: ISODateTime;
  nextAttemptAt?: ISODateTime;
  /** The provider's keys are set, so it can be replayed now. */
  canReplay: boolean;
}

export interface AdminWebhooksPageData {
  /** Dead first, then failed; oldest first within each (up to 100). */
  failing: AdminWebhookRow[];
  /** The last 24 hours, per provider. */
  last24h: { provider: WebhookProviderId; processed: number; ignored: number; failed: number; dead: number }[];
  /** Admins and finance replay and dismiss. */
  canAct: boolean;
}

export const webhookActionInputSchema = z
  .object({
    eventRowId: z.string(code('required')).min(1, code('required')),
    action: z.enum(['replay', 'dismiss'], code('required')),
    /** Dismissing says why (security review SEC24): it goes in the audit log. */
    reason: z.string(code('invalid')).trim().max(500, code('too_long')).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.action === 'dismiss' && (input.reason ?? '').length < 10) ctx.addIssue({ code: 'custom', path: ['reason'], message: (input.reason ?? '') === '' ? 'required' : 'too_short' });
  });
export type WebhookActionInput = z.input<typeof webhookActionInputSchema>;

/**
 * `onAction`: ok `updated` (processed now, or dismissed). Errors: `not_allowed` (your role, or it isn't
 * failing any more), `unknown` (the replay failed again: its row shows the new error).
 */
export interface AdminWebhooksHandlers {
  onAction: ActionHandler<WebhookActionInput>;
}
