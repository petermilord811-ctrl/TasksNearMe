import { describe, expect, it } from 'vitest';
import type { ForecastHour } from '@/integrations/weather/types';
import { conditionOf, feelsLikeOf, heatIndexF, summarizeTaskWeather, summaryCondition, WEATHER_WEIGHT, windChillF } from './weather';

const AUSTIN = { lat: 30.3479, lng: -97.7254 };
const HOUR = 3_600_000;

/** A forecast from `start` on, one hour each, with the given temperatures, rain chances and words. */
function forecast(start: string, hours: Partial<ForecastHour>[]): ForecastHour[] {
  return hours.map((hour, index) => ({
    at: new Date(Date.parse(start) + index * HOUR).toISOString(),
    tempF: 70,
    rainChance: 0,
    windMph: 5,
    shortForecast: 'Sunny',
    isDaytime: true,
    ...hour,
  }));
}

const window = (start: string, end: string, flexible = false) => ({ start: new Date(start), end: new Date(end), flexible });

describe('what the weather means for a task', () => {
  it('weighs outdoor work highest and computer help not at all', () => {
    expect(WEATHER_WEIGHT['yard-cleanup']).toBe('high');
    expect(WEATHER_WEIGHT['moving-help']).toBe('high');
    expect(WEATHER_WEIGHT['furniture-assembly']).toBe('low');
    expect(WEATHER_WEIGHT['computer-help']).toBe('none');
  });

  it('reads the service words as conditions, wet ones only with a real chance of rain', () => {
    expect(conditionOf('Showers And Thunderstorms Likely', 70)).toBe('thunderstorm');
    expect(conditionOf('Chance Rain Showers', 40)).toBe('showers');
    expect(conditionOf('Slight Chance Rain Showers', 15)).toBe('partly-cloudy');
    expect(conditionOf('Patchy Fog', 0)).toBe('fog');
    expect(conditionOf('Mostly Cloudy', 10)).toBe('cloudy');
    expect(conditionOf('Partly Sunny', 0)).toBe('partly-cloudy');
    expect(conditionOf('Sunny', 0)).toBe('clear');
    expect(conditionOf('Breezy', 0)).toBe('wind');
  });

  it('works out the heat index and the wind chill like the National Weather Service', () => {
    expect(Math.round(heatIndexF(90, 70))).toBe(106);
    expect(Math.round(heatIndexF(96, 40))).toBe(101);
    expect(heatIndexF(75, 90)).toBe(75);
    expect(Math.round(windChillF(30, 15))).toBe(19);
    expect(windChillF(60, 20)).toBe(60);
    expect(feelsLikeOf({ tempF: 90, humidity: 70, windMph: 5 })).toBe(106);
    expect(feelsLikeOf({ tempF: 72, humidity: 50, windMph: 5 })).toBeUndefined();
  });

  it('names the strongest condition that lasts, and any storm', () => {
    expect(summaryCondition(['clear', 'clear', 'clear', 'rain'])).toBe('rain');
    expect(summaryCondition(['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'cloudy'])).toBe('clear');
    expect(summaryCondition(['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'thunderstorm'])).toBe('thunderstorm');
  });

  it('is past once the window has ended, and unavailable without a forecast', () => {
    const now = new Date('2026-11-28T20:00:00Z');
    expect(summarizeTaskWeather({ hours: [], alerts: [], window: window('2026-11-28T15:00:00Z', '2026-11-28T18:00:00Z'), now, point: AUSTIN, source: 'nws' })).toEqual({ status: 'past' });
    expect(summarizeTaskWeather({ hours: null, alerts: [], window: window('2026-11-29T15:00:00Z', '2026-11-29T18:00:00Z'), now, point: AUSTIN, source: 'nws' })).toEqual({ status: 'unavailable' });
  });

  it('says when the forecast will reach a task too far ahead', () => {
    const now = new Date('2026-11-20T15:30:00Z');
    const hours = forecast('2026-11-20T15:00:00Z', Array.from({ length: 156 }, () => ({})));
    const result = summarizeTaskWeather({ hours, alerts: [], window: window('2026-12-01T15:00:00Z', '2026-12-01T18:00:00Z'), now, point: AUSTIN, source: 'nws' });
    expect(result).toEqual({ status: 'later', availableFrom: '2026-11-25T04:00:00.000Z', alerts: [], source: 'nws' });
  });

  it('sums up the window: range, what it feels like, rain, wind, and what to tell the helper', () => {
    const now = new Date('2026-11-28T12:10:00Z');
    const hours = forecast('2026-11-28T12:00:00Z', [
      { tempF: 80 },
      { tempF: 82 },
      { tempF: 84 },
      { tempF: 88, humidity: 70, shortForecast: 'Sunny' },
      { tempF: 91, humidity: 65, rainChance: 30, shortForecast: 'Chance Showers And Thunderstorms', windMph: 22 },
      { tempF: 90, humidity: 65, rainChance: 50, shortForecast: 'Showers And Thunderstorms Likely' },
      { tempF: 85 },
    ]);
    const result = summarizeTaskWeather({
      hours,
      alerts: [
        { event: 'Heat Advisory', severity: 'moderate', ends: '2026-11-29T01:00:00.000Z' },
        { event: 'Freeze Warning', severity: 'moderate', ends: '2026-11-28T14:00:00.000Z' },
        { event: 'Flood Watch', severity: 'severe', onset: '2026-11-29T06:00:00.000Z' },
      ],
      window: window('2026-11-28T15:00:00Z', '2026-11-28T18:00:00Z'),
      now,
      point: AUSTIN,
      source: 'nws',
    });
    expect(result.status).toBe('forecast');
    if (result.status !== 'forecast') return;
    expect(result.hours.map((hour) => hour.at)).toEqual(['2026-11-28T15:00:00.000Z', '2026-11-28T16:00:00.000Z', '2026-11-28T17:00:00.000Z']);
    expect(result.summary).toMatchObject({ lowF: 88, highF: 91, rainChanceMax: 50, windMaxMph: 22, condition: 'thunderstorm' });
    expect(result.summary.feelsLikeMaxF).toBeGreaterThanOrEqual(100);
    expect(result.flags).toEqual(['heat', 'storm', 'wind']);
    // Only the alerts that touch the window: not one that ended before it, nor one that starts after.
    expect(result.alerts).toEqual([{ event: 'Heat Advisory', severity: 'moderate', ends: '2026-11-29T01:00:00.000Z' }]);
    expect(result.sunset).toBeUndefined();
  });

  it('starts from the current hour once the window has begun', () => {
    const now = new Date('2026-11-28T16:20:00Z');
    const hours = forecast('2026-11-28T16:00:00Z', [{}, {}, {}, {}]);
    const result = summarizeTaskWeather({ hours, alerts: [], window: window('2026-11-28T15:00:00Z', '2026-11-28T18:00:00Z'), now, point: AUSTIN, source: 'sample' });
    expect(result.status === 'forecast' && result.hours.map((hour) => hour.at)).toEqual(['2026-11-28T16:00:00.000Z', '2026-11-28T17:00:00.000Z']);
  });

  it('shows a flexible day by its daylight hours', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    const hours = forecast('2026-11-28T06:00:00Z', Array.from({ length: 24 }, (_, index) => ({ isDaytime: index >= 7 && index < 17 })));
    const result = summarizeTaskWeather({ hours, alerts: [], window: window('2026-11-28T06:00:00Z', '2026-11-29T06:00:00Z', true), now, point: AUSTIN, source: 'nws' });
    expect(result.status === 'forecast' && result.hours.length).toBe(10);
    expect(result.status === 'forecast' && result.hours.every((hour) => hour.isDaytime)).toBe(true);
  });

  it('gives sunset and says so when the window runs past dark', () => {
    const now = new Date('2026-11-28T12:00:00Z');
    const hours = forecast('2026-11-28T12:00:00Z', Array.from({ length: 16 }, () => ({ tempF: 60 })));
    const evening = summarizeTaskWeather({ hours, alerts: [], window: window('2026-11-28T22:00:00Z', '2026-11-29T01:00:00Z'), now, point: AUSTIN, source: 'nws' });
    expect(evening.status === 'forecast' && evening.flags).toContain('dark');
    expect(evening.status === 'forecast' && Math.abs(Date.parse(evening.sunset!) - Date.parse('2026-11-28T23:31:00Z'))).toBeLessThan(5 * 60_000);
    const morning = summarizeTaskWeather({ hours, alerts: [], window: window('2026-11-28T15:00:00Z', '2026-11-28T18:00:00Z'), now, point: AUSTIN, source: 'nws' });
    expect(morning.status === 'forecast' && morning.sunset).toBeUndefined();
  });

  it('flags cold and steady rain', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const hours = forecast('2026-01-10T12:00:00Z', [{ tempF: 38, windMph: 12, rainChance: 60, shortForecast: 'Rain' }, { tempF: 39, rainChance: 70, shortForecast: 'Rain' }]);
    const result = summarizeTaskWeather({ hours, alerts: [], window: window('2026-01-10T12:00:00Z', '2026-01-10T14:00:00Z'), now, point: AUSTIN, source: 'nws' });
    expect(result.status === 'forecast' && result.flags).toEqual(['cold', 'rain']);
    expect(result.status === 'forecast' && result.summary.feelsLikeMinF).toBeLessThan(38);
  });
});
