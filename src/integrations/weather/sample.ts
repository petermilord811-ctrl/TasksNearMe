import type { ForecastAlert, ForecastHour, WeatherSource } from './types';

/**
 * Development and the e2e build: a made-up forecast, the same for the same point and hour, so screens and tests never
 * call the weather service. A warm Gulf-coast year (a cool January, a hot July), a daily swing that peaks mid-afternoon,
 * and an afternoon storm on about one day in four. It forecasts 156 hours ahead, as the National Weather Service does.
 */

const HOUR_MS = 3_600_000;
export const SAMPLE_FORECAST_HOURS = 156;

function dayOfYear(date: Date): number {
  return Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000);
}

/** A small, stable number from a day and a place (0–1). */
function noise(day: number, lat: number, lng: number): number {
  const x = Math.sin(day * 12.9898 + lat * 78.233 + lng * 37.719) * 43_758.5453;
  return x - Math.floor(x);
}

export function sampleHour(at: Date, point: { lat: number; lng: number }): ForecastHour {
  // Local solar hour from the longitude (close enough for a made-up forecast).
  const localHour = (((at.getUTCHours() + point.lng / 15) % 24) + 24) % 24;
  const localDay = Math.floor((at.getTime() + (point.lng / 15) * HOUR_MS) / 86_400_000);
  const season = Math.cos((2 * Math.PI * (dayOfYear(at) - 200)) / 365);
  const mean = 70 + 12 * season;
  const swing = 9 * Math.cos((2 * Math.PI * (localHour - 15)) / 24);
  const stormy = noise(localDay, point.lat, point.lng) < 0.25;
  const afternoon = localHour >= 13 && localHour <= 19;
  const rainChance = stormy ? (afternoon ? 70 : 20) : afternoon ? 10 : 5;
  const tempF = Math.round(mean + swing - (stormy && afternoon ? 5 : 0));
  const humidity = Math.round(stormy ? 85 : 55 + 15 * Math.cos((2 * Math.PI * (localHour - 5)) / 24));
  const isDaytime = localHour >= 7 && localHour < 19;
  const shortForecast = stormy && afternoon ? 'Showers And Thunderstorms Likely' : rainChance >= 20 ? 'Chance Showers' : isDaytime ? (noise(localDay + 7, point.lat, point.lng) < 0.5 ? 'Sunny' : 'Mostly Sunny') : 'Mostly Clear';
  return { at: at.toISOString(), tempF, rainChance, humidity, windMph: stormy && afternoon ? 18 : 7, shortForecast, isDaytime };
}

export function createSampleWeather(now: () => number = Date.now): WeatherSource {
  return {
    name: 'sample',
    async hourly(point) {
      const start = Math.floor(now() / HOUR_MS) * HOUR_MS;
      return Array.from({ length: SAMPLE_FORECAST_HOURS }, (_, index) => sampleHour(new Date(start + index * HOUR_MS), point));
    },
    async alerts(): Promise<ForecastAlert[]> {
      return [];
    },
  };
}
