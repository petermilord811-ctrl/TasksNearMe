import { describe, expect, it } from 'vitest';
import { clockColors, clockLight, isDarkColor, lightAt, mixHex, roadGlowOpacity, sameLight, solarAltitude } from './clock';
import type { MapColors } from './restyle';

const GAINESVILLE = { lat: 29.65, lng: -82.32 };

describe('the sun over the market', () => {
  it('stands highest at the June solstice’s noon and lowest at December’s', () => {
    // Solar noon in Gainesville is about 17:30 UTC (82.3° west).
    expect(solarAltitude(new Date('2026-06-21T17:31:00Z'), GAINESVILLE.lat, GAINESVILLE.lng)).toBeCloseTo(83.8, 0);
    expect(solarAltitude(new Date('2026-12-21T17:26:00Z'), GAINESVILLE.lat, GAINESVILLE.lng)).toBeCloseTo(36.9, 0);
  });

  it('is well below the horizon at midnight', () => {
    expect(solarAltitude(new Date('2026-06-21T05:30:00Z'), GAINESVILLE.lat, GAINESVILLE.lng)).toBeLessThan(-30);
  });

  it('says dusk in the evening and dawn in the morning', () => {
    // 2026-11-20: sunset in Gainesville is about 22:32 UTC (5:32 pm), sunrise about 11:58 UTC.
    expect(lightAt(new Date('2026-11-20T22:45:00Z'), GAINESVILLE).phase).toBe('dusk');
    expect(lightAt(new Date('2026-11-20T11:48:00Z'), GAINESVILLE).phase).toBe('dawn');
    expect(lightAt(new Date('2026-11-20T18:00:00Z'), GAINESVILLE).phase).toBe('day');
    expect(lightAt(new Date('2026-11-21T03:00:00Z'), GAINESVILLE).phase).toBe('night');
  });
});

describe('the light for a sun height', () => {
  it('runs from day through the low sun’s glow and twilight to night', () => {
    expect(clockLight(20, false)).toEqual({ phase: 'day', night: 0, glow: 0 });
    expect(clockLight(5, false)).toEqual({ phase: 'golden', night: 0, glow: 0.5 });
    const dusk = clockLight(-3, false);
    expect(dusk.phase).toBe('dusk');
    expect(dusk.night).toBeCloseTo(0.3, 5);
    expect(dusk.glow).toBeCloseTo(0.5, 5);
    expect(clockLight(-3, true).phase).toBe('dawn');
    expect(clockLight(-9, false).night).toBeCloseTo(0.8, 5);
    expect(clockLight(-20, false)).toEqual({ phase: 'night', night: 1, glow: 0 });
  });

  it('lights the roads only at night', () => {
    expect(roadGlowOpacity(clockLight(20, false))).toBe(0);
    expect(roadGlowOpacity(clockLight(-20, false))).toBe(0.5);
    expect(sameLight(clockLight(20, false), clockLight(30, false))).toBe(true);
    expect(sameLight(clockLight(-2, false), clockLight(-5, false))).toBe(false);
  });
});

const light: MapColors = {
  land: '#efe5d7',
  water: '#a3d3ee',
  park: '#d6eaca',
  road: '#ffffff',
  roadMajor: '#f8caab',
  roadCasing: '#dfd0bd',
  label: '#786d63',
  labelStrong: '#4d433a',
  waterLabel: '#3b6f96',
  building: '#e8ded1',
  civic: '#f1e2c8',
};

const luminance = (hex: string) => {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};

describe('the map’s palette for the light', () => {
  it('mixes colors evenly, and leaves anything but hex alone', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000', '#fff', 1)).toBe('#ffffff');
    const middle = mixHex('#000000', '#ffffff', 0.5);
    expect(middle.slice(1, 3)).toBe(middle.slice(3, 5));
    expect(parseInt(middle.slice(1, 3), 16)).toBeGreaterThan(0x55);
    expect(parseInt(middle.slice(1, 3), 16)).toBeLessThan(0x70);
    expect(mixHex('oklch(0.5 0.1 200)', '#fff', 0.5)).toBe('oklch(0.5 0.1 200)');
  });

  it('keeps the day’s palette by day, and dims the land with the roads lit at night', () => {
    expect(clockColors(light, clockLight(30, false), false)).toEqual(light);
    const night = clockColors(light, clockLight(-20, false), false);
    expect(luminance(night.land)).toBeLessThan(luminance(light.land) * 0.8);
    expect(luminance(night.land)).toBeGreaterThan(0.3);
    expect(night.roadMajor).not.toBe(light.roadMajor);
    // Labels keep their colors (they stay readable).
    expect(night.labelStrong).toBe(light.labelStrong);
  });

  it('warms the land at the low sun', () => {
    const warm = clockColors(light, clockLight(1, false), false);
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    expect(red(warm.land) - blue(warm.land)).toBeGreaterThan(red(light.land) - blue(light.land));
  });

  it('tells the dark theme apart', () => {
    expect(isDarkColor('#1a1714')).toBe(true);
    expect(isDarkColor('#efe5d7')).toBe(false);
    expect(isDarkColor('not a color')).toBe(false);
  });
});
