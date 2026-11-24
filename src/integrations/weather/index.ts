import 'server-only';
import { devHelpersOn } from '@/shared/dev-helpers';
import { createNwsWeather } from './nws';
import { createSampleWeather } from './sample';
import type { WeatherSource } from './types';

export type { ForecastAlert, ForecastHour, WeatherSource } from './types';

/**
 * Weather port (the task map's forecast for a task's time, `src/modules/task-map`). Production asks the US National
 * Weather Service (`nws.ts`: free, keyless, public-domain data). Development and the e2e build use a made-up forecast
 * (`sample.ts`), so screens and tests never reach the service.
 */
export function createWeatherSource(env: Record<string, string | undefined> = process.env): WeatherSource {
  if (devHelpersOn(env)) return createSampleWeather();
  const site = (env.APP_URL ?? 'https://tasksnearme.com').trim().replace(/\/+$/, '');
  return createNwsWeather({ userAgent: `TasksNearMe (+${site})` });
}

let shared: WeatherSource | undefined;

/** The app's weather source, one per process so its memory of answers is shared by every request. */
export function weatherSource(): WeatherSource {
  shared ??= createWeatherSource();
  return shared;
}
