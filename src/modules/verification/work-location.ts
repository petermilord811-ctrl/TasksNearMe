import { stateOfZip } from '@/shared/us-zip';

/**
 * Where a helper works, for their background check (Checkr's `work_locations`). The provider applies that state's
 * and city's rules to the check: which records may be reported, the disclosures, and fair-chance steps before an
 * adverse decision. So it has to be the helper's own place, never a default city: their neighborhood's market, or,
 * outside the market's neighborhoods (a ZIP and city, helper-place.ts), their home ZIP's state and the city they
 * gave. Null when neither is known; the check can't start without it.
 */
export interface WorkLocation {
  /** Two-letter US state code. */
  state: string;
  /** The city, when known. */
  city: string | null;
}

export function workLocationFor(profile: {
  areaId: string | null;
  homeZip: string | null;
  homeCity: string | null;
  homeState: string | null;
  /** The market of the helper's neighborhood (`areaId`), when they have one. */
  market: { name: string; state: string } | null;
}): WorkLocation | null {
  // Outside the market's neighborhoods (their city's area, helper-place.ts, or a ZIP not placed yet) the helper works
  // where their ZIP is, not where the market is.
  const homeState = profile.homeState ?? (profile.homeZip ? stateOfZip(profile.homeZip) : null);
  if (homeState) return { state: homeState, city: profile.homeCity };
  if (profile.areaId && profile.market) return { state: profile.market.state, city: profile.market.name };
  return null;
}
