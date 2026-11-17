import { describe, expect, it } from 'vitest';
import { AUSTIN_AREAS } from '../../db/seeds/data/austin';
import { GAINESVILLE_AREAS } from '../../db/seeds/data/gainesville';
import { AUSTIN_TO_GAINESVILLE_AREA, GAINESVILLE_AREA_STREETS, GAINESVILLE_HELPER_TEXT } from '../../db/seeds/demo/gainesville-cast';
import { DEMO_CLIENTS, DEMO_HELPERS } from '../../db/seeds/demo/people';

/** Austin's places that must not survive in the cast's Gainesville words. */
const AUSTIN_PLACES = /Austin|Mueller|Hyde Park|Zilker|Crestview|Travis Heights|Cherrywood|Windsor Park|Allandale|North Loop|Circle C|Barton|Bouldin|West Campus|south of the river/;

describe("the demo cast's move to Gainesville (plan 8.6)", () => {
  it('maps every Austin area to a different Gainesville area, all of them used', () => {
    expect(Object.keys(AUSTIN_TO_GAINESVILLE_AREA).sort()).toEqual(AUSTIN_AREAS.map((area) => area.slug).sort());
    expect(Object.values(AUSTIN_TO_GAINESVILLE_AREA).sort()).toEqual(GAINESVILLE_AREAS.map((area) => area.slug).sort());
  });

  it('gives every Gainesville area a 326 ZIP and fictional streets', () => {
    for (const area of GAINESVILLE_AREAS) {
      expect(GAINESVILLE_AREA_STREETS[area.slug]!.zip, area.slug).toMatch(/^326\d\d$/);
      expect(GAINESVILLE_AREA_STREETS[area.slug]!.streets, area.slug).toHaveLength(3);
    }
  });

  it("leaves no Austin place in a helper's Gainesville headline or bio", () => {
    for (const helper of DEMO_HELPERS) {
      const text = { ...{ headline: helper.headline, bio: helper.bio }, ...GAINESVILLE_HELPER_TEXT[helper.key] };
      expect(`${text.headline} ${text.bio}`, helper.key).not.toMatch(AUSTIN_PLACES);
    }
    for (const key of Object.keys(GAINESVILLE_HELPER_TEXT)) expect(DEMO_HELPERS.map((helper) => helper.key)).toContain(key);
  });

  it('keeps every client and helper in a mapped area', () => {
    for (const person of [...DEMO_CLIENTS, ...DEMO_HELPERS]) expect(AUSTIN_TO_GAINESVILLE_AREA[person.area], person.key).toBeDefined();
  });
});
