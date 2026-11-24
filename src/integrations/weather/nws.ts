import type { ForecastAlert, ForecastHour, WeatherSource } from './types';

/**
 * The US National Weather Service's API (api.weather.gov): free, no key, public-domain data that may be used
 * commercially; it asks for a User-Agent that names the app and a way to reach it. A point is looked up once
 * (`/points`: its forecast grid, which doesn't move), then its hourly forecast (about 6.5 days ahead, refreshed every
 * half hour) and the alerts in effect there (refreshed every 10 minutes). Answers stay in this process's memory only.
 * Points outside the US have no forecast: `hourly` answers null.
 */

const ORIGIN = 'https://api.weather.gov';
const GRID_TTL_MS = 7 * 24 * 3_600_000;
const HOURLY_TTL_MS = 30 * 60_000;
const ALERTS_TTL_MS = 10 * 60_000;
/** A failure is remembered this long, so a slow or broken service isn't asked on every page view. */
const FAILURE_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 500;

type Fetch = typeof fetch;

export interface NwsOptions {
  /** "TasksNearMe (+https://tasksnearme.com)": the service's way to reach whoever runs the app. */
  userAgent: string;
  fetch?: Fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** A point as the service wants it: at most four decimals (more answers with a redirect). */
export function nwsPoint(point: { lat: number; lng: number }): string {
  const fix = (value: number) => String(Math.round(value * 10_000) / 10_000);
  return `${fix(point.lat)},${fix(point.lng)}`;
}

/** "10 mph" or "5 to 15 mph": the higher number. */
export function parseWindMph(text: unknown): number {
  if (typeof text !== 'string') return 0;
  const numbers = text.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return numbers.length > 0 ? Math.max(...numbers) : 0;
}

const SEVERITIES = new Set(['extreme', 'severe', 'moderate', 'minor']);

function quantity(value: unknown): number | undefined {
  if (value && typeof value === 'object' && 'value' in value) {
    const raw = (value as { value: unknown }).value;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  }
  return undefined;
}

/** The hourly forecast's periods, normalized; null when the body isn't one. */
export function parseNwsHourly(body: unknown): ForecastHour[] | null {
  const periods = (body as { properties?: { periods?: unknown } } | null)?.properties?.periods;
  if (!Array.isArray(periods)) return null;
  const hours: ForecastHour[] = [];
  for (const period of periods as Record<string, unknown>[]) {
    const start = typeof period.startTime === 'string' ? Date.parse(period.startTime) : Number.NaN;
    const temperature = typeof period.temperature === 'number' ? period.temperature : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(temperature)) continue;
    const tempF = period.temperatureUnit === 'C' ? temperature * 1.8 + 32 : temperature;
    const humidity = quantity(period.relativeHumidity);
    hours.push({
      at: new Date(start).toISOString(),
      tempF: Math.round(tempF),
      rainChance: Math.max(0, Math.min(100, Math.round(quantity(period.probabilityOfPrecipitation) ?? 0))),
      ...(humidity !== undefined ? { humidity: Math.round(humidity) } : {}),
      windMph: parseWindMph(period.windSpeed),
      shortForecast: typeof period.shortForecast === 'string' ? period.shortForecast : '',
      isDaytime: period.isDaytime === true,
    });
  }
  return hours;
}

/** The alerts in effect (actual ones, not tests or exercises). */
export function parseNwsAlerts(body: unknown): ForecastAlert[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const alerts: ForecastAlert[] = [];
  for (const feature of features as { properties?: Record<string, unknown> }[]) {
    const p = feature?.properties;
    if (!p || typeof p.event !== 'string' || (p.status !== undefined && p.status !== 'Actual')) continue;
    const severity = typeof p.severity === 'string' ? p.severity.toLowerCase() : 'unknown';
    const iso = (value: unknown) => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined);
    const onset = iso(p.onset) ?? iso(p.effective);
    const ends = iso(p.ends) ?? iso(p.expires);
    alerts.push({
      event: p.event,
      severity: SEVERITIES.has(severity) ? (severity as ForecastAlert['severity']) : 'unknown',
      ...(onset ? { onset } : {}),
      ...(ends ? { ends } : {}),
    });
  }
  // One line per kind of alert (a warning can come in several overlapping parts).
  const seen = new Set<string>();
  return alerts.filter((alert) => (seen.has(alert.event) ? false : (seen.add(alert.event), true)));
}

class TtlCache<T> {
  private entries = new Map<string, { expiresAt: number; value: Promise<T> }>();
  constructor(private readonly now: () => number) {}
  get(key: string, ttl: (value: T) => number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;
    const value = load();
    const entry = { expiresAt: this.now() + FAILURE_TTL_MS, value };
    this.entries.set(key, entry);
    void value.then((resolved) => {
      if (this.entries.get(key) === entry) entry.expiresAt = this.now() + ttl(resolved);
    });
    if (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }
}

export function createNwsWeather(options: NwsOptions): WeatherSource {
  const now = options.now ?? Date.now;
  const doFetch: Fetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 6000;
  const grids = new TtlCache<string | null>(now);
  const hourlies = new TtlCache<ForecastHour[] | null>(now);
  const alertsCache = new TtlCache<ForecastAlert[] | null>(now);

  const getJson = async (url: string): Promise<unknown> => {
    // One retry: the service answers a 500 now and then for a moment.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await doFetch(url, {
          headers: { 'User-Agent': options.userAgent, Accept: 'application/geo+json' },
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        });
        if (response.ok) return await response.json();
        if (response.status < 500) return null;
      } catch {
        // Timed out or the network failed: try once more, then give up.
      }
    }
    return null;
  };

  const gridOf = (point: { lat: number; lng: number }) =>
    grids.get(nwsPoint(point), (url) => (url ? GRID_TTL_MS : FAILURE_TTL_MS), async () => {
      const body = await getJson(`${ORIGIN}/points/${nwsPoint(point)}`);
      const url = (body as { properties?: { forecastHourly?: unknown } } | null)?.properties?.forecastHourly;
      return typeof url === 'string' && url.startsWith(ORIGIN) ? url : null;
    });

  return {
    name: 'nws',
    async hourly(point) {
      const url = await gridOf(point);
      if (!url) return null;
      return hourlies.get(url, (hours) => (hours ? HOURLY_TTL_MS : FAILURE_TTL_MS), async () => parseNwsHourly(await getJson(url)));
    },
    async alerts(point) {
      const key = nwsPoint(point);
      const found = await alertsCache.get(key, (alerts) => (alerts ? ALERTS_TTL_MS : FAILURE_TTL_MS), async () => {
        const body = await getJson(`${ORIGIN}/alerts/active?point=${key}`);
        return body ? parseNwsAlerts(body) : null;
      });
      return found ?? [];
    },
  };
}
