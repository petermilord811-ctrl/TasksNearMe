import { stateOfZip } from '@/shared/us-zip';

/**
 * Where a helper works, for their background check (Checkr's `work_locations`). The provider applies that state's
 * and city's rules to the check: which records may be reported, the disclosures, and fair-chance steps before an
 * adverse decision. So it has to be the helper's own place, never a default city: their neighborhood's market, or,
 * while they wait for their city (a ZIP instead of a neighborhood, blueprint 01 "Scope"), their home ZIP's state
 * and the city they gave. Null when neither is known; the check can't start without it.
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
  if (profile.areaId && profile.market) return { state: profile.market.state, city: profile.market.name };
  const state = profile.homeState ?? (profile.homeZip ? stateOfZip(profile.homeZip) : null);
  return state ? { state, city: profile.homeCity } : null;
}
