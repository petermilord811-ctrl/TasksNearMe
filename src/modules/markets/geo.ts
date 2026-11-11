import { createHash } from 'node:crypto';

/** Geography helpers for a market as center + radius, with areas as named center points. */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function inServiceArea(market: { centerLat: number; centerLng: number; serviceRadiusKm: number }, point: LatLng): boolean {
  return distanceKm({ lat: market.centerLat, lng: market.centerLng }, point) <= market.serviceRadiusKm;
}

export function nearestArea<T extends { centerLat: number; centerLng: number }>(areas: readonly T[], point: LatLng): T | null {
  let best: T | null = null;
  let bestKm = Infinity;
  for (const area of areas) {
    const km = distanceKm({ lat: area.centerLat, lng: area.centerLng }, point);
    if (km < bestKm) {
      best = area;
      bestKm = km;
    }
  }
  return best;
}

/**
 * A public point for a task: the area's center, moved up to ~300 m in a direction derived from
 * the task id. Deterministic (the same task always shows in the same place), never the address.
 */
export function fuzzedPublicPoint(areaCenter: LatLng, seed: string, maxMeters = 300): LatLng {
  const digest = createHash('sha256').update(seed).digest();
  const angle = (digest.readUInt16BE(0) / 0xffff) * 2 * Math.PI;
  const meters = (digest.readUInt16BE(2) / 0xffff) * maxMeters;
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const dLng = (meters * Math.sin(angle)) / (111_320 * Math.cos((areaCenter.lat * Math.PI) / 180));
  return { lat: Number((areaCenter.lat + dLat).toFixed(4)), lng: Number((areaCenter.lng + dLng).toFixed(4)) };
}
