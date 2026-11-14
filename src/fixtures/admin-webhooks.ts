import type { AdminWebhooksHandlers, AdminWebhooksPageData } from '@/contracts';
import { fakeHandler } from './actions';

/** The webhook inbox at `ADMIN_NOW` (completion plan 5.11): a dead Stripe payment event, a Checkr retry, and a calm day. */

export const adminWebhooksFailingData: AdminWebhooksPageData = {
  failing: [
    {
      id: 'whk_dead_pi',
      provider: 'stripe',
      eventId: 'evt_1QxDeadPaymentIntent',
      type: 'payment_intent.succeeded',
      status: 'dead',
      attempts: 5,
      lastError: 'Error: connect ECONNREFUSED 127.0.0.1:54329',
      receivedAt: '2026-11-22T21:04:00.000Z',
      canReplay: true,
    },
    {
      id: 'whk_retry_checkr',
      provider: 'checkr',
      eventId: 'evt_checkr_report_7f3a',
      type: 'report.completed',
      status: 'failed',
      attempts: 2,
      lastError: 'Error: deadlock detected',
      receivedAt: '2026-11-23T15:20:00.000Z',
      nextAttemptAt: '2026-11-23T15:50:00.000Z',
      canReplay: false,
    },
  ],
  last24h: [
    { provider: 'stripe', processed: 184, ignored: 41, failed: 0, dead: 1 },
    { provider: 'checkr', processed: 6, ignored: 2, failed: 1, dead: 0 },
    { provider: 'resend', processed: 12, ignored: 230, failed: 0, dead: 0 },
    { provider: 'persona', processed: 3, ignored: 1, failed: 0, dead: 0 },
  ],
  canAct: true,
};

export const adminWebhooksCalmData: AdminWebhooksPageData = {
  failing: [],
  last24h: adminWebhooksFailingData.last24h.map((item) => ({ ...item, failed: 0, dead: 0 })),
  canAct: true,
};

export const fakeAdminWebhooksHandlers: AdminWebhooksHandlers = { onAction: fakeHandler({ ok: true, code: 'updated' }) };
