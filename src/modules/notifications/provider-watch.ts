import type { Page } from '@/modules/oncall/pager';
import type { DeliveryOutcomes } from './delivery';

/**
 * An email or text provider that's down, as the delivery runs see it (when things break, 2026-11-21). Each failed send
 * is retried later and shown to staff on the person's page, but nobody heard that every send was failing; meanwhile
 * sign-in codes by that channel fail too. The job runner keeps the counts in memory and pages the staff on call: the
 * page also goes by the other channel, so an email outage reaches them by text.
 */

/** Runs in a row where a channel's sends all failed (runs with nothing to send don't count either way). */
export const OUTAGE_RUNS_TO_PAGE = 3;
/** Failed sends over those runs, at least: one person's bad address isn't an outage. */
export const OUTAGE_FAILURES_TO_PAGE = 3;

export type OutageState = Map<string, { runs: number; failed: number; paged: boolean }>;

/** Notes one run; returns the channels that just started counting as down (each pages once until a send goes out). */
export function noteDeliveryRun(state: OutageState, outcomes: DeliveryOutcomes): { channel: string; failed: number }[] {
  const reached: { channel: string; failed: number }[] = [];
  for (const [channel, { sent, failed }] of Object.entries(outcomes)) {
    if (sent > 0) {
      state.delete(channel);
      continue;
    }
    if (failed === 0) continue;
    const before = state.get(channel) ?? { runs: 0, failed: 0, paged: false };
    const now = { runs: before.runs + 1, failed: before.failed + failed, paged: before.paged };
    if (!now.paged && now.runs >= OUTAGE_RUNS_TO_PAGE && now.failed >= OUTAGE_FAILURES_TO_PAGE) {
      now.paged = true;
      reached.push({ channel, failed: now.failed });
    }
    state.set(channel, now);
  }
  return reached;
}

const NAMES: Record<string, string> = { email: 'Emails', sms: 'Texts', push: 'Push notifications' };

/** The page: at most one an hour per channel (the path is the pager's once-only key), no personal details. */
export function providerOutagePage(channel: string, failed: number, now: Date): Page {
  const codes = channel === 'push' ? '' : ` Sign-in codes by ${channel === 'sms' ? 'text' : 'email'} fail meanwhile.`;
  return {
    subject: `${NAMES[channel] ?? channel} aren't going out`,
    text: `${failed} ${channel} sends in a row failed and none went through: the provider may be down or refusing (the server log says why).${codes} See docs/runbooks/email-and-sms-down.md.`,
    path: `/admin?outage=${encodeURIComponent(channel)}&hour=${now.toISOString().slice(0, 13)}`,
  };
}
