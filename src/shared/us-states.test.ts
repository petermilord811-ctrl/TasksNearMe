import { describe, expect, it } from 'vitest';
import { DIRECTORY_STATES, stateCodeOfSlug, statePageIndexable, stateSlugOf } from './us-states';
import { US_STATE_CODES } from './us-zip';

describe('directory states', () => {
  it('covers the 50 states and DC, each once, with unique slugs', () => {
    expect(DIRECTORY_STATES).toHaveLength(51);
    expect(new Set(DIRECTORY_STATES.map(([code]) => code)).size).toBe(51);
    expect(new Set(DIRECTORY_STATES.map(([, slug]) => slug)).size).toBe(51);
    for (const [code] of DIRECTORY_STATES) expect(US_STATE_CODES).toContain(code);
  });

  it('maps slugs and codes both ways, and nothing else', () => {
    expect(stateCodeOfSlug('florida')).toBe('FL');
    expect(stateCodeOfSlug('new-york')).toBe('NY');
    expect(stateSlugOf('dc')).toBe('district-of-columbia');
    expect(stateCodeOfSlug('puerto-rico')).toBeNull();
    expect(stateSlugOf('PR')).toBeNull();
    expect(stateCodeOfSlug('gainesville')).toBeNull();
  });

  it('indexes a state page only with an open city or real demand', () => {
    expect(statePageIndexable({ openCities: 1, peopleWaiting: 0 })).toBe(true);
    expect(statePageIndexable({ openCities: 0, peopleWaiting: 3 })).toBe(true);
    expect(statePageIndexable({ openCities: 0, peopleWaiting: 0 })).toBe(false);
  });
});
