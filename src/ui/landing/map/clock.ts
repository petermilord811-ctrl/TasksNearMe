import type { MapColors } from './restyle';

/**
 * The map follows the market's clock: where the sun is over the city now (a standard low-precision solar position,
 * well within a degree), what light that makes (day, the low sun's warm hour, dusk or dawn, night), and the map's
 * palette tinted for it. Pure, so it's testable; the map repaints a few times an hour.
 */

const RAD = Math.PI / 180;
/** 2000-01-01T12:00:00Z (J2000.0). */
const J2000_MS = 946_728_000_000;
const DAY_MS = 86_400_000;

/** The sun's height above the horizon (degrees; negative below it) at a place and moment. */
export function solarAltitude(date: Date, lat: number, lng: number): number {
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

export type ClockPhase = 'day' | 'golden' | 'dusk' | 'dawn' | 'night';

export interface ClockLight {
  phase: ClockPhase;
  /** 0 in daylight, 1 in full night (civil twilight takes it to 0.6, nautical twilight to 1). */
  night: number;
  /** The low sun's warmth: 1 at the horizon, fading by 10° up and by the end of civil twilight. */
  glow: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The light for a sun height, and whether the sun is on its way up (dawn) or down (dusk). */
export function clockLight(altitude: number, rising: boolean): ClockLight {
  if (altitude >= 10) return { phase: 'day', night: 0, glow: 0 };
  if (altitude >= 0) return { phase: 'golden', night: 0, glow: clamp01(1 - altitude / 10) };
  if (altitude >= -6) return { phase: rising ? 'dawn' : 'dusk', night: (-altitude / 6) * 0.6, glow: clamp01(1 + altitude / 6) };
  if (altitude >= -12) return { phase: rising ? 'dawn' : 'night', night: 0.6 + ((-altitude - 6) / 6) * 0.4, glow: 0 };
  return { phase: 'night', night: 1, glow: 0 };
}

/** The light over a place now (rising: the sun is higher in ten minutes). */
export function lightAt(date: Date, place: { lat: number; lng: number }): ClockLight {
  const now = solarAltitude(date, place.lat, place.lng);
  const soon = solarAltitude(new Date(date.getTime() + 600_000), place.lat, place.lng);
  return clockLight(now, soon > now);
}

// ---- Colors ------------------------------------------------------------------------------------------------

type Rgb = [number, number, number];

function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) return [0, 1, 2].map((i) => parseInt(hex[i]! + hex[i]!, 16) / 255) as Rgb;
  if (/^[0-9a-f]{6}$/i.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
  return null;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('')}`;

/** `a` mixed toward `b` by `t` (0–1), in Oklab (even-looking blends). Anything but hex colors comes back as `a`. */
export function mixHex(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return a;
  const amount = clamp01(t);
  if (amount === 0) return toHex(from);
  const x = toOklab(from);
  const y = toOklab(to);
  return toHex(fromOklab([x[0] + (y[0] - x[0]) * amount, x[1] + (y[1] - x[1]) * amount, x[2] + (y[2] - x[2]) * amount]));
}

/** Tints toward, per palette color: the low sun's warmth, and the night (dark theme's night is mostly the roads lit). */
const SUNSET: Partial<Record<keyof MapColors, [string, number]>> = {
  // A hint of the low sun in the light theme, no more (a stronger cast tinted the whole page peach).
  land: ['#ffcfa0', 0.08],
  building: ['#ffc996', 0.07],
  park: ['#e8cf8f', 0.05],
  water: ['#f4b893', 0.06],
  roadMajor: ['#ffad73', 0.18],
};
// The light theme's night stays light (owner, 2026-11-21: a slate tint read as a muddy page): cool, moonlit paper, a
// deeper blue for water, and warm lit roads. The dark theme's night is already dark; it only lights the roads.
const NIGHT_LIGHT: Partial<Record<keyof MapColors, [string, number]>> = {
  land: ['#d3dbec', 0.42],
  building: ['#c7d0e3', 0.42],
  park: ['#c6d9d6', 0.38],
  water: ['#86acd8', 0.38],
  civic: ['#d3dbec', 0.36],
  roadCasing: ['#b4bfd6', 0.38],
  road: ['#fff3dd', 0.35],
  roadMajor: ['#ffc589', 0.5],
};
const NIGHT_DARK: Partial<Record<keyof MapColors, [string, number]>> = {
  road: ['#5a4630', 0.45],
  roadMajor: ['#b86a30', 0.55],
  water: ['#10284a', 0.3],
};
const SUNSET_DARK: Partial<Record<keyof MapColors, [string, number]>> = {
  land: ['#3b2618', 0.18],
  roadMajor: ['#c4743a', 0.3],
};

function tint(colors: MapColors, table: Partial<Record<keyof MapColors, [string, number]>>, strength: number): MapColors {
  if (strength <= 0) return colors;
  const next = { ...colors };
  for (const [key, [target, amount]] of Object.entries(table) as [keyof MapColors, [string, number]][]) next[key] = mixHex(colors[key], target, amount * strength);
  return next;
}

/** The palette for the light outside: warm at the low sun, a moonlit wash with lit roads at night. */
export function clockColors(colors: MapColors, light: ClockLight, dark: boolean): MapColors {
  const warmed = tint(colors, dark ? SUNSET_DARK : SUNSET, light.glow);
  return tint(warmed, dark ? NIGHT_DARK : NIGHT_LIGHT, light.night);
}

/** Whether a palette color is dark (the dark theme's land): relative luminance under 0.2. */
export function isDarkColor(value: string): boolean {
  const rgb = parseHex(value);
  if (!rgb) return false;
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2;
}

/** Two lights that look the same (no repaint needed). */
export function sameLight(a: ClockLight, b: ClockLight): boolean {
  return a.phase === b.phase && Math.abs(a.night - b.night) < 0.03 && Math.abs(a.glow - b.glow) < 0.03;
}

/** The lit roads' glow over the base map at night (0 by day). */
export function roadGlowOpacity(light: ClockLight): number {
  return Math.round(light.night * 0.5 * 100) / 100;
}
