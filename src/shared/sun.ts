/**
 * Sunrise and sunset, for the browser and the server alike (the task map says when a task runs past dark). A standard
 * low-precision solar position (well within a minute or two for US latitudes), the same formula as the landing map's
 * clock; the sun is "set" when its center is 0.833° below the horizon (refraction and its radius).
 */

const RAD = Math.PI / 180;
const J2000_MS = 946_728_000_000;
const DAY_MS = 86_400_000;
const SET_ALTITUDE = -0.833;

/** The sun's height above the horizon in degrees (negative below it). */
export function sunAltitude(date: Date, lat: number, lng: number): number {
  const d = (date.getTime() - J2000_MS) / DAY_MS;
  const meanAnomaly = (357.529 + 0.98560028 * d) * RAD;
  const meanLongitude = 280.459 + 0.98564736 * d;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * d) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const siderealHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const hourAngle = (siderealHours * 15 + lng) * RAD - rightAscension;
  const sinAltitude = Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAltitude))) / RAD;
}

/** The moment between `from` and `to` (ms) where the altitude crosses the set line, by bisection; null if it doesn't. */
function crossing(from: number, to: number, point: { lat: number; lng: number }): Date | null {
  const above = (ms: number) => sunAltitude(new Date(ms), point.lat, point.lng) > SET_ALTITUDE;
  let a = from;
  let b = to;
  if (above(a) === above(b)) return null;
  const startAbove = above(a);
  for (let step = 0; step < 30 && b - a > 15_000; step += 1) {
    const middle = (a + b) / 2;
    if (above(middle) === startAbove) a = middle;
    else b = middle;
  }
  return new Date(Math.round((a + b) / 2 / 60_000) * 60_000);
}

/** Solar noon of the local day that contains `at` (from the longitude, not the clock's zone). */
function solarNoon(at: Date, lng: number): number {
  const offsetMs = (lng / 15) * 3_600_000;
  const localDay = Math.floor((at.getTime() + offsetMs) / DAY_MS);
  return localDay * DAY_MS + 12 * 3_600_000 - offsetMs;
}

/** Sunset on the day of `at` at a place; null where the sun doesn't set (polar days), never in the US's lower 48. */
export function sunsetOn(at: Date, point: { lat: number; lng: number }): Date | null {
  const noon = solarNoon(at, point.lng);
  return crossing(noon, noon + 12 * 3_600_000, point);
}

/** Sunrise on the day of `at` at a place. */
export function sunriseOn(at: Date, point: { lat: number; lng: number }): Date | null {
  const noon = solarNoon(at, point.lng);
  return crossing(noon - 12 * 3_600_000, noon, point);
}
