/**
 * Which plants the hero's town grows: the market's own region. `texas` is Austin's (the Hill Country: oaks and
 * cedars, palms, agaves and cacti, bluebonnets in spring); `florida` is Gainesville's (north Florida: live oaks hung
 * with Spanish moss, tall pines, cabbage palms and saw palmetto, azaleas and dogwoods, coreopsis in spring; no cacti).
 * The houses, roads and pins are the same town either way; only what grows differs.
 */
export const TOWN_FLORAS = ['texas', 'florida'] as const;
export type TownFlora = (typeof TOWN_FLORAS)[number];

/** A market's town flora, from its state (`MarketView.state`, e.g. "FL"). Anywhere else keeps Austin's for now. */
export function floraFor(market: { state: string }): TownFlora {
  const state = market.state.trim().toUpperCase();
  return state === 'FL' || state === 'FLORIDA' ? 'florida' : 'texas';
}
