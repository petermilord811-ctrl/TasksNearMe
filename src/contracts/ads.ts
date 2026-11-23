/**
 * Sponsored ads (2026-11-22; owner: "show some ads on the right for real looks", advertising HumanizeWord and CapCue).
 * Who advertises, where each ad goes, and the campaign tags that tell the advertiser a visit came from the Neighbors
 * rail. Ads are the same for everyone: nothing about the viewer picks them. The creatives are drawn by
 * src/ui/components/ads; their words are the `ads` copy namespace.
 */

export type SponsoredAdId = 'humanizeword' | 'capcue';

export interface SponsoredAdvertiser {
  id: SponsoredAdId;
  /** The advertiser's name as its brand writes it. */
  name: string;
  /** Its site's bare domain, shown under the name. */
  domain: string;
  /** Where the ad goes: the advertiser's site, tagged with the placement. */
  href: string;
}

const tagged = (site: string, placement: string) => `${site}?utm_source=tasksnearme&utm_medium=display&utm_campaign=${placement}`;

export const SPONSORED_ADVERTISERS: Readonly<Record<SponsoredAdId, SponsoredAdvertiser>> = {
  humanizeword: { id: 'humanizeword', name: 'HumanizeWord', domain: 'humanizeword.com', href: tagged('https://humanizeword.com/', 'neighbors_rail') },
  capcue: { id: 'capcue', name: 'CapCue', domain: 'capcue.ai', href: tagged('https://capcue.ai/', 'neighbors_rail') },
};

/** Neighbors' rail on wide screens: the first ad above the rail's cards, the second pinned below them as the page scrolls. */
export const NEIGHBORS_RAIL_ADS = ['humanizeword', 'capcue'] as const satisfies readonly SponsoredAdId[];
