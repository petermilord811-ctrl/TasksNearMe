import type { CategorySlug, MapPoint, TaskWeather, WeatherAlert, WeatherCondition, WeatherFlag, WeatherHour, WeatherWeight } from '@/contracts';
import type { ForecastAlert, ForecastHour } from '@/integrations/weather/types';
import { sunsetOn } from '@/shared/sun';

/**
 * The weather for a task's time (pure; the forecast comes from `src/integrations/weather`). The hours of its window
 * (a flexible day: that day's daylight hours), a summary, what to tell a helper about them (heat, rain, storms, wind,
 * cold, working past sunset) and the alerts in effect. Outdoor work leads with it (`WEATHER_WEIGHT`).
 */

const HOUR_MS = 3_600_000;
/** At most this many hours are shown (a long window shows its first ones). */
export const MAX_WEATHER_HOURS = 14;

/** How much the weather matters for each kind of work. */
export const WEATHER_WEIGHT: Readonly<Record<CategorySlug, WeatherWeight>> = {
  'yard-cleanup': 'high',
  'moving-help': 'high',
  'furniture-assembly': 'low',
  'light-cleaning': 'low',
  'computer-help': 'none',
};

/** The National Weather Service's words for an hour, as one of the task map's conditions. */
export function conditionOf(text: string, rainChance: number): WeatherCondition {
  const words = text.toLowerCase();
  const wet = rainChance >= 30;
  if (/thunder|t-storm/.test(words) && rainChance >= 20) return 'thunderstorm';
  if (/snow|flurr|blizzard/.test(words) && wet) return 'snow';
  if (/sleet|freezing|ice pellets|wintry/.test(words) && wet) return 'sleet';
  if (/drizzle/.test(words) && wet) return 'drizzle';
  if (/shower/.test(words) && wet) return 'showers';
  if (/rain/.test(words) && wet) return 'rain';
  if (/fog|mist/.test(words)) return 'fog';
  if (/smoke|haze|dust/.test(words)) return 'haze';
  if (/wind|breezy|blustery/.test(words)) return 'wind';
  if (/overcast|mostly cloudy|^cloudy/.test(words)) return 'cloudy';
  if (/partly|mostly sunny|mostly clear|chance|slight/.test(words)) return 'partly-cloudy';
  return 'clear';
}

/** The heat index (°F), the National Weather Service's regression; the temperature itself below 80°F. */
export function heatIndexF(tempF: number, humidity: number): number {
  if (tempF < 80) return tempF;
  const simple = 0.5 * (tempF + 61 + (tempF - 68) * 1.2 + humidity * 0.094);
  if ((simple + tempF) / 2 < 80) return simple;
  const t = tempF;
  const rh = humidity;
  let index = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
  if (rh < 13 && t >= 80 && t <= 112) index -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  else if (rh > 85 && t >= 80 && t <= 87) index += ((rh - 85) / 10) * ((87 - t) / 5);
  return index;
}

/** The wind chill (°F); the temperature itself above 50°F or in a wind under 3 mph. */
export function windChillF(tempF: number, windMph: number): number {
  if (tempF > 50 || windMph < 3) return tempF;
  const v = Math.pow(windMph, 0.16);
  return 35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v;
}

/** What an hour feels like, when that's 3°F or more from the temperature. */
export function feelsLikeOf(hour: Pick<ForecastHour, 'tempF' | 'humidity' | 'windMph'>): number | undefined {
  const feels = hour.tempF >= 80 && hour.humidity !== undefined ? heatIndexF(hour.tempF, hour.humidity) : windChillF(hour.tempF, hour.windMph);
  const rounded = Math.round(feels);
  return Math.abs(rounded - hour.tempF) >= 3 ? rounded : undefined;
}

/** How much a condition changes a day's work: the summary names the most telling one. */
const IMPACT: Readonly<Record<WeatherCondition, number>> = {
  thunderstorm: 11,
  snow: 10,
  sleet: 9,
  rain: 8,
  showers: 7,
  drizzle: 6,
  fog: 5,
  wind: 4,
  haze: 3,
  cloudy: 2,
  'partly-cloudy': 1,
  clear: 0,
};

/** The condition that tells most about these hours: the strongest that lasts a quarter of them (a storm: any hour). */
export function summaryCondition(conditions: WeatherCondition[]): WeatherCondition {
  if (conditions.length === 0) return 'clear';
  const counts = new Map<WeatherCondition, number>();
  for (const condition of conditions) counts.set(condition, (counts.get(condition) ?? 0) + 1);
  const enough = Math.max(1, Math.ceil(conditions.length / 4));
  const ranked = [...counts.entries()].sort((a, b) => IMPACT[b[0]] - IMPACT[a[0]]);
  for (const [condition, count] of ranked) if (count >= enough || condition === 'thunderstorm') return condition;
  return ranked[0]![0];
}

export interface TaskWindow {
  start: Date;
  end: Date;
  flexible: boolean;
}

/** The alerts that touch the hours shown (or are open-ended). */
function alertsFor(alerts: ForecastAlert[], from: number, to: number): WeatherAlert[] {
  return alerts
    .filter((alert) => (alert.ends === undefined || Date.parse(alert.ends) > from) && (alert.onset === undefined || Date.parse(alert.onset) < to))
    .map((alert) => ({ event: alert.event, severity: alert.severity, ...(alert.ends ? { ends: alert.ends } : {}) }));
}

export function summarizeTaskWeather(input: {
  hours: ForecastHour[] | null;
  alerts: ForecastAlert[];
  window: TaskWindow;
  now: Date;
  point: MapPoint;
  source: 'nws' | 'sample';
}): TaskWeather {
  const { window, now } = input;
  if (window.end.getTime() <= now.getTime()) return { status: 'past' };
  const forecast = input.hours;
  if (!forecast || forecast.length === 0) return { status: 'unavailable' };
  const nowHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const from = Math.max(Math.floor(window.start.getTime() / HOUR_MS) * HOUR_MS, nowHour);
  const to = window.end.getTime();
  const inWindow = forecast.filter((hour) => {
    const at = Date.parse(hour.at);
    return at >= from && at < to;
  });
  // A flexible day: its daylight hours (the service marks day and night), unless it's all night.
  const daylight = window.flexible ? inWindow.filter((hour) => hour.isDaytime) : inWindow;
  const chosen = (daylight.length > 0 ? daylight : inWindow).slice(0, MAX_WEATHER_HOURS);
  if (chosen.length === 0) {
    const last = Math.max(...forecast.map((hour) => Date.parse(hour.at)));
    if (from > last) {
      // The forecast reaches as far ahead from any moment as it does now: it'll cover the start this much earlier.
      const reach = last + HOUR_MS - nowHour;
      return { status: 'later', availableFrom: new Date(Math.max(nowHour + HOUR_MS, from - reach + HOUR_MS)).toISOString(), alerts: alertsFor(input.alerts, from, to), source: input.source };
    }
    return { status: 'unavailable' };
  }
  const hours: WeatherHour[] = chosen.map((hour) => {
    const feelsLikeF = feelsLikeOf(hour);
    return {
      at: hour.at,
      tempF: hour.tempF,
      ...(feelsLikeF !== undefined ? { feelsLikeF } : {}),
      rainChance: hour.rainChance,
      windMph: hour.windMph,
      condition: conditionOf(hour.shortForecast, hour.rainChance),
      isDaytime: hour.isDaytime,
    };
  });
  const temps = hours.map((hour) => hour.tempF);
  const feels = hours.map((hour) => hour.feelsLikeF ?? hour.tempF);
  const feelsHigh = Math.max(...feels);
  const feelsLow = Math.min(...feels);
  const highF = Math.max(...temps);
  const lowF = Math.min(...temps);
  const rainChanceMax = Math.max(...hours.map((hour) => hour.rainChance));
  const windMaxMph = Math.max(...hours.map((hour) => hour.windMph));
  const condition = summaryCondition(hours.map((hour) => hour.condition));

  const flags: WeatherFlag[] = [];
  if (feelsHigh >= 90) flags.push('heat');
  if (feelsLow <= 40) flags.push('cold');
  if (hours.some((hour) => hour.condition === 'thunderstorm')) flags.push('storm');
  else if (rainChanceMax >= 40) flags.push('rain');
  if (windMaxMph >= 20) flags.push('wind');

  // Sunset, when a fixed window ends within an hour of it or after it: dark work needs light, and a later start helps.
  let sunset: string | undefined;
  if (!window.flexible) {
    const set = sunsetOn(window.start, input.point);
    if (set && window.end.getTime() >= set.getTime() - HOUR_MS && window.start.getTime() < set.getTime() + 3 * HOUR_MS) {
      sunset = set.toISOString();
      if (window.end.getTime() > set.getTime() + 15 * 60_000) flags.push('dark');
    }
  }

  return {
    status: 'forecast',
    hours,
    summary: {
      lowF,
      highF,
      ...(feelsHigh > highF ? { feelsLikeMaxF: feelsHigh } : {}),
      ...(feelsLow < lowF ? { feelsLikeMinF: feelsLow } : {}),
      rainChanceMax,
      windMaxMph,
      condition,
    },
    flags,
    alerts: alertsFor(input.alerts, from, to),
    ...(sunset ? { sunset } : {}),
    source: input.source,
  };
}
