import { describe, expect, it } from 'vitest';
import { rankCities } from './demand';

const row = (name: string, state: string, count: number) => ({ key: name.toLowerCase(), state, name, count });

describe('cities coming next', () => {
  it('merges the waitlist and waiting helpers per city, most people first', () => {
    const ranked = rankCities([row('Dallas', 'TX', 4), row('Denver', 'CO', 6), row('Tulsa', 'OK', 3)], [row('Dallas', 'TX', 3)]);
    expect(ranked).toEqual([
      { city: 'Dallas', state: 'TX', people: 7, helpersWaiting: 3 },
      { city: 'Denver', state: 'CO', people: 6, helpersWaiting: 0 },
      { city: 'Tulsa', state: 'OK', people: 3, helpersWaiting: 0 },
    ]);
  });

  it('lists a city only once at least three people asked for it', () => {
    expect(rankCities([row('Boise', 'ID', 2)], [])).toEqual([]);
    expect(rankCities([row('Boise', 'ID', 2)], [row('Boise', 'ID', 1)])).toEqual([{ city: 'Boise', state: 'ID', people: 3, helpersWaiting: 1 }]);
  });

  it('keeps two cities of one name in different states apart', () => {
    const ranked = rankCities([row('Portland', 'OR', 5), row('Portland', 'ME', 3)], []);
    expect(ranked.map((city) => `${city.city}, ${city.state}`)).toEqual(['Portland, OR', 'Portland, ME']);
  });

  it('breaks ties by helpers waiting, then by name, and stops at the limit', () => {
    const ranked = rankCities([row('Reno', 'NV', 3), row('Mesa', 'AZ', 3), row('Waco', 'TX', 3)], [], 2);
    expect(ranked.map((city) => city.city)).toEqual(['Mesa', 'Reno']);
    const helped = rankCities([row('Reno', 'NV', 3)], [row('Waco', 'TX', 3)], 2);
    expect(helped.map((city) => city.city)).toEqual(['Waco', 'Reno']);
  });

  it('names a city by the spelling most people used', () => {
    const ranked = rankCities([{ key: 'st. louis', state: 'MO', name: 'St. Louis', count: 4 }], [{ key: 'st. louis', state: 'MO', name: 'St. louis', count: 1 }]);
    expect(ranked[0]?.city).toBe('St. Louis');
  });
});
