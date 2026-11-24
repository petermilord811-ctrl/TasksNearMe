import { describe, expect, it } from 'vitest';
import { createNwsWeather, nwsPoint, parseNwsAlerts, parseNwsHourly, parseWindMph } from './nws';
import { createSampleWeather, SAMPLE_FORECAST_HOURS } from './sample';

const POINTS_BODY = { properties: { forecastHourly: 'https://api.weather.gov/gridpoints/EWX/156,94/forecast/hourly', timeZone: 'America/Chicago' } };
const HOURLY_BODY = {
  properties: {
    periods: [
      { startTime: '2026-11-28T09:00:00-06:00', temperature: 88, temperatureUnit: 'F', probabilityOfPrecipitation: { value: 20 }, relativeHumidity: { value: 70 }, windSpeed: '5 to 15 mph', shortForecast: 'Mostly Sunny', isDaytime: true },
      { startTime: '2026-11-28T10:00:00-06:00', temperature: 30, temperatureUnit: 'C', probabilityOfPrecipitation: { value: null }, windSpeed: '10 mph', shortForecast: 'Sunny', isDaytime: true },
      { startTime: 'not a date', temperature: 70 },
    ],
  },
};
const ALERTS_BODY = {
  features: [
    { properties: { event: 'Heat Advisory', severity: 'Moderate', status: 'Actual', onset: '2026-11-28T11:00:00-06:00', ends: '2026-11-28T19:00:00-06:00' } },
    { properties: { event: 'Heat Advisory', severity: 'Moderate', status: 'Actual', expires: '2026-11-28T20:00:00-06:00' } },
    { properties: { event: 'Test Message', severity: 'Unknown', status: 'Test' } },
    { properties: { event: 'Flood Watch', severity: 'Severe' } },
  ],
};

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) return new Response('not found', { status: 404 });
    const body = routes[key];
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/geo+json' } });
  }) as typeof fetch;
}

describe('the National Weather Service source', () => {
  it('asks for a point with at most four decimals', () => {
    expect(nwsPoint({ lat: 30.347912, lng: -97.725449 })).toBe('30.3479,-97.7254');
  });

  it('reads the higher wind speed from a range', () => {
    expect(parseWindMph('5 to 15 mph')).toBe(15);
    expect(parseWindMph('10 mph')).toBe(10);
    expect(parseWindMph(undefined)).toBe(0);
  });

  it('normalizes the hourly periods to UTC, °F and percent', () => {
    const hours = parseNwsHourly(HOURLY_BODY);
    expect(hours).toEqual([
      { at: '2026-11-28T15:00:00.000Z', tempF: 88, rainChance: 20, humidity: 70, windMph: 15, shortForecast: 'Mostly Sunny', isDaytime: true },
      { at: '2026-11-28T16:00:00.000Z', tempF: 86, rainChance: 0, windMph: 10, shortForecast: 'Sunny', isDaytime: true },
    ]);
    expect(parseNwsHourly({ nope: true })).toBeNull();
  });

  it('keeps actual alerts, one per event, with when they end', () => {
    expect(parseNwsAlerts(ALERTS_BODY)).toEqual([
      { event: 'Heat Advisory', severity: 'moderate', onset: '2026-11-28T17:00:00.000Z', ends: '2026-11-29T01:00:00.000Z' },
      { event: 'Flood Watch', severity: 'severe' },
    ]);
  });

  it('looks a point up once, then reads its forecast from memory until it goes stale', async () => {
    const calls: string[] = [];
    let now = 1_000_000;
    const source = createNwsWeather({
      userAgent: 'TasksNearMe (+https://example.test)',
      now: () => now,
      fetch: fakeFetch({ 'https://api.weather.gov/points/': POINTS_BODY, 'https://api.weather.gov/gridpoints/': HOURLY_BODY, 'https://api.weather.gov/alerts/': ALERTS_BODY }, calls),
    });
    const point = { lat: 30.3479, lng: -97.7254 };
    expect(await source.hourly(point)).toHaveLength(2);
    expect(await source.hourly(point)).toHaveLength(2);
    expect(await source.alerts(point)).toHaveLength(2);
    expect(calls.filter((url) => url.includes('/points/'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/gridpoints/'))).toHaveLength(1);
    // Half an hour later the forecast is asked again; the point's grid is still known.
    now += 31 * 60_000;
    await source.hourly(point);
    expect(calls.filter((url) => url.includes('/points/'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/gridpoints/'))).toHaveLength(2);
  });

  it('answers null outside its coverage and remembers a failure for a while', async () => {
    const calls: string[] = [];
    const source = createNwsWeather({ userAgent: 'x', fetch: fakeFetch({ 'https://api.weather.gov/points/': new Response('{}', { status: 404 }) }, calls) });
    expect(await source.hourly({ lat: 48.85, lng: 2.35 })).toBeNull();
    expect(await source.hourly({ lat: 48.85, lng: 2.35 })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(await source.alerts({ lat: 48.85, lng: 2.35 })).toEqual([]);
  });

  it('never throws when the network fails', async () => {
    const source = createNwsWeather({ userAgent: 'x', fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch });
    await expect(source.hourly({ lat: 30, lng: -97 })).resolves.toBeNull();
    await expect(source.alerts({ lat: 30, lng: -97 })).resolves.toEqual([]);
  });
});

describe('the sample forecast (development and tests)', () => {
  it('forecasts 156 hours from the current hour, the same each time', async () => {
    const now = Date.parse('2026-11-23T15:20:00Z');
    const source = createSampleWeather(() => now);
    const first = await source.hourly({ lat: 29.65, lng: -82.32 });
    const again = await source.hourly({ lat: 29.65, lng: -82.32 });
    expect(first).toHaveLength(SAMPLE_FORECAST_HOURS);
    expect(first![0]!.at).toBe('2026-11-23T15:00:00.000Z');
    expect(again).toEqual(first);
    for (const hour of first!) {
      expect(hour.rainChance).toBeGreaterThanOrEqual(0);
      expect(hour.rainChance).toBeLessThanOrEqual(100);
      expect(hour.tempF).toBeGreaterThan(30);
      expect(hour.tempF).toBeLessThan(110);
    }
    expect(await source.alerts({ lat: 29.65, lng: -82.32 })).toEqual([]);
  });
});
