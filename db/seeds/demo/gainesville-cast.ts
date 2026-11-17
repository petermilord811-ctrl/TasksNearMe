import { GAINESVILLE_AREAS } from '../data/gainesville';

/**
 * The hand-written demo cast moves with the first city to Gainesville (owner, 2026-11-17; completion plan 8.6). Ready
 * here, wired in by plan.ts with the default-market flip, once dates follow each market's zone (8.1): the cast keeps its
 * ids and people, each Austin neighborhood maps to a Gainesville one of the same character, and the helpers whose
 * words name a place get Gainesville's. Addresses stay fictional (the generic street names).
 */
export const AUSTIN_TO_GAINESVILLE_AREA: Record<string, string> = {
  downtown: 'downtown',
  'east-austin': 'southeast',
  cherrywood: 'duckpond',
  'hyde-park': 'university-heights',
  'north-loop': 'midtown',
  'windsor-park': 'northeast',
  mueller: 'pleasant-street',
  crestview: 'thornebrook',
  allandale: 'millhopper',
  'travis-heights': 'golfview',
  zilker: 'southwest',
  'circle-c': 'haile-plantation',
};

/** Each Gainesville area's ZIP and the fictional streets addresses use there. */
export const GAINESVILLE_AREA_STREETS: Record<string, { zip: string; streets: string[] }> = Object.fromEntries(
  GAINESVILLE_AREAS.map((area, index) => {
    const streets = ['Example Lane', 'Sample Street', 'Placeholder Avenue', 'Demo Court', 'Specimen Drive', 'Mockup Road', 'Template Way', 'Prototype Trail'];
    return [area.slug, { zip: area.zip, streets: [0, 3, 6].map((step) => streets[(index + step) % streets.length]!) }];
  }),
);

/** The helpers' own words in Gainesville, where the Austin versions name a place (the rest stay as they are). */
export const GAINESVILLE_HELPER_TEXT: Record<string, { headline?: string; bio?: string }> = {
  h01: {
    headline: 'Thorough light cleaning and tidy assembly in Southeast Gainesville',
    bio: 'I clean apartments and houses around Southeast Gainesville and bring my own supplies. I also put together flat-pack furniture and take the packaging with me to the recycling bin.',
  },
  h03: { bio: 'I have cleaned homes in Duckpond and around Pleasant Street for years. Kitchens, bathrooms, floors and the little things like baseboards and light switches. Pet friendly.' },
  h04: { bio: 'Leaves, weeds, shrubs and storm branches, bagged and set at the curb. I also help load and unload trucks. Northeast Gainesville and beyond.' },
  h06: { headline: 'Flat-pack furniture and light cleaning around University Heights' },
  h07: { bio: 'I help with apartment moves downtown and around Midtown: loading docks, freight elevators and narrow stairs. I take apart and rebuild bed frames and tables too.' },
  h08: {
    headline: 'Yard work and furniture assembly in Northwest Gainesville',
    bio: 'Weekend yard cleanups in Thornebrook, Millhopper and nearby, plus patio sets, garage shelving and other flat-pack builds.',
  },
  h09: {
    headline: 'Light cleaning and garden tidy-ups near campus',
    bio: 'I clean homes in Golfview, University Heights and Midtown, and help with small garden jobs like weeding and raking. Reliable, quiet and quick.',
  },
  h10: { headline: 'Furniture builds and moving help in Southwest Gainesville' },
  h11: { bio: 'I help seniors and busy families with phones, tablets, printers and new laptops, and I build small flat-pack pieces. In person in Northwest Gainesville or by screen share.' },
  h12: {
    headline: 'Haile Plantation yards, builds and cleaning',
    bio: 'Based in Haile Plantation. I take care of yard cleanups, assemble furniture and do light cleaning, so one visit can cover a few chores.',
  },
  h13: {
    headline: 'Pleasant Street neighbor for cleaning and quick furniture builds',
    bio: 'I live near Pleasant Street and keep my jobs close to home. Light cleaning, move-in wipe-downs and putting together the new desk or dresser.',
  },
  h15: { headline: 'Friendly tech help and light cleaning near Midtown' },
  h16: { bio: 'Handy with flat-pack furniture and glad to help you move. I work evenings and weekends around Northeast Gainesville, Duckpond and downtown.' },
  h17: { headline: 'Calm, careful cleaning for homes in Southwest Gainesville' },
  h18: { headline: 'Moves, builds and yard work across Southwest Gainesville' },
  h19: {
    headline: 'Leaves, weeds and storm cleanup in Northwest Gainesville',
    bio: 'Retired landscaper who still likes to be outside. Raking, weeding, shrub trimming and storm branches, bagged for city pickup.',
  },
  h21: { headline: 'Home and garden tidy-ups in Thornebrook and Millhopper' },
  h22: { bio: 'I help students and young professionals move around University Heights, Midtown and the streets near UF, and rebuild what had to come apart.' },
  h24: { headline: 'Limpieza ligera / Light cleaning in Southeast Gainesville' },
  h25: {
    headline: 'New in Gainesville and ready to build and lift',
    bio: 'Just moved here from Dublin. I have assembled more flat-pack furniture than I can count and I am glad to help with moves around downtown and Pleasant Street.',
  },
  h26: {
    headline: 'Garden helper for Southwest Gainesville yards',
    bio: 'Master gardener in training. Weeding, raking and tidying beds, with yard waste bagged for the curb.',
  },
  h27: { bio: 'I fix slow computers, set up printers and routers and move files to new machines. In person around central Gainesville or remotely.' },
  h28: { headline: 'Careful assembly and light cleaning in Golfview' },
};
