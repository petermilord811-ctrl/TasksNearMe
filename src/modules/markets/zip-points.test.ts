import { describe, expect, it } from 'vitest';
import { cityAreaName, cityAreaSlug, isCityAreaSlug } from './city-areas';
import { zipPoint, zipPointIn, zipTableOf } from './zip-points';

describe('zip points', () => {
  const table = zipTableOf('76701:3155:-9714,76704:3157:-9712,78723:3030:-9769');

  it('reads a ZIP’s center, in degrees', () => {
    expect(zipPointIn(table, '76701')).toEqual({ lat: 31.55, lng: -97.14 });
  });

  it('places a ZIP without its own area at the nearest ZIP with the same first three digits, and nothing else', () => {
    expect(zipPointIn(table, '76703')).toEqual({ lat: 31.57, lng: -97.12 });
    expect(zipPointIn(table, '99999')).toBeNull();
    expect(zipPointIn(table, '7670')).toBeNull();
  });

  it('knows real ZIPs from the Census file', async () => {
    expect(await zipPoint('32601')).toEqual({ lat: 29.65, lng: -82.33 });
    expect(await zipPoint('48201')).toEqual({ lat: 42.35, lng: -83.06 });
  });
});

describe('city areas', () => {
  it('names and slugs a city, or its ZIP when there is no city', () => {
    expect(cityAreaName({ city: 'Waco', state: 'TX', zip: '76701' })).toBe('Waco, TX');
    expect(cityAreaSlug({ city: 'Waco', state: 'TX', zip: '76701' })).toBe('city-waco-tx');
    expect(cityAreaSlug({ city: 'St. Louis', state: 'MO', zip: '63101' })).toBe('city-st-louis-mo');
    expect(cityAreaName({ city: ' ', state: 'TX', zip: '79852' })).toBe('TX 79852');
    expect(cityAreaSlug({ city: '', state: 'TX', zip: '79852' })).toBe('city-tx-79852');
  });

  it('tells a city area from a neighborhood', () => {
    expect(isCityAreaSlug('city-waco-tx')).toBe(true);
    expect(isCityAreaSlug('mueller')).toBe(false);
    expect(isCityAreaSlug(null)).toBe(false);
  });
});
