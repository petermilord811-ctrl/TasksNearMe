import type { ActionKind, AdminMarketStatus, AdminMarketStatusAction, StaffRole } from '@/contracts';
import { isOpenMarketStatus, MARKET_STATUSES, marketStatusChange } from './coverage';

/**
 * The Markets section's buttons on the config page (completion plan 8.2), from the rules setMarketStatus applies
 * (./status.ts): only admins change a market's status (blueprint 08 §4); a market moves to either other status, each
 * confirmed with a reason; opening it (pre-launch or live) is refused where dates can't be shown in its zone yet
 * (`marketStatusChange`, completion plan 8.1), and pausing never is. Each button says what it would do: the helpers
 * it brings in (whenever the market is open after the move, those waiting there whose home market isn't this one
 * yet, as setMarketStatus does), and the waitlist emails going live sends (8.3).
 */

export const canChangeMarketStatus = (roles: readonly StaffRole[]) => roles.includes('admin');

const KINDS: Record<AdminMarketStatus, ActionKind> = { prelaunch: 'secondary', live: 'primary', paused: 'destructive' };

export interface MarketStatusFacts {
  status: string;
  timeZone: string;
  /** Helpers with a ZIP it covers, no neighborhood and a home market elsewhere: they come in whenever it's open after a move. */
  helpersToBringIn: number;
  /** Waitlist entries it covers, never told, still subscribed and without an account there: they're emailed when it goes live. */
  waitlistToTell: number;
  /** Accounts there it tells that it's live when it goes live (clients, helpers not bookable yet; never told): J-L2. */
  accountsToTell: number;
}

/** The statuses the viewer may move the market to, in order (pre-launch, live, paused); none for staff who aren't admins. */
export function marketStatusActions(roles: readonly StaffRole[], market: MarketStatusFacts): AdminMarketStatusAction[] {
  if (!canChangeMarketStatus(roles)) return [];
  return MARKET_STATUSES.filter((status) => status !== market.status).map((status) => ({
    id: status,
    kind: KINDS[status],
    enabled: marketStatusChange(market, status).ok,
    confirm: true,
    helpersIn: isOpenMarketStatus(status) ? market.helpersToBringIn : 0,
    waitlistEmails: status === 'live' ? market.waitlistToTell : 0,
    accountsTold: status === 'live' ? market.accountsToTell : 0,
  }));
}

/** Why the market can't open (pre-launch or live) now, or null: the same refusal setMarketStatus gives. */
export function openingRefusal(market: { status: string; timeZone: string }): 'time_zone_unsupported' | null {
  for (const status of ['prelaunch', 'live'] as const) {
    const change = marketStatusChange(market, status);
    if (!change.ok && change.code === 'time_zone_unsupported') return 'time_zone_unsupported';
  }
  return null;
}
