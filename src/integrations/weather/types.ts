/** One hour of a forecast, as the source gives it (normalized to °F, mph and percent). */
export interface ForecastHour {
  /** The hour's start, UTC ISO. */
  at: string;
  tempF: number;
  /** Chance of rain, 0–100 (0 when the source leaves it out). */
  rainChance: number;
  /** Relative humidity, 0–100, when given (for the heat index). */
  humidity?: number;
  windMph: number;
  /** The source's words, e.g. "Chance Showers And Thunderstorms" (mapped to a condition by the task map). */
  shortForecast: string;
  isDaytime: boolean;
}

export interface ForecastAlert {
  event: string;
  severity: 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown';
  onset?: string;
  ends?: string;
}

/** A weather source for one point: the hours it forecasts (from now on) and the alerts in effect there. */
export interface WeatherSource {
  name: 'nws' | 'sample';
  /** Null when it can't answer (down, slow, outside its coverage). */
  hourly(point: { lat: number; lng: number }): Promise<ForecastHour[] | null>;
  /** Empty when there are none or it can't answer. */
  alerts(point: { lat: number; lng: number }): Promise<ForecastAlert[]>;
}
